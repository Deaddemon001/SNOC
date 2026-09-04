"""
Smart NOC v0.5.6.6 - Alert Engine
Monitors syslog messages and ping state changes, then sends email, Discord, and Telegram alerts based on rules.
Rules: if Host = X AND message contains Y -> send alert via configured channels.
"""
import smtplib, threading, time, json, re, datetime, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib import request as _urlrequest
from urllib import parse as _urlparse
import noc_config as cfg
from noc_config import execute_db, query_db, get_db_connection

ALERT_DB = cfg.AUTH_DB  # reuse auth.db for alert rules

# ── DATABASE INITIALIZATION ───────────────────────────────────────────────────
def init_alert_db():
    pk = "SERIAL"
    
    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS email_config (
        id       INTEGER PRIMARY KEY,
        smtp_host TEXT DEFAULT '',
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT DEFAULT '',
        smtp_pass TEXT DEFAULT '',
        from_addr TEXT DEFAULT '',
        use_tls   INTEGER DEFAULT 1,
        enabled   INTEGER DEFAULT 0
    )''')
    
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM email_config")
    if not rows or rows[0]['count'] == 0:
        execute_db(ALERT_DB, "INSERT INTO email_config (id, smtp_host, smtp_port, smtp_user, smtp_pass, from_addr, use_tls, enabled) VALUES (1,'',587,'','','',1,0)")

    execute_db(ALERT_DB, f'''CREATE TABLE IF NOT EXISTS alert_rules (
        id            {pk},
        name          TEXT,
        source_type   TEXT DEFAULT 'syslog',
        host_match    TEXT DEFAULT '',
        exclude_hosts TEXT DEFAULT '',
        text_match    TEXT DEFAULT '',
        to_email      TEXT DEFAULT '',
        notify_via    TEXT DEFAULT 'both',
        enabled       INTEGER DEFAULT 1,
        created_at    TEXT,
        hit_count     INTEGER DEFAULT 0,
        last_hit      TEXT
    )''')

    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS email_template (
        id      INTEGER PRIMARY KEY,
        subject TEXT,
        body    TEXT
    )''')
    
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM email_template")
    if not rows or rows[0]['count'] == 0:
        default_subject = '[Smart NOC Alert] {rule_name} - {olt_host}'
        default_body = 'Smart NOC Alert\nRule: {rule_name}\nOLT: {olt_host}\nTime: {time}\nMessage: {message}\nSeverity: {severity}\n\nSent by Smart NOC v0.5.6.6'
        execute_db(ALERT_DB, "INSERT INTO email_template (id, subject, body) VALUES (1,%s,%s)", (default_subject, default_body))

    execute_db(ALERT_DB, f'''CREATE TABLE IF NOT EXISTS alert_log (
        id         {pk},
        timestamp  TEXT,
        rule_id    INTEGER,
        rule_name  TEXT,
        host       TEXT,
        message    TEXT,
        to_email   TEXT,
        sent       INTEGER DEFAULT 0,
        error      TEXT DEFAULT ''
    )''')
    execute_db(ALERT_DB, "CREATE INDEX IF NOT EXISTS idx_alert_log_timestamp ON alert_log (timestamp DESC)")

    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS telegram_config (
        id        INTEGER PRIMARY KEY,
        bot_token TEXT DEFAULT '',
        chat_id   TEXT DEFAULT '',
        enabled   INTEGER DEFAULT 0
    )''')
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM telegram_config")
    if not rows or rows[0]['count'] == 0:
        execute_db(ALERT_DB, "INSERT INTO telegram_config (id, bot_token, chat_id, enabled) VALUES (1,'','',0)")
    
    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS discord_config (
        id        INTEGER PRIMARY KEY,
        webhook_url TEXT DEFAULT '',
        enabled   INTEGER DEFAULT 0
    )''')
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM discord_config")
    if not rows or rows[0]['count'] == 0:
        execute_db(ALERT_DB, "INSERT INTO discord_config (id, webhook_url, enabled) VALUES (1,'',0)")
    
    print("Alert DB ready.")


init_alert_db()

# ── STATUS INDICATOR HELPERS ──────────────────────────────────────────────────
def detect_status_indicator(status='', message='', severity=''):
    """
    Returns a dictionary with visual indicators (emojis, labels, colors)
    based on status, message content, and severity.
    """
    status_str = (status or '').strip().lower()
    msg_str = (message or '').strip()
    sev_str = (severity or '').strip().lower()

    # Direct status check (e.g. from ping monitor)
    if status_str in ('online', 'reachable', 'up', 'linkup', 'recovered', 'normal', 'restored', 'cleared'):
        return {
            'dot': '🟢',
            'status': 'ONLINE' if status_str == 'online' else ('UP' if status_str == 'up' else 'REACHABLE'),
            'color_hex': '#28a745',
            'color_int': 0x28A745,
            'badge_bg': '#d4edda',
            'badge_color': '#155724',
            'is_healthy': True,
        }
    elif status_str in ('offline', 'unreachable', 'down', 'linkdown', 'critical', 'fail', 'failed', 'los', 'dying gasp'):
        return {
            'dot': '🔴',
            'status': 'OFFLINE' if status_str == 'offline' else ('DOWN' if status_str == 'down' else 'UNREACHABLE'),
            'color_hex': '#dc3545',
            'color_int': 0xDC3545,
            'badge_bg': '#f8d7da',
            'badge_color': '#721c24',
            'is_healthy': False,
        }

    # Keyword analysis on message with whole-word regex
    # First, strip compound tag phrases like "Updown" or "Up/Down" so "Updown" doesn't falsely match "down"
    clean_msg = re.sub(r'up[\s/_-]?down', '', msg_str, flags=re.IGNORECASE)

    has_down = bool(re.search(
        r'\b(down|offline|unreachable|linkdown|critical|los|loss of signal|dying gasp|fail|failed|power down|disconnected)\b',
        clean_msg, re.IGNORECASE
    )) or sev_str in ('critical', 'alert', 'emergency')

    has_up = bool(re.search(
        r'\b(up|online|reachable|linkup|link up|recovered|normal|restored|cleared|success|power on|connected)\b',
        clean_msg, re.IGNORECASE
    ))

    if has_down and not has_up:
        return {
            'dot': '🔴',
            'status': 'DOWN' if re.search(r'\bdown\b', clean_msg, re.I) else ('OFFLINE' if 'offline' in clean_msg.lower() else 'CRITICAL'),
            'color_hex': '#dc3545',
            'color_int': 0xDC3545,
            'badge_bg': '#f8d7da',
            'badge_color': '#721c24',
            'is_healthy': False,
        }
    elif has_up and not has_down:
        return {
            'dot': '🟢',
            'status': 'UP' if re.search(r'\bup\b', clean_msg, re.I) else ('ONLINE' if 'online' in clean_msg.lower() else 'NORMAL'),
            'color_hex': '#28a745',
            'color_int': 0x28A745,
            'badge_bg': '#d4edda',
            'badge_color': '#155724',
            'is_healthy': True,
        }
    elif has_down:
        return {
            'dot': '🔴',
            'status': 'DOWN',
            'color_hex': '#dc3545',
            'color_int': 0xDC3545,
            'badge_bg': '#f8d7da',
            'badge_color': '#721c24',
            'is_healthy': False,
        }
    elif has_up:
        return {
            'dot': '🟢',
            'status': 'UP',
            'color_hex': '#28a745',
            'color_int': 0x28A745,
            'badge_bg': '#d4edda',
            'badge_color': '#155724',
            'is_healthy': True,
        }

    # Default neutral
    return {
        'dot': '🔵',
        'status': 'ALERT',
        'color_hex': '#007bff',
        'color_int': 0x007BFF,
        'badge_bg': '#cce5ff',
        'badge_color': '#004085',
        'is_healthy': True,
    }


def generate_html_email(rule_name, host, source_ip, time_str, message, severity, status_info):
    dot = status_info['dot']
    status_label = status_info['status']
    color_hex = status_info['color_hex']
    badge_bg = status_info['badge_bg']
    badge_color = status_info['badge_color']

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333; }}
  .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-top: 5px solid {color_hex}; }}
  .header {{ padding: 20px 24px; background: #fafbfc; border-bottom: 1px solid #e1e4e8; display: flex; align-items: center; justify-content: space-between; }}
  .title {{ font-size: 18px; font-weight: 700; margin: 0; color: #1f2328; }}
  .badge {{ display: inline-block; padding: 4px 10px; font-size: 13px; font-weight: 700; border-radius: 20px; background-color: {badge_bg}; color: {badge_color}; }}
  .body {{ padding: 24px; }}
  .msg-box {{ background: #f8f9fa; border-left: 4px solid {color_hex}; padding: 12px 16px; margin: 16px 0; font-family: monospace; font-size: 13px; word-break: break-word; color: #24292f; border-radius: 0 4px 4px 0; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }}
  th, td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid #eaecef; }}
  th {{ width: 30%; color: #57606a; font-weight: 600; }}
  td {{ color: #24292f; font-weight: 500; }}
  .footer {{ padding: 16px 24px; background: #f6f8fa; border-top: 1px solid #e1e4e8; font-size: 12px; color: #6e7781; text-align: center; }}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="title">{dot} Smart NOC Alert</div>
    <div class="badge">{dot} {status_label}</div>
  </div>
  <div class="body">
    <p style="margin:0 0 12px 0; font-size: 15px; font-weight:600; color: #24292f;">Rule Triggered: <span style="color:{color_hex};">{rule_name}</span></p>
    <div class="msg-box">{message}</div>
    <table>
      <tr><th>Host / OLT</th><td><strong>{host}</strong> {f'({source_ip})' if source_ip and source_ip != host else ''}</td></tr>
      <tr><th>Timestamp</th><td>{time_str}</td></tr>
      <tr><th>Severity</th><td><span style="text-transform: uppercase;">{severity or 'N/A'}</span></td></tr>
      <tr><th>Status</th><td>{dot} {status_label}</td></tr>
    </table>
  </div>
  <div class="footer">
    Sent automatically by <strong>Smart NOC</strong> Alert Engine
  </div>
</div>
</body>
</html>"""
    return html


# ── EMAIL SENDER ──────────────────────────────────────────────────────────────
def get_email_config():
    rows = query_db(ALERT_DB, "SELECT * FROM email_config WHERE id=1")
    return rows[0] if rows else {}


def send_email(to_addr, subject, body, cfg_override=None, html_body=None):
    ec = cfg_override or get_email_config()
    if not ec.get('enabled') or not ec.get('smtp_host'):
        return False, "Email not configured or disabled"
    try:
        msg = MIMEMultipart('alternative')
        msg['From']    = ec['from_addr'] or ec['smtp_user']
        msg['To']      = to_addr
        msg['Subject'] = subject

        # Attach plain text
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Attach HTML version if available
        if html_body:
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        if ec.get('use_tls'):
            server = smtplib.SMTP(ec['smtp_host'], int(ec['smtp_port']), timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(ec['smtp_host'], int(ec['smtp_port']), timeout=15)

        server.login(ec['smtp_user'], ec['smtp_pass'])
        server.sendmail(msg['From'], to_addr, msg.as_string())
        server.quit()
        return True, "Sent"
    except Exception as e:
        return False, str(e)


# ── TELEGRAM SENDER ───────────────────────────────────────────────────────────
def get_telegram_config():
    rows = query_db(ALERT_DB, "SELECT id,bot_token,chat_id,enabled FROM telegram_config WHERE id=1")
    return rows[0] if rows else {}


def _telegram_request(url, data, context=None):
    req = _urlrequest.Request(url, data=data, method="POST")
    with _urlrequest.urlopen(req, timeout=10, context=context) as resp:
        return resp.read().decode("utf-8", errors="replace")


def send_telegram(bot_token, chat_id, text, parse_mode="HTML"):
    if not bot_token or not chat_id:
        return False, "Telegram not configured"
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        data = _urlparse.urlencode(payload).encode("utf-8")
        try:
            raw = _telegram_request(url, data)
        except ssl.SSLCertVerificationError:
            insecure_ctx = ssl._create_unverified_context()
            raw = _telegram_request(url, data, context=insecure_ctx)
        except Exception as inner_exc:
            if 'CERTIFICATE_VERIFY_FAILED' in str(inner_exc).upper():
                insecure_ctx = ssl._create_unverified_context()
                raw = _telegram_request(url, data, context=insecure_ctx)
            else:
                raise
        if '"ok":true' in raw or '"ok": true' in raw:
            return True, "Sent"
        return False, raw[:200]
    except Exception as e:
        return False, str(e)


# ── DISCORD SENDER ────────────────────────────────────────────────────────────
def get_discord_config():
    rows = query_db(ALERT_DB, "SELECT id,webhook_url,enabled FROM discord_config WHERE id=1")
    return rows[0] if rows else {}


def _discord_request(url, data, context=None):
    req = _urlrequest.Request(url, data=data, method="POST")
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', 'SmartNOC/0.5')
    with _urlrequest.urlopen(req, timeout=10, context=context) as resp:
        return resp.read().decode("utf-8", errors="replace"), resp.getcode()


def send_discord(webhook_url, text, embed=None):
    if not webhook_url:
        return False, "Discord not configured"
    try:
        payload = {}
        if embed:
            payload["embeds"] = [embed]
            if text:
                payload["content"] = text
        else:
            payload["content"] = text

        data = json.dumps(payload).encode("utf-8")
        try:
            raw, code = _discord_request(webhook_url, data)
        except ssl.SSLCertVerificationError:
            insecure_ctx = ssl._create_unverified_context()
            raw, code = _discord_request(webhook_url, data, context=insecure_ctx)
        except Exception as inner_exc:
            if 'CERTIFICATE_VERIFY_FAILED' in str(inner_exc).upper():
                insecure_ctx = ssl._create_unverified_context()
                raw, code = _discord_request(webhook_url, data, context=insecure_ctx)
            else:
                raise
        return True, "Sent"
    except Exception as e:
        return False, str(e)


# ── EMAIL TEMPLATE ───────────────────────────────────────────────────────────
def get_email_template():
    rows = query_db(ALERT_DB, "SELECT subject, body FROM email_template WHERE id=1")
    if rows:
        return rows[0]['subject'], rows[0]['body']
    return '{status_dot} [Smart NOC Alert] {rule_name} - {olt_host}', '{status_dot} Smart NOC Alert\nStatus: {status}\nRule: {rule_name}\nOLT: {olt_host}\nTime: {time}\nMessage: {message}\nSeverity: {severity}\n\nSent by Smart NOC v0.5.6.6'


def save_email_template(subject, body):
    execute_db(ALERT_DB, "UPDATE email_template SET subject=%s, body=%s WHERE id=1",
                 (subject, body))


def render_template(tpl, vars_dict):
    result = tpl
    for k, v in vars_dict.items():
        result = result.replace('{' + k + '}', str(v))
    return result


# ── RULE MATCHING ─────────────────────────────────────────────────────────────
def get_rules():
    return query_db(ALERT_DB, "SELECT * FROM alert_rules WHERE enabled=1")


def _parse_rule_terms(value):
    return [item.strip().lower() for item in re.split(r'[\n,]', value or '') if item.strip()]


def _host_excluded(rule, hostname):
    host = (hostname or '').strip().lower()
    if not host:
        return False
    for excluded in _parse_rule_terms(rule.get('exclude_hosts') or ''):
        if excluded in host:
            return True
    return False


def match_rule(rule, hostname, message, source_type='syslog', source_ip=''):
    """Return True if the event matches this rule."""
    if (rule.get('source_type') or 'syslog') != source_type:
        return False

    host_match = (rule.get('host_match') or '').strip()
    text_match = (rule.get('text_match') or '').strip()
    hostname = hostname or ''
    source_ip = source_ip or ''

    if _host_excluded(rule, hostname) or (source_ip and _host_excluded(rule, source_ip)):
        return False

    if host_match:
        hm_lower = host_match.lower()
        if hm_lower not in hostname.lower() and (not source_ip or hm_lower not in source_ip.lower()):
            return False

    if text_match and source_type == 'syslog':
        keywords = [k.strip() for k in re.split(r'[\n,]', text_match) if k.strip()]
        msg_lower = message.lower()
        if not all(k.lower() in msg_lower for k in keywords):
            return False

    return True


def build_alert_payloads(rule, hostname, source_ip, message, timestamp, severity='', status=''):
    """
    Builds customized subject, plain body, HTML email body, Discord embed, and Telegram text
    with status indicators (green/red dots).
    """
    status_info = detect_status_indicator(status=status, message=message, severity=severity)
    dot = status_info['dot']
    status_label = status_info['status']

    subj_tpl, body_tpl = get_email_template()
    vars_dict = {
        'status_dot': dot,
        'status':     status_label,
        'rule_name':  rule['name'],
        'olt_host':   hostname,
        'source_ip':  source_ip or '',
        'time':       timestamp,
        'message':    message,
        'severity':   severity or 'N/A',
        'host_match': rule.get('host_match') or '(any)',
        'text_match': rule.get('text_match') or '',
    }

    # Ensure subject starts with dot if not already in template
    subject = render_template(subj_tpl, vars_dict)
    if '{status_dot}' not in subj_tpl and not subject.startswith(('🟢', '🔴', '🟡', '🔵')):
        subject = f"{dot} {subject}"

    plain_body = render_template(body_tpl, vars_dict)
    html_body = generate_html_email(rule['name'], hostname, source_ip, timestamp, message, severity, status_info)

    # Discord Embed
    discord_embed = {
        "title": f"{dot} [{status_label}] {rule['name']}",
        "description": f"**Message:** {message}",
        "color": status_info['color_int'],
        "fields": [
            {"name": "Host / Target", "value": f"`{hostname}`" + (f" (`{source_ip}`)" if source_ip and source_ip != hostname else ""), "inline": True},
            {"name": "Severity", "value": (severity or 'N/A').upper(), "inline": True},
            {"name": "Timestamp", "value": timestamp, "inline": True},
        ],
        "footer": {"text": "Smart NOC Network Operations Center"}
    }

    # Telegram Formatted Text
    tg_text = (
        f"<b>{dot} [{status_label}] Smart NOC Alert</b>\n\n"
        f"<b>Rule:</b> {rule['name']}\n"
        f"<b>Host:</b> <code>{hostname}</code>\n"
        f"<b>Severity:</b> {severity or 'N/A'}\n"
        f"<b>Time:</b> {timestamp}\n"
        f"<b>Message:</b>\n<code>{message}</code>"
    )

    return subject, plain_body, html_body, discord_embed, tg_text


def build_alert_email(rule, hostname, source_ip, message, timestamp, severity=''):
    subject, plain_body, html_body, _, _ = build_alert_payloads(rule, hostname, source_ip, message, timestamp, severity)
    return subject, plain_body


def _should_send_channel(notify_via, channel):
    """
    Checks if a channel (email, telegram, discord) is selected by notify_via.
    'both' and 'all' mean all configured channels.
    """
    nv = (notify_via or 'both').strip().lower()
    if nv in ('both', 'all', 'any', ''):
        return True
    parts = [p.strip() for p in nv.replace('+', ',').split(',') if p.strip()]
    return channel in parts or ('mail' in nv and channel == 'email') or (channel in nv)


# ── ALERT DISPATCHING (GLOBAL / DIRECT) ───────────────────────────────────────
def process_alert(hostname, message, timestamp):
    """Called by syslog_server for every incoming message"""
    rules = get_rules()
    if not rules:
        return

    ec = get_email_config()
    tc = get_telegram_config()
    dc = get_discord_config()
    email_enabled   = bool(ec.get('enabled'))
    tg_enabled      = bool(tc.get('enabled')) and bool(tc.get('bot_token')) and bool(tc.get('chat_id'))
    discord_enabled = bool(dc.get('enabled')) and bool(dc.get('webhook_url'))
    if not email_enabled and not tg_enabled and not discord_enabled:
        return

    for rule in rules:
        if not match_rule(rule, hostname, message, 'syslog'):
            continue

        subject, plain_body, html_body, discord_embed, tg_text = build_alert_payloads(
            rule, hostname, '', message, timestamp, severity='', status=''
        )
        sent = False
        errors = []
        notify_via = (rule.get('notify_via') or 'both').strip()
        sent_channels = []

        # ── 1. Email Channel ──────────────────────────────────────────
        rule_emails = [em.strip() for em in re.split(r'[\n,;]', rule.get('to_email') or '') if em.strip()]
        if email_enabled and _should_send_channel(notify_via, 'email') and rule_emails:
            for recipient in rule_emails:
                ok, err = send_email(recipient, subject, plain_body, ec, html_body=html_body)
                if ok:
                    sent = True
                    sent_channels.append(f"Email:{recipient}")
                else:
                    errors.append(f"Email({recipient}): {err}")

        # ── 2. Telegram Channel ───────────────────────────────────────
        if tg_enabled and _should_send_channel(notify_via, 'telegram'):
            ok, err = send_telegram(tc.get('bot_token', ''), tc.get('chat_id', ''), tg_text)
            if ok:
                sent = True
                sent_channels.append("Telegram")
            else:
                errors.append(f"Telegram: {err}")

        # ── 3. Discord Channel ────────────────────────────────────────
        if discord_enabled and _should_send_channel(notify_via, 'discord'):
            ok, err = send_discord(dc.get('webhook_url', ''), '', embed=discord_embed)
            if ok:
                sent = True
                sent_channels.append("Discord")
            else:
                errors.append(f"Discord: {err}")

        # ── 4. Logging & Counters ─────────────────────────────────────
        now = time.strftime('%Y-%m-%dT%H:%M:%S')
        recipients_logged = ', '.join(sent_channels) if sent_channels else (rule.get('to_email') or 'None')
        error_msg = '; '.join(errors) if errors else ''

        execute_db(ALERT_DB, """INSERT INTO alert_log
            (timestamp,rule_id,rule_name,host,message,to_email,sent,error)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (now, rule['id'], rule['name'], hostname,
             message, recipients_logged, 1 if sent else 0, error_msg))
        execute_db(ALERT_DB, """UPDATE alert_rules SET
            hit_count=hit_count+1, last_hit=%s WHERE id=%s""",
            (now, rule['id']))

        if sent:
            print(f"[ALERT] Sent: {rule['name']} -> {recipients_logged}")
        else:
            print(f"[ALERT] Failed: {rule['name']} -> {error_msg}")


def process_ping_alert(hostname, source_ip, status, timestamp):
    """Called by api.py when a ping target changes state (e.g. offline/online)."""
    if status not in ('offline', 'online'):
        return

    rules = get_rules()
    if not rules:
        return

    ec = get_email_config()
    tc = get_telegram_config()
    dc = get_discord_config()
    email_enabled   = bool(ec.get('enabled'))
    tg_enabled      = bool(tc.get('enabled')) and bool(tc.get('bot_token')) and bool(tc.get('chat_id'))
    discord_enabled = bool(dc.get('enabled')) and bool(dc.get('webhook_url'))
    if not email_enabled and not tg_enabled and not discord_enabled:
        return

    display_host = hostname or source_ip
    if status == 'offline':
        message  = f"Ping monitor detected {display_host} ({source_ip}) as OFFLINE"
        severity = 'critical'
    else:
        message  = f"Ping monitor detected {display_host} ({source_ip}) is ONLINE / REACHABLE"
        severity = 'info'

    for rule in rules:
        if not match_rule(rule, display_host, message, 'ping', source_ip=source_ip):
            continue

        subject, plain_body, html_body, discord_embed, tg_text = build_alert_payloads(
            rule, display_host, source_ip, message, timestamp, severity=severity, status=status
        )
        sent  = False
        errors = []
        notify_via = (rule.get('notify_via') or 'both').strip()
        sent_channels = []

        # ── 1. Email Channel ──────────────────────────────────────────
        rule_emails = [em.strip() for em in re.split(r'[\n,;]', rule.get('to_email') or '') if em.strip()]
        if email_enabled and _should_send_channel(notify_via, 'email') and rule_emails:
            for recipient in rule_emails:
                ok, err = send_email(recipient, subject, plain_body, ec, html_body=html_body)
                if ok:
                    sent = True
                    sent_channels.append(f"Email:{recipient}")
                else:
                    errors.append(f"Email({recipient}): {err}")

        # ── 2. Telegram Channel ───────────────────────────────────────
        if tg_enabled and _should_send_channel(notify_via, 'telegram'):
            ok, err = send_telegram(tc.get('bot_token', ''), tc.get('chat_id', ''), tg_text)
            if ok:
                sent = True
                sent_channels.append("Telegram")
            else:
                errors.append(f"Telegram: {err}")

        # ── 3. Discord Channel ────────────────────────────────────────
        if discord_enabled and _should_send_channel(notify_via, 'discord'):
            ok, err = send_discord(dc.get('webhook_url', ''), '', embed=discord_embed)
            if ok:
                sent = True
                sent_channels.append("Discord")
            else:
                errors.append(f"Discord: {err}")

        # ── 4. Logging & Counters ─────────────────────────────────────
        now = time.strftime('%Y-%m-%dT%H:%M:%S')
        recipients_logged = ', '.join(sent_channels) if sent_channels else (rule.get('to_email') or 'None')
        error_msg = '; '.join(errors) if errors else ''

        execute_db(ALERT_DB, """INSERT INTO alert_log
            (timestamp,rule_id,rule_name,host,message,to_email,sent,error)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (now, rule['id'], rule['name'], display_host,
             message, recipients_logged, 1 if sent else 0, error_msg))
        execute_db(ALERT_DB, """UPDATE alert_rules SET
            hit_count=hit_count+1, last_hit=%s WHERE id=%s""",
            (now, rule['id']))

        if sent:
            print(f"[ALERT] Sent: {rule['name']} -> {recipients_logged}")
        else:
            print(f"[ALERT] Failed: {rule['name']} -> {error_msg}")
