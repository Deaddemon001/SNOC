"""
SimpleNOC v0.5.5 - Alert Engine
Monitors syslog messages and sends email alerts based on rules.
Rules: if Host = X AND message contains Y → send email
Same logic as Visual Syslog Server alert rules.
"""
import smtplib, threading, time, json, re, datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
        id          {pk},
        name        TEXT,
        host_match  TEXT DEFAULT '',
        text_match  TEXT DEFAULT '',
        to_email    TEXT DEFAULT '',
        enabled     INTEGER DEFAULT 1,
        created_at  TEXT,
        hit_count   INTEGER DEFAULT 0,
        last_hit    TEXT
    )''')

    execute_db(ALERT_DB, '''CREATE TABLE IF NOT EXISTS email_template (
        id      INTEGER PRIMARY KEY,
        subject TEXT,
        body    TEXT
    )''')
    
    rows = query_db(ALERT_DB, "SELECT COUNT(*) as count FROM email_template")
    if not rows or rows[0]['count'] == 0:
        default_subject = '[SimpleNOC Alert] {rule_name} - {olt_host}'
        default_body = 'SimpleNOC Alert\nRule: {rule_name}\nOLT: {olt_host}\nTime: {time}\nMessage: {message}\nSeverity: {severity}'
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


def match_rule(rule, hostname, message):
    """Return True if syslog message matches this rule"""
    host_match = (rule.get('host_match') or '').strip()
    text_match = (rule.get('text_match') or '').strip()

    # Host match — empty means match all hosts
    if host_match:
        if host_match.lower() not in hostname.lower():
            return False

    # Text match — supports multiple keywords separated by newline or comma
    if text_match:
        keywords = [k.strip() for k in re.split(r'[\n,]', text_match) if k.strip()]
        msg_lower = message.lower()
        # All keywords must match (AND logic, same as Visual Syslog)
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
    if not ec.get('enabled'):
        return

    for rule in rules:
        if not match_rule(rule, hostname, message):
            continue

        subject, body = build_alert_email(
            rule, hostname, '', message, timestamp, '')
        sent, error   = send_email(rule['to_email'], subject, body, ec)
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
