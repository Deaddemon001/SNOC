"""
SimpleNOC v0.5.5.2 - Alert Engine
Monitors syslog messages and sends email alerts based on rules.
Rules: if Host = X AND message contains Y → send email
Same logic as Visual Syslog Server alert rules.
"""
import smtplib, threading, time, json, re, datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib import request as _urlrequest
from urllib import parse as _urlparse
import noc_config as cfg
from noc_config import execute_db, query_db, get_db_connection

ALERT_DB = cfg.AUTH_DB  # reuse auth.db for alert rules

# ── DATABASE ──────────────────────────────────────────────────────────────────
def init_alert_db():
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    pk = "SERIAL" if db_type == 'postgres' else "INTEGER PRIMARY KEY AUTOINCREMENT"
    
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
    try:
        execute_db(ALERT_DB, "ALTER TABLE alert_rules ADD COLUMN notify_via TEXT DEFAULT 'both'")
    except Exception:
        pass
    try:
        execute_db(ALERT_DB, "ALTER TABLE alert_rules ADD COLUMN source_type TEXT DEFAULT 'syslog'")
    except Exception:
        pass
    try:
        execute_db(ALERT_DB, "ALTER TABLE alert_rules ADD COLUMN exclude_hosts TEXT DEFAULT ''")
    except Exception:
        pass

    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS email_template (
        id      INTEGER PRIMARY KEY,
        subject TEXT,
        body    TEXT
    )''')
    
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM email_template")
    if not rows or rows[0]['count'] == 0:
        default_subject = '[SimpleNOC Alert] {rule_name} - {olt_host}'
        default_body = 'SimpleNOC Alert\nRule: {rule_name}\nOLT: {olt_host}\nTime: {time}\nMessage: {message}\nSeverity: {severity}\n\nSent by SNOC v0.5.5.2'
        execute_db(ALERT_DB, "INSERT INTO email_template (id, subject, body) VALUES (1,?,?)", (default_subject, default_body))

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

    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS telegram_config (
        id        INTEGER PRIMARY KEY,
        bot_token TEXT DEFAULT '',
        chat_id   TEXT DEFAULT '',
        enabled   INTEGER DEFAULT 0
    )''')
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM telegram_config")
    if not rows or rows[0]['count'] == 0:
        execute_db(ALERT_DB, "INSERT INTO telegram_config (id, bot_token, chat_id, enabled) VALUES (1,'','',0)")
    
    print(f"Alert DB ({db_type}) ready.")


init_alert_db()

# ── EMAIL SENDER ──────────────────────────────────────────────────────────────
def get_email_config():
    rows = query_db(ALERT_DB, "SELECT * FROM email_config WHERE id=1")
    return rows[0] if rows else {}


def send_email(to_addr, subject, body, cfg_override=None):
    ec = cfg_override or get_email_config()
    if not ec.get('enabled') or not ec.get('smtp_host'):
        return False, "Email not configured or disabled"
    try:
        msg = MIMEMultipart()
        msg['From']    = ec['from_addr'] or ec['smtp_user']
        msg['To']      = to_addr
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))

        if ec.get('use_tls'):
            server = smtplib.SMTP(ec['smtp_host'], int(ec['smtp_port']))
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(ec['smtp_host'], int(ec['smtp_port']))

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


def send_telegram(bot_token, chat_id, text):
    if not bot_token or not chat_id:
        return False, "Telegram not configured"
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        data = _urlparse.urlencode(payload).encode("utf-8")
        req = _urlrequest.Request(url, data=data, method="POST")
        with _urlrequest.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        # Telegram returns JSON, but we only need success/failure
        if '"ok":true' in raw or '"ok": true' in raw:
            return True, "Sent"
        return False, raw[:200]
    except Exception as e:
        return False, str(e)

# ── EMAIL TEMPLATE ───────────────────────────────────────────────────────────
def get_email_template():
    rows = query_db(ALERT_DB, "SELECT subject, body FROM email_template WHERE id=1")
    if rows:
        return rows[0]['subject'], rows[0]['body']
    return '[SimpleNOC Alert] {rule_name} - {olt_host}', '{message}'


def save_email_template(subject, body):
    execute_db(ALERT_DB, "UPDATE email_template SET subject=?, body=? WHERE id=1",
                 (subject, body))


def render_template(tpl, vars_dict):
    # Replace {variable} placeholders in template string
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


def match_rule(rule, hostname, message, source_type='syslog'):
    """Return True if the event matches this rule."""
    if (rule.get('source_type') or 'syslog') != source_type:
        return False

    host_match = (rule.get('host_match') or '').strip()
    text_match = (rule.get('text_match') or '').strip()
    hostname = hostname or ''

    if _host_excluded(rule, hostname):
        return False

    if host_match:
        if host_match.lower() not in hostname.lower():
            return False

    if text_match and source_type == 'syslog':
        keywords = [k.strip() for k in re.split(r'[\n,]', text_match) if k.strip()]
        msg_lower = message.lower()
        if not all(k.lower() in msg_lower for k in keywords):
            return False

    return True

def build_alert_email(rule, hostname, source_ip, message, timestamp, severity=''):
    subj_tpl, body_tpl = get_email_template()
    vars_dict = {
        'rule_name':  rule['name'],
        'olt_host':   hostname,
        'source_ip':  source_ip or '',
        'time':       timestamp,
        'message':    message,
        'severity':   severity or 'N/A',
        'host_match': rule.get('host_match') or '(any)',
        'text_match': rule.get('text_match') or '',
    }
    subject = render_template(subj_tpl, vars_dict)
    body    = render_template(body_tpl, vars_dict)
    return subject, body

def process_alert(hostname, message, timestamp):
    """Called by syslog_server for every incoming message"""
    rules = get_rules()
    if not rules:
        return

    ec = get_email_config()
    tc = get_telegram_config()
    email_enabled = bool(ec.get('enabled'))
    tg_enabled = bool(tc.get('enabled')) and bool(tc.get('bot_token')) and bool(tc.get('chat_id'))
    if not email_enabled and not tg_enabled:
        return

    for rule in rules:
        if not match_rule(rule, hostname, message, 'syslog'):
            continue

        subject, body = build_alert_email(
            rule, hostname, '', message, timestamp, '')
        sent = False
        error = ""
        notify_via = rule.get('notify_via') or 'both'
        if email_enabled and notify_via in ('email', 'both'):
            sent, error = send_email(rule['to_email'], subject, body, ec)

        if tg_enabled and notify_via in ('telegram', 'both'):
            tg_text = subject + "\n\n" + body
            tg_sent, tg_err = send_telegram(tc.get('bot_token', ''), tc.get('chat_id', ''), tg_text)
            if not tg_sent and not error:
                error = tg_err
            sent = sent or tg_sent
        now = time.strftime('%Y-%m-%dT%H:%M:%S')

        # Log the alert
        execute_db(ALERT_DB, """INSERT INTO alert_log
            (timestamp,rule_id,rule_name,host,message,to_email,sent,error)
            VALUES (?,?,?,?,?,?,?,?)""",
            (now, rule['id'], rule['name'], hostname,
             message, rule['to_email'], 1 if sent else 0, error))
        execute_db(ALERT_DB, """UPDATE alert_rules SET
            hit_count=hit_count+1, last_hit=? WHERE id=?""",
            (now, rule['id']))

        if sent:
            print(f"[ALERT] Sent: {rule['name']} → {rule['to_email']}")
        else:
            print(f"[ALERT] Failed: {rule['name']} → {error}")
def process_ping_alert(hostname, source_ip, status, timestamp):
    if status != 'offline':
        return

    rules = get_rules()
    if not rules:
        return

    ec = get_email_config()
    tc = get_telegram_config()
    email_enabled = bool(ec.get('enabled'))
    tg_enabled = bool(tc.get('enabled')) and bool(tc.get('bot_token')) and bool(tc.get('chat_id'))
    if not email_enabled and not tg_enabled:
        return

    display_host = hostname or source_ip
    message = f"Ping monitor detected {source_ip} as offline"
    for rule in rules:
        if not match_rule(rule, display_host, message, 'ping'):
            continue

        subject, body = build_alert_email(rule, display_host, source_ip, message, timestamp, 'critical')
        sent = False
        error = ""
        notify_via = rule.get('notify_via') or 'both'
        if email_enabled and notify_via in ('email', 'both'):
            sent, error = send_email(rule.get('to_email', ''), subject, body, ec)

        if tg_enabled and notify_via in ('telegram', 'both'):
            tg_text = subject + "\n\n" + body
            tg_sent, tg_err = send_telegram(tc.get('bot_token', ''), tc.get('chat_id', ''), tg_text)
            if not tg_sent and not error:
                error = tg_err
            sent = sent or tg_sent

        now = time.strftime('%Y-%m-%dT%H:%M:%S')
        execute_db(ALERT_DB, """INSERT INTO alert_log
            (timestamp,rule_id,rule_name,host,message,to_email,sent,error)
            VALUES (?,?,?,?,?,?,?,?)""",
            (now, rule['id'], rule['name'], display_host,
             message, rule.get('to_email', ''), 1 if sent else 0, error))
        execute_db(ALERT_DB, """UPDATE alert_rules SET
            hit_count=hit_count+1, last_hit=? WHERE id=?""",
            (now, rule['id']))
