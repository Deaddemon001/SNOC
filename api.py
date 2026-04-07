from flask import Flask, jsonify, request, session, redirect, url_for, Response
from flask_cors import CORS
import os, json, datetime, threading, time, subprocess, re, platform, hashlib, secrets, sys
from collections import deque

import noc_config as _cfg
from noc_config import query_db, execute_db, get_db_connection

app = Flask(__name__)
app.secret_key    = secrets.token_hex(32)  # regenerated each restart
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE']   = False
app.config['PERMANENT_SESSION_LIFETIME'] = __import__('datetime').timedelta(hours=12)
CORS(app, supports_credentials=True)

from alert_engine import send_email, get_email_template, save_email_template, get_telegram_config, send_telegram

HTTPS_PORT    = getattr(_cfg, 'HTTPS_PORT',    5443)
HTTP_REDIRECT = getattr(_cfg, 'HTTP_REDIRECT', True)
SSL_CERT      = getattr(_cfg, 'SSL_CERT',      '')
SSL_KEY       = getattr(_cfg, 'SSL_KEY',       '')
CONFIG_FILE   = os.path.join(BASE_DIR if 'BASE_DIR' in globals() else os.path.dirname(os.path.abspath(__file__)), 'noc_config.py')

def ensure_mac_mapping_table():
    execute_db(SYSLOG_DB, '''CREATE TABLE IF NOT EXISTS mac_mapping (
        olt_mac      TEXT PRIMARY KEY,
        olt_hostname TEXT,
        description  TEXT DEFAULT '',
        created_at   TEXT)''')
    # Add olt_mac to syslog_devices if missing
    execute_db(SYSLOG_DB, "ALTER TABLE syslog_devices ADD COLUMN olt_mac TEXT DEFAULT ''")

BASE_DIR   = _cfg.BASE_DIR;   DATA_DIR  = _cfg.DATA_DIR
TRAP_DB    = _cfg.TRAP_DB;    SYSLOG_DB = _cfg.SYSLOG_DB
PING_DB    = _cfg.PING_DB;    AUTH_DB   = _cfg.AUTH_DB
DASHBOARD  = _cfg.DASHBOARD
TFTP_DB    = _cfg.TFTP_DB
OLT_DB     = _cfg.OLT_DB
BACKUP_DIR = _cfg.BACKUP_DIR
LOGS_DIR   = os.path.join(BASE_DIR, "logs")

DEFAULT_VISIBLE_TABS = ['syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink']
ALL_VISIBLE_TABS = DEFAULT_VISIBLE_TABS + ['users', 'logs', 'ont']

# Ensure all tables exist
try:
    ensure_mac_mapping_table()
except Exception:
    pass
try:
    from olt_connector import init_olt_db
    init_olt_db()
except Exception:
    pass

OLT_POLL_PROGRESS = {}
OLT_POLL_PROGRESS_LOCK = threading.Lock()

def set_olt_poll_progress(profile_id, stage, detail='', done=False, error=''):
    with OLT_POLL_PROGRESS_LOCK:
        OLT_POLL_PROGRESS[str(profile_id)] = {
            'stage': stage,
            'detail': detail,
            'done': bool(done),
            'error': error or '',
            'updated_at': datetime.datetime.now().isoformat()
        }

def get_olt_poll_progress(profile_id):
    with OLT_POLL_PROGRESS_LOCK:
        return dict(OLT_POLL_PROGRESS.get(str(profile_id), {
            'stage': 'Idle',
            'detail': '',
            'done': False,
            'error': '',
            'updated_at': datetime.datetime.now().isoformat()
        }))

def _now_iso():
    return datetime.datetime.now().replace(microsecond=0).isoformat()

def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except Exception:
        return None

def _compute_job_next_run(run_mode, interval_min, last_run=None):
    if run_mode != 'repeat':
        return None
    base = _parse_dt(last_run) or datetime.datetime.now()
    minutes = max(1, int(interval_min or 60))
    return (base + datetime.timedelta(minutes=minutes)).replace(microsecond=0).isoformat()

def ensure_olt_job_table():
    execute_db(OLT_DB, """CREATE TABLE IF NOT EXISTS olt_poll_jobs (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL,
        profile_name TEXT DEFAULT '',
        profile_ip TEXT DEFAULT '',
        poll_type TEXT NOT NULL,
        run_mode TEXT NOT NULL,
        start_at TEXT,
        interval_min INTEGER DEFAULT 60,
        selected_ports TEXT DEFAULT '',
        next_run TEXT,
        last_run TEXT,
        last_status TEXT DEFAULT 'never',
        last_error TEXT DEFAULT '',
        enabled INTEGER DEFAULT 1,
        created_at TEXT
    )""")
    execute_db(OLT_DB, "ALTER TABLE olt_poll_jobs ADD COLUMN selected_ports TEXT DEFAULT ''")


ensure_olt_job_table()

def run_olt_job(job_id):
    jobs = query_db(OLT_DB, "SELECT * FROM olt_poll_jobs WHERE id=?", (job_id,))
    if not jobs or not jobs[0]['enabled']:
        return
    job = jobs[0]
    
    profiles = query_db(OLT_DB, "SELECT * FROM olt_profiles WHERE id=?", (job['profile_id'],))
    if not profiles:
        execute_db(OLT_DB, "UPDATE olt_poll_jobs SET last_status='failed', last_error=?, enabled=0 WHERE id=?",
                    ('Profile not found', job_id))
        return
    profile = profiles[0]

    profile_dict = dict(profile)
    set_olt_poll_progress(job['profile_id'], 'Scheduled poll started', f"{job['poll_type']} for {profile['name'] or profile['ip']}")

    try:
        if job['poll_type'] == 'onu':
            from olt_connector import poll_onu_only
            result = poll_onu_only(profile_dict, progress_callback=lambda stage, detail='': set_olt_poll_progress(job['profile_id'], stage, detail))
        elif job['poll_type'] == 'uplink':
            from olt_connector import poll_uplink_only
            interfaces = [p.strip() for p in (job['selected_ports'] or '').split(',') if p.strip()]
            result = poll_uplink_only(profile_dict, interfaces=interfaces or None)
        else:
            from olt_connector import poll_olt
            result = poll_olt(profile_dict, progress_callback=lambda stage, detail='': set_olt_poll_progress(job['profile_id'], stage, detail))
        success = bool(result.get('success'))
        error = result.get('error', '')
    except Exception as e:
        success = False
        error = str(e)

    now_iso = _now_iso()
    next_run = _compute_job_next_run(job['run_mode'], job['interval_min'], now_iso)
    enabled = 1 if success and job['run_mode'] == 'repeat' else (0 if job['run_mode'] == 'once' else 1)
    if not success and job['run_mode'] == 'repeat':
        next_run = _compute_job_next_run(job['run_mode'], job['interval_min'], now_iso)

    execute_db(OLT_DB, """UPDATE olt_poll_jobs
                    SET last_run=?, last_status=?, last_error=?, next_run=?, enabled=?
                    WHERE id=?""",
                 (now_iso, 'ok' if success else 'failed', error or '', next_run, enabled, job_id))

    set_olt_poll_progress(job['profile_id'],
                          'Scheduled poll completed' if success else 'Scheduled poll failed',
                          error or '',
                          done=True,
                          error=error or '')

def olt_job_scheduler():
    while True:
        try:
            now_iso = _now_iso()
            due_jobs = query_db(OLT_DB, """SELECT * FROM olt_poll_jobs
                                       WHERE enabled=1 AND next_run IS NOT NULL AND next_run<=?
                                       ORDER BY next_run ASC, id ASC""", (now_iso,))
            for job in due_jobs:
                run_olt_job(job['id'])
        except Exception as e:
            print(f"[OLT JOBS] Scheduler error: {e}")
        time.sleep(15)


# Database functions are now imported from noc_config


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200000)
    return hashed.hex(), salt

def verify_password(password, stored_hash, salt):
    hashed, _ = hash_password(password, salt)
    return hashed == stored_hash

def is_logged_in():
    return session.get('logged_in') is True and bool(session.get('username'))

def _get_session_timeout_minutes():
    raw = get_noc_setting('session_timeout_minutes', '')
    try:
        m = int(raw)
        if m in (10, 30, 60):
            return m
    except Exception:
        pass
    # Default if not set: 30 minutes
    return 30

def _is_session_expired():
    try:
        login_time = float(session.get('login_time') or 0)
    except Exception:
        login_time = 0
    if not login_time:
        return False
    timeout_s = _get_session_timeout_minutes() * 60
    return (time.time() - login_time) > timeout_s

def login_required(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        if not is_logged_in() or _is_session_expired():
            if _is_session_expired():
                session.clear()
            if request.path.startswith('/api/'):
                return jsonify({'error': 'unauthorized', 'redirect': '/login'}), 401
            return redirect('/login')
        return f(*args, **kwargs)
    return decorated

# ── AUTH DB ───────────────────────────────────────────────────────────────────
def init_auth_db():
    pk = "SERIAL"
    execute_db(AUTH_DB, f'''CREATE TABLE IF NOT EXISTS users (
        id         {pk},
        username   TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        salt       TEXT NOT NULL,
        role       TEXT DEFAULT 'viewer',
        visible_tabs TEXT DEFAULT '',
        created_at TEXT,
        last_login TEXT
    )''')
    execute_db(AUTH_DB, '''CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        username   TEXT,
        created_at TEXT,
        expires_at TEXT
    )''')
    execute_db(AUTH_DB, '''CREATE TABLE IF NOT EXISTS noc_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT DEFAULT '',
        updated_at TEXT
    )''')
    execute_db(AUTH_DB, "ALTER TABLE users ADD COLUMN visible_tabs TEXT DEFAULT ''")
    execute_db(
        AUTH_DB,
        "UPDATE users SET visible_tabs=? WHERE COALESCE(visible_tabs, '')=''",
        (json.dumps(DEFAULT_VISIBLE_TABS),)
    )
    execute_db(
        AUTH_DB,
        "UPDATE users SET visible_tabs=? WHERE role='admin' AND COALESCE(visible_tabs, '') IN ('', ?)",
        (json.dumps(ALL_VISIBLE_TABS), json.dumps(DEFAULT_VISIBLE_TABS))
    )
    # Create default admin if no users exist
    rows = query_db(AUTH_DB, "SELECT COUNT(*) as count FROM users")
    if not rows or rows[0]['count'] == 0:
        hashed, salt = hash_password('admin123')
        execute_db(AUTH_DB,
            "INSERT INTO users (username,password,salt,role,visible_tabs,created_at) VALUES (?,?,?,?,?,?)",
            ('admin', hashed, salt, 'admin', json.dumps(ALL_VISIBLE_TABS), datetime.datetime.now().isoformat()))
        print("Default admin created: username=admin password=admin123")
        print("IMPORTANT: Change the password after first login!")



init_auth_db()

# ── ENSURE OTHER DBS ──────────────────────────────────────────────────────────
def ensure_dbs():
    pk = "SERIAL"
    
    # Trap DB
    execute_db(TRAP_DB, f"""CREATE TABLE IF NOT EXISTS traps (
        id {pk},
        timestamp TEXT, source_ip TEXT, olt_mac TEXT, olt_id TEXT,
        oid TEXT, oid_name TEXT, value TEXT)""")
    execute_db(TRAP_DB, """CREATE TABLE IF NOT EXISTS devices (
        olt_mac TEXT PRIMARY KEY, source_ip TEXT, olt_id TEXT,
        name TEXT, last_seen TEXT, status TEXT DEFAULT 'unknown')""")
    execute_db(TRAP_DB, f"""CREATE TABLE IF NOT EXISTS events (
        id {pk},
        timestamp TEXT, olt_mac TEXT, olt_id TEXT,
        alarm_type TEXT, alarm_name TEXT, severity TEXT,
        onu_id TEXT, pon_slot TEXT, alarm_port TEXT,
        description TEXT, status TEXT)""")

    # Syslog DB
    execute_db(SYSLOG_DB, f'''CREATE TABLE IF NOT EXISTS syslog (
        id {pk},
        timestamp TEXT, source_ip TEXT, olt_hostname TEXT, olt_id TEXT,
        facility TEXT, severity TEXT, severity_num INTEGER,
        hostname TEXT, process TEXT, message TEXT, event_tag TEXT,
        onu_pon TEXT, onu_id TEXT, onu_sn TEXT, raw TEXT)''')
    execute_db(SYSLOG_DB, '''CREATE TABLE IF NOT EXISTS syslog_devices (
        olt_hostname TEXT PRIMARY KEY, source_ip TEXT, olt_id TEXT,
        name TEXT, last_seen TEXT, status TEXT DEFAULT 'unknown')''')

    # Ping DB
    execute_db(PING_DB, f'''CREATE TABLE IF NOT EXISTS ping_targets (
        id {pk},
        ip TEXT UNIQUE, name TEXT, added_at TEXT, enabled INTEGER DEFAULT 1)''')
    execute_db(PING_DB, f'''CREATE TABLE IF NOT EXISTS ping_results (
        id {pk},
        timestamp TEXT, ip TEXT, latency_ms REAL, status TEXT)''')
    execute_db(PING_DB, '''CREATE TABLE IF NOT EXISTS ping_status (
        ip TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'unknown',
        latency_ms REAL, last_seen TEXT, last_check TEXT,
        added_at TEXT, avg_latency REAL, loss_pct REAL)''')

    # TFTP DB
    execute_db(TFTP_DB, f'''CREATE TABLE IF NOT EXISTS tftp_files (
        id          {pk},
        timestamp   TEXT,
        source_ip   TEXT,
        olt_name    TEXT,
        olt_id      TEXT,
        filename    TEXT,
        stored_name TEXT,
        file_size   INTEGER,
        file_path   TEXT,
        status      TEXT DEFAULT 'ok',
        olt_mac     TEXT DEFAULT ''
    )''')
    execute_db(TFTP_DB, '''CREATE TABLE IF NOT EXISTS tftp_config (
        id         INTEGER PRIMARY KEY,
        backup_dir TEXT,
        enabled    INTEGER DEFAULT 1
    )''')
    cfg_rows = query_db(TFTP_DB, "SELECT COUNT(*) as count FROM tftp_config")
    if not cfg_rows or cfg_rows[0]['count'] == 0:
        execute_db(TFTP_DB, "INSERT INTO tftp_config (id, backup_dir, enabled) VALUES (1, ?, 1)", (BACKUP_DIR,))

ensure_dbs()

FULL_BACKUP_TABLES = [
    'users',
    'noc_settings',
    'email_config',
    'email_template',
    'alert_rules',
    'alert_log',
    'traps',
    'devices',
    'events',
    'syslog',
    'syslog_devices',
    'mac_mapping',
    'ping_targets',
    'ping_results',
    'ping_status',
    'tftp_config',
    'tftp_files',
    'olt_profiles',
    'onu_data',
    'onu_history',
    'uplink_stats',
    'olt_poll_sessions',
    'olt_poll_jobs',
]

def _fetch_one(sql, params=()):
    rows = query_db(AUTH_DB, sql, params)
    return rows[0] if rows else None


def get_noc_setting(key, default_value=None):
    try:
        rows = query_db(AUTH_DB, "SELECT value FROM noc_settings WHERE key=?", (key,))
        if rows and rows[0].get('value') not in (None, ''):
            return rows[0]['value']
    except Exception:
        pass
    return default_value


def set_noc_setting(key, value):
    now = datetime.datetime.now().isoformat()
    try:
        execute_db(
            AUTH_DB,
            "INSERT INTO noc_settings (key,value,updated_at) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at",
            (key, value if value is not None else '', now),
        )
        return True
    except Exception:
        return False


def _default_visible_tabs_for_role(role):
    return list(ALL_VISIBLE_TABS if role == 'admin' else DEFAULT_VISIBLE_TABS)


def _normalize_visible_tabs(value, role='viewer'):
    tabs = value
    if isinstance(value, str):
        try:
            tabs = json.loads(value)
        except Exception:
            tabs = []
    if not isinstance(tabs, list):
        tabs = []
    cleaned = []
    seen = set()
    for tab in tabs:
        tab = str(tab).strip()
        if tab in ALL_VISIBLE_TABS and tab not in seen:
            cleaned.append(tab)
            seen.add(tab)
    defaults = _default_visible_tabs_for_role(role)
    if not cleaned:
        cleaned = defaults
    if role == 'admin':
        for extra in ('users', 'logs'):
            if extra not in cleaned:
                cleaned.append(extra)
    return cleaned


def _visible_tabs_json(value, role='viewer'):
    return json.dumps(_normalize_visible_tabs(value, role))


def _get_user_record(username):
    users = query_db(AUTH_DB, "SELECT * FROM users WHERE username=?", (username,))
    if not users:
        return None
    user = dict(users[0])
    user['visible_tabs'] = _normalize_visible_tabs(user.get('visible_tabs'), user.get('role', 'viewer'))
    return user


def _get_current_user_payload():
    username = session.get('username')
    role = session.get('role') or 'viewer'
    user = _get_user_record(username) if username else None
    if user:
        role = user.get('role', role)
        visible_tabs = user.get('visible_tabs', _default_visible_tabs_for_role(role))
    else:
        visible_tabs = _default_visible_tabs_for_role(role)
    return {
        'logged_in': True,
        'username': username,
        'role': role,
        'visible_tabs': visible_tabs,
    }


def _update_config_ports(port_values):
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as fh:
            content = fh.read()
    except Exception as e:
        raise RuntimeError(f'Unable to read noc_config.py: {e}')

    for key, value in port_values.items():
        pattern = rf"(?m)^({re.escape(key)}\s*=\s*)\d+\s*$"
        new_content, count = re.subn(pattern, rf"\g<1>{int(value)}", content, count=1)
        if count != 1:
            raise RuntimeError(f'Could not update {key} in noc_config.py')
        content = new_content

    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8', newline='') as fh:
            fh.write(content)
    except Exception as e:
        raise RuntimeError(f'Unable to write noc_config.py: {e}')

    for key, value in port_values.items():
        setattr(_cfg, key, int(value))
    global HTTPS_PORT
    HTTPS_PORT = int(port_values.get('HTTPS_PORT', HTTPS_PORT))


def _table_columns(conn, table_name):
    cur = conn.cursor()
    cur.execute(
        """SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = %s
           ORDER BY ordinal_position""",
        (table_name,),
    )
    cols = [row[0] for row in cur.fetchall()]
    cur.close()
    return cols


def _table_rows(conn, table_name):
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table_name}")
    cols = [desc[0] for desc in cur.description]
    rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    cur.close()
    return rows


def build_full_backup():
    conn = get_db_connection()
    if not conn:
        raise RuntimeError("Unable to connect to PostgreSQL")
    try:
        tables = {table: _table_rows(conn, table) for table in FULL_BACKUP_TABLES}
        return {
            'version': '0.5.5.2',
            'database': 'postgres',
            'created_at': datetime.datetime.now().isoformat(),
            'tables': tables,
        }
    finally:
        conn.close()


def restore_full_backup(backup_payload):
    tables = backup_payload.get('tables')
    if not isinstance(tables, dict):
        raise ValueError("Backup file does not contain a valid tables section.")

    conn = get_db_connection()
    if not conn:
        raise RuntimeError("Unable to connect to PostgreSQL")

    restored_counts = {}
    try:
        cur = conn.cursor()
        for table_name in FULL_BACKUP_TABLES:
            cur.execute(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE")

        for table_name in FULL_BACKUP_TABLES:
            rows = tables.get(table_name, [])
            if not isinstance(rows, list):
                raise ValueError(f"Invalid row list for table '{table_name}'.")
            columns = _table_columns(conn, table_name)
            if not rows:
                restored_counts[table_name] = 0
                continue

            insert_cols = [col for col in columns if any(col in row for row in rows)]
            if not insert_cols:
                restored_counts[table_name] = 0
                continue

            placeholders = ','.join(['%s'] * len(insert_cols))
            col_sql = ','.join(insert_cols)
            sql = f"INSERT INTO {table_name} ({col_sql}) VALUES ({placeholders})"
            values = [tuple(row.get(col) for col in insert_cols) for row in rows]
            cur.executemany(sql, values)
            restored_counts[table_name] = len(rows)

        conn.commit()
        return restored_counts
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_retention_policies():
    return [
        ("traps", "timestamp", getattr(_cfg, "TRAP_RETENTION_DAYS", 30)),
        ("events", "timestamp", getattr(_cfg, "TRAP_RETENTION_DAYS", 30)),
        ("syslog", "timestamp", getattr(_cfg, "SYSLOG_RETENTION_DAYS", 7)),
        ("ping_results", "timestamp", getattr(_cfg, "PING_RETENTION_DAYS", 15)),
        ("tftp_files", "timestamp", getattr(_cfg, "TFTP_RETENTION_DAYS", 90)),
        ("alert_log", "timestamp", getattr(_cfg, "ALERT_LOG_RETENTION_DAYS", 30)),
        ("onu_data", "poll_time", getattr(_cfg, "OLT_DATA_RETENTION_DAYS", 30)),
        ("onu_history", "poll_time", getattr(_cfg, "OLT_DATA_RETENTION_DAYS", 30)),
        ("uplink_stats", "poll_time", getattr(_cfg, "OLT_DATA_RETENTION_DAYS", 30)),
        ("olt_poll_sessions", "poll_time", getattr(_cfg, "OLT_SESSION_RETENTION_DAYS", 30)),
    ]

def run_retention_cleanup():
    for table_name, column_name, retention_days in get_retention_policies():
        try:
            days = int(retention_days or 0)
        except Exception:
            days = 0
        if days <= 0:
            continue
        cutoff = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
        execute_db(AUTH_DB, f"DELETE FROM {table_name} WHERE {column_name} < ?", (cutoff,))


def retention_cleanup_worker():
    while True:
        try:
            run_retention_cleanup()
        except Exception as e:
            print(f"[RETENTION] Cleanup error: {e}")
        time.sleep(3600)


# ── AUTH ROUTES ───────────────────────────────────────────────────────────────
@app.route('/login')
def login_page():
    if is_logged_in():
        return redirect('/')
    path = os.path.join(DASHBOARD, 'login.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    from flask import Response
    return Response(content, mimetype='text/html')

@app.route('/api/auth/login', methods=['POST'])
def do_login():
    data     = request.json or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400

    user = _get_user_record(username)
    if not user:
        return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

    if not verify_password(password, user['password'], user['salt']):
        return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

    # Update last login
    execute_db(AUTH_DB, "UPDATE users SET last_login=? WHERE username=?",
                 (datetime.datetime.now().isoformat(), username))

    # Set session
    import time as _time
    session.permanent    = True
    session['logged_in'] = True
    session['username']  = username
    session['role']      = user['role']
    session['login_time'] = _time.time()

    return jsonify({
        'success':  True,
        'username': username,
        'role':     user['role'],
        'visible_tabs': user['visible_tabs'],
    })


@app.route('/api/auth/logout', methods=['POST'])
def do_logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/auth/me')
def auth_me():
    if not is_logged_in():
        return jsonify({'logged_in': False}), 401
    payload = _get_current_user_payload()
    session['role'] = payload['role']
    return jsonify(payload)

@app.route('/api/auth/change_password', methods=['POST'])
@login_required
def change_password():
    data     = request.json or {}
    old_pass = data.get('old_password') or ''
    new_pass = data.get('new_password') or ''
    username = session.get('username')

    if len(new_pass) < 6:
        return jsonify({'success': False, 'error': 'New password must be at least 6 characters'}), 400

    users = query_db(AUTH_DB, "SELECT * FROM users WHERE username=?", (username,))
    if not users:
        return jsonify({'success': False, 'error': 'User not found'}), 404
    user = users[0]

    if not verify_password(old_pass, user['password'], user['salt']):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401

    new_hash, new_salt = hash_password(new_pass)
    execute_db(AUTH_DB, "UPDATE users SET password=?, salt=? WHERE username=?",
                 (new_hash, new_salt, username))
    return jsonify({'success': True})


# ── USER MANAGEMENT (admin only) ──────────────────────────────────────────────
@app.route('/api/auth/users')
@login_required
def list_users():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    rows = query_db(AUTH_DB,
        "SELECT id,username,role,visible_tabs,created_at,last_login FROM users ORDER BY id")
    for row in rows:
        row['visible_tabs'] = _normalize_visible_tabs(row.get('visible_tabs'), row.get('role', 'viewer'))
    return jsonify(rows)

@app.route('/api/auth/users/add', methods=['POST'])
@login_required
def add_user():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    data     = request.json or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password') or ''
    role     = data.get('role', 'viewer')
    if not username or len(password) < 6:
        return jsonify({'error': 'Username required, password min 6 chars'}), 400
    if role not in ('admin', 'viewer'):
        role = 'viewer'
    visible_tabs = _normalize_visible_tabs(data.get('visible_tabs', []), role)
    
    hashed, salt = hash_password(password)
    success = execute_db(AUTH_DB,
        "INSERT INTO users (username,password,salt,role,visible_tabs,created_at) VALUES (?,?,?,?,?,?)",
        (username, hashed, salt, role, json.dumps(visible_tabs), datetime.datetime.now().isoformat()))
    if success:
        return jsonify({'success': True, 'username': username, 'visible_tabs': visible_tabs})
    else:
        return jsonify({'error': 'Username already exists or database error'}), 409


@app.route('/api/auth/users/edit', methods=['POST'])
@login_required
def edit_user():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    data = request.json or {}
    username = (data.get('username') or '').strip().lower()
    role = data.get('role', 'viewer')
    if not username:
        return jsonify({'error': 'Username required'}), 400
    if role not in ('admin', 'viewer'):
        role = 'viewer'
    if username == session.get('username') and role != 'admin':
        return jsonify({'error': 'Cannot remove your own admin role'}), 400

    existing = _get_user_record(username)
    if not existing:
        return jsonify({'error': 'User not found'}), 404

    visible_tabs = _normalize_visible_tabs(data.get('visible_tabs', existing.get('visible_tabs', [])), role)
    success = execute_db(
        AUTH_DB,
        "UPDATE users SET role=?, visible_tabs=? WHERE username=?",
        (role, json.dumps(visible_tabs), username)
    )
    if not success:
        return jsonify({'error': 'Database error'}), 500
    if username == session.get('username'):
        session['role'] = role
    return jsonify({'success': True, 'username': username, 'role': role, 'visible_tabs': visible_tabs})


@app.route('/api/auth/users/delete', methods=['POST'])
@login_required
def delete_user():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    username = (request.json or {}).get('username')
    if username == session.get('username'):
        return jsonify({'error': 'Cannot delete yourself'}), 400
    execute_db(AUTH_DB, "DELETE FROM users WHERE username=?", (username,))
    return jsonify({'success': True})


@app.route('/api/settings/retention', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_retention_settings():
    hardcoded_map = {
        "trap_retention_days": getattr(_cfg, "TRAP_RETENTION_DAYS", 30),
        "syslog_retention_days": getattr(_cfg, "SYSLOG_RETENTION_DAYS", 7),
        "ping_retention_days": getattr(_cfg, "PING_RETENTION_DAYS", 15),
        "tftp_retention_days": getattr(_cfg, "TFTP_RETENTION_DAYS", 90),
        "alert_log_retention_days": getattr(_cfg, "ALERT_LOG_RETENTION_DAYS", 30),
        "olt_data_retention_days": getattr(_cfg, "OLT_DATA_RETENTION_DAYS", 30),
        "olt_session_retention_days": getattr(_cfg, "OLT_SESSION_RETENTION_DAYS", 30),
    }
    if request.method == 'GET':
        return jsonify(hardcoded_map)
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    return jsonify({'success': True, **hardcoded_map})

@app.route('/api/settings/ui', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_ui_settings():
    default_tabs = ['syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink']
    if request.method == 'GET':
        raw = get_noc_setting('visible_tabs', '')
        if not raw:
            return jsonify({'visible_tabs': default_tabs})
        try:
            tabs = json.loads(raw)
            if not isinstance(tabs, list):
                raise ValueError('visible_tabs not a list')
            tabs = [str(t) for t in tabs if str(t).strip()]
            if not tabs:
                tabs = default_tabs
        except Exception:
            tabs = default_tabs
        return jsonify({'visible_tabs': tabs})

    # POST: admin only
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403

    data = request.json or {}
    tabs = data.get('visible_tabs', [])
    if not isinstance(tabs, list):
        return jsonify({'error': 'visible_tabs must be a list'}), 400

    allowed = set(['syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'users', 'logs', 'ont'])
    tabs = [str(t) for t in tabs if str(t) in allowed]
    if not tabs:
        tabs = default_tabs

    ok = set_noc_setting('visible_tabs', json.dumps(tabs))
    if not ok:
        return jsonify({'success': False, 'error': 'Database error'}), 500
    return jsonify({'success': True, 'visible_tabs': tabs})


@app.route('/api/settings/ports', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_port_settings():
    port_map = {
        'api_port': int(getattr(_cfg, 'API_PORT', 5000)),
        'https_port': int(getattr(_cfg, 'HTTPS_PORT', 5443)),
        'snmp_port': int(getattr(_cfg, 'SNMP_PORT', 162)),
        'syslog_port': int(getattr(_cfg, 'SYSLOG_PORT', 5141)),
        'tftp_port': int(getattr(_cfg, 'TFTP_PORT', 69)),
    }
    if request.method == 'GET':
        return jsonify(port_map)

    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403

    data = request.json or {}
    updates = {}
    field_to_cfg = {
        'api_port': 'API_PORT',
        'https_port': 'HTTPS_PORT',
        'snmp_port': 'SNMP_PORT',
        'syslog_port': 'SYSLOG_PORT',
        'tftp_port': 'TFTP_PORT',
    }
    for field, cfg_key in field_to_cfg.items():
        try:
            value = int(data.get(field, port_map[field]))
        except Exception:
            return jsonify({'error': f'Invalid value for {field}'}), 400
        if value < 1 or value > 65535:
            return jsonify({'error': f'{field} must be between 1 and 65535'}), 400
        updates[cfg_key] = value

    try:
        _update_config_ports(updates)
    except RuntimeError as e:
        return jsonify({'success': False, 'error': str(e)}), 500

    return jsonify({
        'success': True,
        'restart_required': True,
        'message': 'Ports saved to noc_config.py. Restart SimpleNOC to use the new ports.',
        'api_port': updates['API_PORT'],
        'https_port': updates['HTTPS_PORT'],
        'snmp_port': updates['SNMP_PORT'],
        'syslog_port': updates['SYSLOG_PORT'],
        'tftp_port': updates['TFTP_PORT'],
    })


@app.route('/api/settings/storage_stats', methods=['GET'])
@login_required
def api_storage_stats():
    # Row counts + oldest/newest timestamps for each retention-managed dataset.
    items = []
    for table_name, column_name, _retention_days in get_retention_policies():
        try:
            rows = query_db(
                AUTH_DB,
                f"SELECT COUNT(*) AS count, MIN({column_name}) AS oldest, MAX({column_name}) AS newest FROM {table_name}",
            )
            size_rows = query_db(AUTH_DB, f"SELECT pg_total_relation_size('{table_name}') AS size_bytes")
            r = rows[0] if rows else {}
            s = size_rows[0] if size_rows else {}
            size_mb = f"{s.get('size_bytes', 0) / (1024 * 1024):.1f} MB" if s.get('size_bytes') is not None else "0.0 MB"
            items.append({
                'table': table_name,
                'column': column_name,
                'count': int(r.get('count') or 0),
                'size_mb': size_mb,
                'oldest': r.get('oldest'),
                'newest': r.get('newest'),
            })

        except Exception as e:
            items.append({
                'table': table_name,
                'column': column_name,
                'count': 0,
                'oldest': None,
                'newest': None,
                'error': str(e),
            })
    return jsonify({'items': items})

@app.route('/api/settings/security', methods=['GET', 'POST'], strict_slashes=False)
@login_required
def api_security_settings():
    if request.method == 'GET':
        return jsonify({'session_timeout_minutes': _get_session_timeout_minutes()})
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    try:
        m = int(d.get('session_timeout_minutes') or 0)
    except Exception:
        m = 0
    if m not in (10, 30, 60):
        return jsonify({'error': 'Invalid session_timeout_minutes'}), 400
    ok = set_noc_setting('session_timeout_minutes', str(m))
    if not ok:
        return jsonify({'success': False, 'error': 'Database error'}), 500
    return jsonify({'success': True, 'session_timeout_minutes': m})


# ── DASHBOARD ─────────────────────────────────────────────────────────────────
@app.route('/')
@login_required
def index():
    path = os.path.join(DASHBOARD, 'dashboard.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    from flask import Response
    return Response(content, mimetype='text/html')

# ── LOGS (Dashboard viewer) ───────────────────────────────────────────────────
@app.route('/api/logs/list')
@login_required
def api_logs_list():
    try:
        os.makedirs(LOGS_DIR, exist_ok=True)
    except Exception:
        pass

    items = []
    try:
        for name in os.listdir(LOGS_DIR):
            if not name.lower().endswith('.log'):
                continue
            safe = os.path.basename(name)
            path = os.path.join(LOGS_DIR, safe)
            try:
                st = os.stat(path)
            except Exception:
                continue
            items.append({
                'name': safe,
                'size': int(getattr(st, 'st_size', 0) or 0),
                'mtime': datetime.datetime.fromtimestamp(getattr(st, 'st_mtime', time.time())).isoformat()
            })
    except Exception:
        items = []

    items.sort(key=lambda x: x.get('mtime', ''), reverse=True)
    return jsonify(items)


@app.route('/api/logs/read')
@login_required
def api_logs_read():
    name = (request.args.get('name') or '').strip()
    try:
        tail = int(request.args.get('tail') or 500)
    except Exception:
        tail = 500
    tail = min(max(tail, 50), 5000)

    if not name:
        return jsonify({'error': 'name required'}), 400
    safe = os.path.basename(name)
    if safe != name or not safe.lower().endswith('.log'):
        return jsonify({'error': 'invalid log name'}), 400

    path = os.path.abspath(os.path.join(LOGS_DIR, safe))
    logs_root = os.path.abspath(LOGS_DIR)
    if not path.startswith(logs_root):
        return jsonify({'error': 'invalid path'}), 400
    if not os.path.exists(path):
        return jsonify({'error': 'log not found'}), 404

    lines = deque(maxlen=tail)
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                lines.append(line.rstrip('\n'))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    try:
        st = os.stat(path)
        meta = {
            'name': safe,
            'size': int(getattr(st, 'st_size', 0) or 0),
            'mtime': datetime.datetime.fromtimestamp(getattr(st, 'st_mtime', time.time())).isoformat()
        }
    except Exception:
        meta = {'name': safe}

    return jsonify({'meta': meta, 'tail': tail, 'lines': list(lines)})

# ── SNMP TRAPS ────────────────────────────────────────────────────────────────
@app.route('/api/traps')
@login_required
def all_traps():
    return jsonify(query_db(TRAP_DB,
        "SELECT * FROM traps ORDER BY timestamp DESC LIMIT 200"))

@app.route('/api/traps/summary')
@login_required
def trap_summary():
    return jsonify(query_db(TRAP_DB,
        "SELECT olt_mac,olt_id,COUNT(*) as count FROM traps GROUP BY olt_mac ORDER BY count DESC"))

# ── SNMP DEVICES ──────────────────────────────────────────────────────────────
@app.route('/api/devices')
@login_required
def get_devices():
    return jsonify(query_db(TRAP_DB,
        "SELECT * FROM devices ORDER BY status,last_seen DESC"))

@app.route('/api/devices/rename', methods=['POST'])
@login_required
def rename_device():
    d = request.json
    if not d.get('olt_mac') or not d.get('name'):
        return jsonify({'error': 'olt_mac and name required'}), 400
    execute_db(TRAP_DB, "UPDATE devices SET name=? WHERE olt_mac=?", (d['name'], d['olt_mac']))
    return jsonify({'success': True})

# ── EVENTS ────────────────────────────────────────────────────────────────────
@app.route('/api/events')
@login_required
def all_events():
    return jsonify(query_db(TRAP_DB,
        "SELECT * FROM events ORDER BY timestamp DESC LIMIT 200"))

@app.route('/api/events/summary')
@login_required
def events_summary():
    return jsonify(query_db(TRAP_DB,
        "SELECT alarm_name,COUNT(*) as count FROM events GROUP BY alarm_name ORDER BY count DESC"))

# ── SYSLOG ────────────────────────────────────────────────────────────────────
@app.route('/api/syslog')
@login_required
def all_syslog():
    h = request.args.get('olt_hostname')
    if h:
        return jsonify(query_db(SYSLOG_DB,
            "SELECT * FROM syslog WHERE olt_hostname=? ORDER BY timestamp DESC LIMIT 200", (h,)))
    return jsonify(query_db(SYSLOG_DB,
        "SELECT * FROM syslog ORDER BY timestamp DESC LIMIT 200"))

@app.route('/api/syslog/events')
@login_required
def syslog_events():
    # Only OLT-level events — uplink port changes and user logins
    sql = """SELECT * FROM syslog WHERE event_tag IN (
        'UPLINK_UP','UPLINK_DOWN',
        'USER_LOGIN','USER_LOGOUT','LOGIN_FAILED',
        'OLT_COLD_START','OLT_WARM_START','OLT_REBOOT',
        'CONFIG_CHANGE','CONFIG_SAVE')"""
    params = ()
    h = request.args.get('olt_hostname')
    if h:
        sql += " AND olt_hostname=?"
        params = (h,)
    try:
        limit = int(request.args.get('limit') or 200)
    except Exception:
        limit = 200
    try:
        offset = int(request.args.get('offset') or 0)
    except Exception:
        offset = 0
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)
    sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params = tuple(list(params) + [limit, offset])
    return jsonify(query_db(SYSLOG_DB, sql, params))

@app.route('/api/syslog/onu_events')
@login_required
def syslog_onu_events():
    # ONU-level events — kept separate
    sql = """SELECT * FROM syslog WHERE event_tag IN (
        'ONU_ONLINE','ONU_OFFLINE','ONU_DYING_GASP',
        'ONU_REGISTER','ONU_DEREGISTER','ONU_BIP8_ERR','ONU_LOS')"""
    params = ()
    h = request.args.get('olt_hostname')
    if h:
        sql += " AND olt_hostname=?"
        params = (h,)
    sql += " ORDER BY timestamp DESC LIMIT 200"
    return jsonify(query_db(SYSLOG_DB, sql, params))

@app.route('/api/syslog/summary')
@login_required
def syslog_summary():
    return jsonify(query_db(SYSLOG_DB,
        "SELECT event_tag,COUNT(*) as count FROM syslog GROUP BY event_tag ORDER BY count DESC"))

@app.route('/api/syslog/severity')
@login_required
def syslog_severity():
    return jsonify(query_db(SYSLOG_DB,
        "SELECT severity,COUNT(*) as count FROM syslog GROUP BY severity ORDER BY severity_num"))

# ── ONU HISTORY ───────────────────────────────────────────────────────────────
@app.route('/api/onu/history')
@login_required
def onu_history():
    sn = request.args.get('serial_no')
    if not sn:
        return jsonify({'error': 'serial_no required'}), 400
    # Return last 100 snapshots for this ONU (case-insensitive partial match)
    sn_like = f"%{sn}%"
    return jsonify(query_db(OLT_DB,
        "SELECT * FROM onu_data WHERE serial_no ILIKE ? ORDER BY poll_time DESC LIMIT 100", (sn_like,)))

# ── SYSLOG DEVICES ────────────────────────────────────────────────────────────
@app.route('/api/syslog/devices')
@login_required
def syslog_devices():
    return jsonify(query_db(SYSLOG_DB,
        "SELECT * FROM syslog_devices ORDER BY status,last_seen DESC"))

@app.route('/api/syslog/devices/rename', methods=['POST'])
@login_required
def rename_syslog_device():
    d   = request.json
    key = d.get('olt_hostname') or d.get('olt_mac')
    if not key or not d.get('name'):
        return jsonify({'error': 'olt_hostname and name required'}), 400
    execute_db(SYSLOG_DB,
        "UPDATE syslog_devices SET name=? WHERE olt_hostname=?", (d['name'], key))
    return jsonify({'success': True})

# ── PING ENGINE ───────────────────────────────────────────────────────────────
PING_INTERVAL = 10
OFFLINE_SECS  = 120
ping_threads  = {}
ping_write_q  = __import__('queue').Queue()

def ping_once(ip):
    try:
        if platform.system().lower() == 'windows':
            cmd = ['ping', '-n', '1', '-w', '2000', ip]
        else:
            cmd = ['ping', '-c', '1', '-W', '2', ip]
        kwargs = {}
        if platform.system().lower() == 'windows':
            kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5, **kwargs)
        out = result.stdout + result.stderr
        m = re.search(r'[Aa]verage\s*=\s*(\d+)ms', out)
        if not m: m = re.search(r'[Tt]ime[=<](\d+)ms', out)
        if not m: m = re.search(r'time=(\d+\.?\d*)\s*ms', out)
        if m and result.returncode == 0:
            return float(m.group(1))
    except Exception:
        pass
    return None

def ping_worker(ip):
    while True:
        try:
            rows = query_db(PING_DB, "SELECT enabled FROM ping_targets WHERE ip=?", (ip,))
            if not rows or not rows[0]['enabled']:
                break
        except Exception:
            break
        latency = ping_once(ip)
        status  = 'online' if latency is not None else 'timeout'
        ping_write_q.put(('result', ip, latency, status))
        time.sleep(PING_INTERVAL)


def ping_db_writer():
    while True:
        try:
            task = ping_write_q.get(timeout=2)
            if task is None: break
            t = task[0]
            if t == 'result':
                _, ip, latency, status = task
                now = datetime.datetime.now().isoformat()
                execute_db(PING_DB,
                    "INSERT INTO ping_results (timestamp,ip,latency_ms,status) VALUES (?,?,?,?)",
                    (now, ip, latency, status))
                if status == 'online':
                    execute_db(PING_DB,
                        "UPDATE ping_status SET status='online',latency_ms=?,last_seen=?,last_check=? WHERE ip=?",
                        (latency, now, now, ip))
                else:
                    execute_db(PING_DB, '''UPDATE ping_status SET
                        status=CASE WHEN last_seen IS NOT NULL AND
                            (EXTRACT(EPOCH FROM (NOW() - last_seen::timestamp))) > %s THEN 'offline'
                            ELSE status END,
                        latency_ms=NULL, last_check=%s WHERE ip=%s''',
                        (OFFLINE_SECS, now, ip))
                
                rows = query_db(PING_DB,
                    "SELECT latency_ms,status FROM ping_results WHERE ip=? ORDER BY id DESC LIMIT 20",
                    (ip,))
                online_lat = [r['latency_ms'] for r in rows if r['status']=='online' and r['latency_ms'] is not None]
                avg  = sum(online_lat)/len(online_lat) if online_lat else None
                loss = (len([r for r in rows if r['status']!='online'])/len(rows)*100) if rows else 0
                execute_db(PING_DB, "UPDATE ping_status SET avg_latency=?,loss_pct=? WHERE ip=?",
                             (avg, loss, ip))
        except __import__('queue').Empty:
            continue
        except Exception as e:
            print(f"Ping DB error: {e}")


def start_ping_thread(ip):
    if ip not in ping_threads or not ping_threads[ip].is_alive():
        t = threading.Thread(target=ping_worker, args=(ip,), daemon=True)
        t.start()
        ping_threads[ip] = t

def resume_ping_targets():
    try:
        rows = query_db(PING_DB, "SELECT ip FROM ping_targets WHERE enabled=1")
        for r in rows:
            start_ping_thread(r['ip'])
            print(f"[Ping] Resumed {r['ip']}")
    except Exception as e:
        print(f"Resume ping error: {e}")

threading.Thread(target=ping_db_writer, daemon=True).start()
resume_ping_targets()

# ── PING ROUTES ───────────────────────────────────────────────────────────────
@app.route('/api/ping/targets')
@login_required
def ping_targets():
    return jsonify(query_db(PING_DB,
        "SELECT * FROM ping_status ORDER BY status, name"))

@app.route('/api/ping/add', methods=['POST'])
@login_required
def ping_add():
    d    = request.json
    ip   = (d.get('ip') or '').strip()
    name = (d.get('name') or ip).strip()
    if not ip:
        return jsonify({'error': 'ip required'}), 400
    try:
        now  = datetime.datetime.now().isoformat()
        execute_db(PING_DB, "INSERT INTO ping_targets (ip,name,added_at,enabled) VALUES (?,?,?,1) ON CONFLICT(ip) DO UPDATE SET name=EXCLUDED.name, enabled=1",
                     (ip, name, now))
        execute_db(PING_DB, "INSERT INTO ping_status (ip,name,status,added_at) VALUES (?,?,'unknown',?) ON CONFLICT(ip) DO UPDATE SET name=EXCLUDED.name",
                     (ip, name, now))
        start_ping_thread(ip)
        return jsonify({'success': True, 'ip': ip, 'name': name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ping/remove', methods=['POST'])
@login_required
def ping_remove():
    ip = (request.json or {}).get('ip')
    if not ip:
        return jsonify({'error': 'ip required'}), 400
    execute_db(PING_DB, "UPDATE ping_targets SET enabled=0 WHERE ip=?", (ip,))
    execute_db(PING_DB, "DELETE FROM ping_status WHERE ip=?", (ip,))
    return jsonify({'success': True})

@app.route('/api/ping/rename', methods=['POST'])
@login_required
def ping_rename():
    d    = request.json or {}
    ip   = d.get('ip')
    name = d.get('name')
    if not ip or not name:
        return jsonify({'error': 'ip and name required'}), 400
    execute_db(PING_DB, "UPDATE ping_status SET name=? WHERE ip=?", (name, ip))
    execute_db(PING_DB, "UPDATE ping_targets SET name=? WHERE ip=?", (name, ip))
    return jsonify({'success': True})

@app.route('/api/ping/history/<path:ip>')
@login_required
def ping_history(ip):
    return jsonify(query_db(PING_DB,
        "SELECT timestamp,latency_ms,status FROM ping_results WHERE ip=? ORDER BY id DESC LIMIT 60",
        (ip,)))

# ── ALERT ENGINE ROUTES ───────────────────────────────────────────────────────
@app.route('/api/alerts/email_config', methods=['GET'])
@login_required
def get_email_cfg():
    rows = query_db(AUTH_DB, "SELECT id,smtp_host,smtp_port,smtp_user,from_addr,use_tls,enabled FROM email_config WHERE id=1")
    return jsonify(rows[0] if rows else {})


@app.route('/api/alerts/email_config', methods=['POST'])
@login_required
def save_email_cfg():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    execute_db(
        AUTH_DB,
        "UPDATE email_config SET smtp_host=?,smtp_port=?,smtp_user=?,smtp_pass=?,from_addr=?,use_tls=?,enabled=? WHERE id=1",
        (d.get('smtp_host', ''), int(d.get('smtp_port', 587)),
         d.get('smtp_user', ''), d.get('smtp_pass', ''),
         d.get('from_addr', ''), 1 if d.get('use_tls') else 0,
         1 if d.get('enabled') else 0),
    )
    return jsonify({'success': True})

@app.route('/api/alerts/test_email', methods=['POST'])
@login_required
def test_email():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d  = request.json or {}
    to = d.get('to_email', '')
    if not to:
        return jsonify({'error': 'to_email required'}), 400
    ec = _fetch_one("SELECT * FROM email_config WHERE id=1") or {}
    if not ec.get('smtp_host'):
        return jsonify({'success': False, 'error': 'SMTP host is empty. Save email config first.'})
    if not ec.get('smtp_user'):
        return jsonify({'success': False, 'error': 'SMTP username is empty. Save email config first.'})
    if not ec.get('smtp_pass'):
        return jsonify({'success': False, 'error': 'SMTP password is empty. Save email config first.'})
    if not ec.get('enabled'):
        return jsonify({'success': False, 'error': 'Email is DISABLED. Check the Enabled box and save config.'})
    sent, err = send_email(to,
        '[SNOC] Test Alert',
        'This is a test alert from SNOC v0.5.5.1\nEmail alerts are working correctly.')
    return jsonify({'success': sent, 'error': err if not sent else 'Email sent! Check your inbox.'})

@app.route('/api/alerts/email_diag')
@login_required
def email_diag():
    ec = _fetch_one("SELECT * FROM email_config WHERE id=1") or {}
    issues = []
    if not ec.get('smtp_host'): issues.append('smtp_host is empty')
    if not ec.get('smtp_user'): issues.append('smtp_user is empty')
    if not ec.get('smtp_pass'): issues.append('smtp_pass is empty')
    if not ec.get('enabled'):   issues.append('Email DISABLED - check Enabled box')
    return jsonify({
        'smtp_host': ec.get('smtp_host','') or '(empty)',
        'smtp_port': ec.get('smtp_port', 587),
        'smtp_user': ec.get('smtp_user','') or '(empty)',
        'from_addr': ec.get('from_addr','') or '(empty)',
        'use_tls':   bool(ec.get('use_tls')),
        'enabled':   bool(ec.get('enabled')),
        'pass_set':  bool(ec.get('smtp_pass','')),
        'issues':    issues
    })

@app.route('/api/alerts/telegram_config', methods=['GET'])
@login_required
def get_telegram_cfg():
    d = get_telegram_config() or {}
    # Never echo token in full if present
    token = d.get('bot_token', '') or ''
    safe = token[:6] + '...' + token[-4:] if len(token) > 12 else token
    return jsonify({
        'bot_token': safe if token else '',
        'chat_id': d.get('chat_id', '') or '',
        'enabled': bool(d.get('enabled')),
        'token_set': bool(token),
    })


@app.route('/api/alerts/telegram_config', methods=['POST'])
@login_required
def save_telegram_cfg():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    bot_token = (d.get('bot_token') or '').strip()
    chat_id = (d.get('chat_id') or '').strip()
    enabled = 1 if d.get('enabled') else 0

    # Allow UI to send masked token; keep existing if looks masked
    if '...' in bot_token:
        cur = get_telegram_config() or {}
        bot_token = cur.get('bot_token', '') or ''

    execute_db(
        AUTH_DB,
        "UPDATE telegram_config SET bot_token=?, chat_id=?, enabled=? WHERE id=1",
        (bot_token, chat_id, enabled),
    )
    return jsonify({'success': True})


@app.route('/api/alerts/test_telegram', methods=['POST'])
@login_required
def test_telegram():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    cur = get_telegram_config() or {}
    if not cur.get('enabled'):
        return jsonify({'success': False, 'error': 'Telegram is DISABLED. Enable it and save config.'})
    if not cur.get('bot_token'):
        return jsonify({'success': False, 'error': 'Bot token is empty. Save Telegram config first.'})
    if not cur.get('chat_id'):
        return jsonify({'success': False, 'error': 'Chat ID is empty. Save Telegram config first.'})

    text = f"[SNOC] Test Alert\nTelegram alerts are working.\nTime: {datetime.datetime.now().isoformat()}"
    sent, err = send_telegram(cur.get('bot_token', ''), cur.get('chat_id', ''), text)
    return jsonify({'success': sent, 'error': err if not sent else 'Telegram message sent!'})

@app.route('/api/alerts/rules', methods=['GET'])
@login_required
def get_alert_rules():
    return jsonify(query_db(AUTH_DB,
        "SELECT * FROM alert_rules ORDER BY id"))

@app.route('/api/alerts/rules/add', methods=['POST'])
@login_required
def add_alert_rule():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    if not d.get('name') or not d.get('text_match'):
        return jsonify({'error': 'name and text_match required'}), 400
    notify_via = d.get('notify_via', 'both')
    execute_db(AUTH_DB,
        "INSERT INTO alert_rules (name,host_match,text_match,to_email,notify_via,enabled,created_at) VALUES (?,?,?,?,?,1,?)",
        (d['name'], d.get('host_match',''), d['text_match'],
         d.get('to_email',''), notify_via, datetime.datetime.now().isoformat()))
    return jsonify({'success': True})


@app.route('/api/alerts/rules/delete', methods=['POST'])
@login_required
def delete_alert_rule():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    rule_id = (request.json or {}).get('id')
    if not rule_id:
        return jsonify({'error': 'id required'}), 400
    execute_db(AUTH_DB, "DELETE FROM alert_rules WHERE id=?", (rule_id,))
    return jsonify({'success': True})

@app.route('/api/alerts/rules/toggle', methods=['POST'])
@login_required
def toggle_alert_rule():
    rule_id = (request.json or {}).get('id')
    if not rule_id:
        return jsonify({'error': 'id required'}), 400
    execute_db(AUTH_DB,
        "UPDATE alert_rules SET enabled=CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?",
        (rule_id,))
    return jsonify({'success': True})

@app.route('/api/alerts/log')
@login_required
def alert_log():
    return jsonify(query_db(AUTH_DB,
        "SELECT * FROM alert_log ORDER BY timestamp DESC LIMIT 100"))

@app.route('/api/alerts/stats')
@login_required
def alert_stats():
    rules = query_db(AUTH_DB,
        "SELECT id,name,host_match,text_match,hit_count,last_hit,enabled FROM alert_rules ORDER BY hit_count DESC")
    
    total_sent_rows = query_db(AUTH_DB, "SELECT COUNT(*) as count FROM alert_log WHERE sent=1")
    total_failed_rows = query_db(AUTH_DB, "SELECT COUNT(*) as count FROM alert_log WHERE sent=0")
    
    total_sent = total_sent_rows[0]['count'] if total_sent_rows else 0
    total_failed = total_failed_rows[0]['count'] if total_failed_rows else 0
    
    return jsonify({'rules': rules, 'total_sent': total_sent, 'total_failed': total_failed})


# ── EMAIL TEMPLATE ROUTES ────────────────────────────────────────────────────
@app.route('/api/alerts/template', methods=['GET'])
@login_required
def get_template():
    subject, body = get_email_template()
    return jsonify({'subject': subject, 'body': body})

@app.route('/api/alerts/template', methods=['POST'])
@login_required
def save_template():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d    = request.json or {}
    subj = d.get('subject', '').strip()
    body = d.get('body', '').strip()
    if not subj or not body:
        return jsonify({'error': 'Subject and body required'}), 400
    save_email_template(subj, body)
    return jsonify({'success': True})

# ── MAC MAPPING ROUTES ───────────────────────────────────────────────────────
@app.route('/api/tftp/mac_mapping', methods=['GET'])
@login_required
def get_mac_mapping():
    return jsonify(query_db(SYSLOG_DB,
        "SELECT * FROM mac_mapping ORDER BY olt_hostname"))

@app.route('/api/tftp/mac_mapping/add', methods=['POST'])
@login_required
def add_mac_mapping():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d        = request.json or {}
    mac      = d.get('olt_mac', '').strip().upper()
    hostname = d.get('olt_hostname', '').strip()
    desc     = d.get('description', '').strip()
    if not mac or not hostname:
        return jsonify({'error': 'olt_mac and olt_hostname required'}), 400
    # Normalize MAC format to XX:XX:XX:XX:XX:XX
    clean = mac.replace(':', '').replace('-', '').replace('.', '')
    if len(clean) != 12:
        return jsonify({'error': 'Invalid MAC address format'}), 400
    mac_fmt = ':'.join(clean[i:i+2] for i in range(0, 12, 2)).upper()
    
    success = execute_db(
        SYSLOG_DB,
        "INSERT INTO mac_mapping (olt_mac,olt_hostname,description,created_at) VALUES (?,?,?,?) "
        "ON CONFLICT(olt_mac) DO UPDATE SET olt_hostname=EXCLUDED.olt_hostname, description=EXCLUDED.description",
        (mac_fmt, hostname, desc, datetime.datetime.now().isoformat()),
    )

    if success:
        return jsonify({'success': True, 'mac': mac_fmt})
    else:
        return jsonify({'error': 'Database error'}), 400


@app.route('/api/tftp/mac_mapping/delete', methods=['POST'])
@login_required
def delete_mac_mapping():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    mac = (request.json or {}).get('olt_mac', '')
    execute_db(SYSLOG_DB, "DELETE FROM mac_mapping WHERE olt_mac=?", (mac,))
    return jsonify({'success': True})

@app.route('/api/tftp/syslog_devices', methods=['GET'])
@login_required
def tftp_syslog_devices():
    # Return syslog devices for hostname dropdown in MAC mapping
    return jsonify(query_db(SYSLOG_DB,
        "SELECT olt_hostname, name, source_ip FROM syslog_devices ORDER BY olt_hostname"))

# ── BACKUP & RESTORE ──────────────────────────────────────────────────────────
@app.route('/api/backup/download')
@login_required
def backup_download():
    backup = build_full_backup()
    return Response(
        json.dumps(backup, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment; filename=SimpleNOC_backup.json'}
    )


@app.route('/api/backup/restore', methods=['POST'])
@login_required
def backup_restore():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    payload = request.json or {}
    if not payload.get('version'):
        return jsonify({'error': 'Invalid backup file'}), 400
    try:
        restored = restore_full_backup(payload)
        return jsonify({'success': True, 'restored': restored})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


# ── TFTP ROUTES ──────────────────────────────────────────────────────────────
@app.route('/api/tftp/files')
@login_required
def tftp_files():
    return jsonify(query_db(TFTP_DB,
        "SELECT * FROM tftp_files ORDER BY timestamp DESC LIMIT 200"))

@app.route('/api/tftp/stats')
@login_required
def tftp_stats():
    total_rows = query_db(TFTP_DB, "SELECT COUNT(*) as count FROM tftp_files")
    ok_count_rows = query_db(TFTP_DB, "SELECT COUNT(*) as count FROM tftp_files WHERE status='ok'")
    total_sz_rows = query_db(TFTP_DB, "SELECT SUM(file_size) as total_size FROM tftp_files WHERE status='ok'")
    recent = query_db(TFTP_DB, "SELECT * FROM tftp_files ORDER BY timestamp DESC LIMIT 5")
    cfg_rows = query_db(TFTP_DB, "SELECT * FROM tftp_config WHERE id=1")
    
    total = total_rows[0]['count'] if total_rows else 0
    ok_count = ok_count_rows[0]['count'] if ok_count_rows else 0
    total_sz = total_sz_rows[0]['total_size'] if total_sz_rows and total_sz_rows[0]['total_size'] else 0
    cfg = cfg_rows[0] if cfg_rows else {}
    
    return jsonify({
        'total': total, 'ok': ok_count,
        'total_size': total_sz, 'recent': recent,
        'config': cfg
    })


@app.route('/api/tftp/config', methods=['GET'])
@login_required
def get_tftp_config():
    rows = query_db(TFTP_DB, "SELECT * FROM tftp_config WHERE id=1")
    return jsonify(rows[0] if rows else {})


@app.route('/api/tftp/config', methods=['POST'])
@login_required
def save_tftp_config():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    backup_dir = d.get('backup_dir', '').strip()
    if not backup_dir:
        return jsonify({'error': 'backup_dir required'}), 400
    try:
        os.makedirs(backup_dir, exist_ok=True)
    except Exception as e:
        return jsonify({'error': f'Cannot create directory: {e}'}), 400
    execute_db(TFTP_DB, "UPDATE tftp_config SET backup_dir=?, enabled=? WHERE id=1",
                 (backup_dir, 1 if d.get('enabled', True) else 0))
    return jsonify({'success': True})


@app.route('/api/tftp/download/<int:file_id>')
@login_required
def tftp_download(file_id):
    rows = query_db(TFTP_DB, "SELECT * FROM tftp_files WHERE id=?", (file_id,))
    if not rows:
        return jsonify({'error': 'File not found'}), 404
    row = rows[0]

    file_path = row['file_path']
    if not os.path.exists(file_path):
        return jsonify({'error': 'File missing from disk'}), 404
    from flask import send_file
    return send_file(file_path, as_attachment=True,
                     download_name=row['stored_name'])

@app.route('/api/tftp/delete/<int:file_id>', methods=['POST'])
@login_required
def tftp_delete(file_id):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    rows = query_db(TFTP_DB, "SELECT * FROM tftp_files WHERE id=?", (file_id,))
    if rows:
        row = rows[0]
        try:
            if os.path.exists(row['file_path']):
                os.remove(row['file_path'])
        except Exception:
            pass
        execute_db(TFTP_DB, "DELETE FROM tftp_files WHERE id=?", (file_id,))
    return jsonify({'success': True})



# ── OLT MANAGEMENT ROUTES ─────────────────────────────────────────────────────
@app.route('/api/olt/profiles', methods=['GET'])
@login_required
def get_olt_profiles():
    return jsonify(query_db(OLT_DB,
        "SELECT id,name,ip,ssh_port,telnet_port,conn_type,olt_model,username,uplink_ports,last_poll,last_status FROM olt_profiles ORDER BY name"))

@app.route('/api/olt/profiles/add', methods=['POST'])
@login_required
def add_olt_profile():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    if not d.get('ip') or not d.get('username') or not d.get('password'):
        return jsonify({'error': 'ip, username and password required'}), 400
    ip = d['ip'].strip()
    ssh_port = int(d.get('ssh_port', 22))
    telnet_port = int(d.get('telnet_port', 23))
    existing = query_db(
        OLT_DB,
        "SELECT id FROM olt_profiles WHERE ip=? AND ssh_port=? AND telnet_port=?",
        (ip, ssh_port, telnet_port)
    )
    if existing:
        return jsonify({'error': 'OLT profile already exists for this IP and port combination'}), 409
    success = execute_db(OLT_DB,
        "INSERT INTO olt_profiles (name,ip,ssh_port,telnet_port,conn_type,olt_model,username,password,enable_pass,uplink_ports,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (d.get('name', ip), ip,
            ssh_port, telnet_port,
            d.get('conn_type', d.get('conn_method', 'auto')),
            (d.get('olt_model') or 'V1600G1').strip().upper(),
            d['username'], d['password'], d.get('enable_pass', d['password']),
            d.get('uplink_ports', 'gigabitethernet 0/10'),
            datetime.datetime.now().isoformat()))
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Database error while saving OLT profile'}), 500


@app.route('/api/olt/profiles/update', methods=['POST'])
@login_required
def update_olt_profile():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    pid = d.get('id')
    if not pid:
        return jsonify({'error': 'id required'}), 400
    ip = d.get('ip', '').strip()
    ssh_port = int(d.get('ssh_port', 22))
    telnet_port = int(d.get('telnet_port', 23))
    existing = query_db(
        OLT_DB,
        "SELECT id FROM olt_profiles WHERE ip=? AND ssh_port=? AND telnet_port=? AND id<>?",
        (ip, ssh_port, telnet_port, pid)
    )
    if existing:
        return jsonify({'error': 'Another OLT profile already uses this IP and port combination'}), 409
    success = execute_db(OLT_DB,
        "UPDATE olt_profiles SET name=?,ip=?,ssh_port=?,telnet_port=?,conn_type=?,olt_model=?,username=?,password=?,enable_pass=?,uplink_ports=? WHERE id=?",
        (d.get('name',''), ip,
         ssh_port, telnet_port,
         d.get('conn_type', d.get('conn_method', 'auto')),
         (d.get('olt_model') or 'V1600G1').strip().upper(),
         d.get('username',''), d.get('password',''), d.get('enable_pass',''),
         d.get('uplink_ports', 'gigabitethernet 0/10'), pid))
    if not success:
        return jsonify({'error': 'Database error while updating OLT profile'}), 500
    return jsonify({'success': True})


@app.route('/api/olt/profiles/delete', methods=['POST'])
@login_required
def delete_olt_profile():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    pid = (request.json or {}).get('id')
    execute_db(OLT_DB, "DELETE FROM olt_profiles WHERE id=?", (pid,))
    execute_db(OLT_DB, "DELETE FROM olt_poll_jobs WHERE profile_id=?", (pid,))
    return jsonify({'success': True})

@app.route('/api/olt/jobs', methods=['GET'])
@login_required
def get_olt_jobs():
    return jsonify(query_db(OLT_DB, "SELECT * FROM olt_poll_jobs ORDER BY enabled DESC, next_run ASC, id DESC"))

@app.route('/api/olt/jobs/add', methods=['POST'])
@login_required
def add_olt_job():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    d = request.json or {}
    profile_id = d.get('profile_id')
    poll_type = (d.get('poll_type') or 'full').strip().lower()
    run_mode = (d.get('run_mode') or 'repeat').strip().lower()
    start_at = (d.get('start_at') or '').strip()
    interval_min = int(d.get('interval_min', 60) or 60)
    selected_ports = (d.get('selected_ports') or '').strip()
    if not profile_id:
        return jsonify({'error': 'profile_id required'}), 400
    if poll_type not in ('full', 'uplink'):
        return jsonify({'error': 'invalid poll_type'}), 400
    if run_mode not in ('once', 'repeat'):
        return jsonify({'error': 'invalid run_mode'}), 400
    
    profiles = query_db(OLT_DB, "SELECT id,name,ip FROM olt_profiles WHERE id=?", (profile_id,))
    if not profiles:
        return jsonify({'error': 'Profile not found'}), 404
    profile = profiles[0]
    
    start_dt = _parse_dt(start_at) or datetime.datetime.now()
    next_run = start_dt.replace(microsecond=0).isoformat()
    execute_db(OLT_DB, """INSERT INTO olt_poll_jobs
                    (profile_id,profile_name,profile_ip,poll_type,run_mode,start_at,interval_min,selected_ports,next_run,last_status,last_error,enabled,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                 (profile['id'], profile['name'] or profile['ip'], profile['ip'], poll_type, run_mode,
                  start_dt.replace(microsecond=0).isoformat(), interval_min, selected_ports, next_run, 'scheduled', '', 1, _now_iso()))
    return jsonify({'success': True})


@app.route('/api/olt/jobs/toggle', methods=['POST'])
@login_required
def toggle_olt_job():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    job_id = (request.json or {}).get('id')
    if not job_id:
        return jsonify({'error': 'id required'}), 400
    rows = query_db(OLT_DB, "SELECT enabled,run_mode,interval_min,last_run,start_at FROM olt_poll_jobs WHERE id=?", (job_id,))
    if not rows:
        return jsonify({'error': 'Job not found'}), 404
    row = rows[0]
    enabled = 0 if row['enabled'] else 1
    next_run = None
    if enabled:
        start_dt = _parse_dt(row['start_at']) or datetime.datetime.now()
        if row['run_mode'] == 'once':
            next_run = start_dt.replace(microsecond=0).isoformat()
        else:
            next_run = _compute_job_next_run('repeat', row['interval_min'], row['last_run'] or start_dt.replace(microsecond=0).isoformat())
    execute_db(OLT_DB, "UPDATE olt_poll_jobs SET enabled=?, next_run=? WHERE id=?", (enabled, next_run, job_id))
    return jsonify({'success': True})


@app.route('/api/olt/jobs/delete', methods=['POST'])
@login_required
def delete_olt_job():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Admin only'}), 403
    job_id = (request.json or {}).get('id')
    if not job_id:
        return jsonify({'error': 'id required'}), 400
    execute_db(OLT_DB, "DELETE FROM olt_poll_jobs WHERE id=?", (job_id,))
    return jsonify({'success': True})

@app.route('/api/olt/poll', methods=['POST'])
@login_required
def poll_olt_now():
    d  = request.json or {}
    pid = d.get('id')
    if not pid:
        return jsonify({'error': 'id required'}), 400
    rows = query_db(OLT_DB, "SELECT * FROM olt_profiles WHERE id=?", (pid,))
    if not rows:
        return jsonify({'error': 'Profile not found'}), 404
    row = rows[0]

    try:
        from olt_connector import poll_olt
        set_olt_poll_progress(pid, 'Queued', row['name'] or row['ip'])
        result = poll_olt(dict(row), progress_callback=lambda stage, detail='': set_olt_poll_progress(pid, stage, detail))
        set_olt_poll_progress(pid, 'Completed' if result.get('success') else 'Failed',
                              result.get('error', '') or result.get('detail', ''),
                              done=True, error=result.get('error', ''))
        return jsonify(result)
    except Exception as e:
        set_olt_poll_progress(pid, 'Failed', str(e), done=True, error=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/olt/poll_onu', methods=['POST'])
@login_required
def poll_onu_only():
    """Poll ONU info only — fast, no uplink commands."""
    d   = request.json or {}
    pid = d.get('id')
    if not pid:
        return jsonify({'error': 'id required'}), 400
    rows = query_db(OLT_DB, "SELECT * FROM olt_profiles WHERE id=?", (pid,))
    if not rows:
        return jsonify({'error': 'Profile not found'}), 404
    row = rows[0]

    try:
        from olt_connector import poll_onu_only
        set_olt_poll_progress(pid, 'Queued', row['name'] or row['ip'])
        result = poll_onu_only(dict(row), progress_callback=lambda stage, detail='': set_olt_poll_progress(pid, stage, detail))
        set_olt_poll_progress(pid, 'Completed' if result.get('success') else 'Failed',
                              result.get('error', '') or result.get('detail', ''),
                              done=True, error=result.get('error', ''))
        return jsonify(result)
    except Exception as e:
        set_olt_poll_progress(pid, 'Failed', str(e), done=True, error=str(e))
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/olt/poll_progress', methods=['GET'])
@login_required
def get_olt_poll_progress_route():
    pid = request.args.get('id', '')
    if not pid:
        return jsonify({'error': 'id required'}), 400
    return jsonify(get_olt_poll_progress(pid))

@app.route('/api/olt/poll_uplink', methods=['POST'])
@login_required
def poll_uplink_only():
    """Poll one or more uplink interfaces only.
    Body: { id: <profile_id>, interfaces: ['gigabitethernet 0/1', ...] }
    If interfaces is omitted, uses the profile's saved uplink_ports.
    """
    d   = request.json or {}
    pid = d.get('id')
    if not pid:
        return jsonify({'error': 'id required'}), 400
    rows = query_db(OLT_DB, "SELECT * FROM olt_profiles WHERE id=?", (pid,))
    if not rows:
        return jsonify({'error': 'Profile not found'}), 404
    row = rows[0]

    interfaces = d.get('interfaces')   # list or None
    if isinstance(interfaces, str):
        interfaces = [i.strip() for i in interfaces.split(',') if i.strip()]
    try:
        from olt_connector import poll_uplink_only
        result = poll_uplink_only(dict(row), interfaces=interfaces)
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/olt/raw_output', methods=['POST'])
@login_required
def raw_output():
    """Diagnostic: connect to OLT, run a single command, return raw text output.
    Body: { id: <profile_id>, command: 'show interface gigabitethernet 0/1' }
    """
    d   = request.json or {}
    pid = d.get('id')
    cmd = (d.get('command') or '').strip()
    if not pid or not cmd:
        return jsonify({'error': 'id and command required'}), 400
    rows = query_db(OLT_DB, "SELECT * FROM olt_profiles WHERE id=?", (pid,))
    if not rows:
        return jsonify({'error': 'Profile not found'}), 404
    row = rows[0]

    try:
        from olt_connector import connect_and_run
        outputs, method, error = connect_and_run(dict(row), [cmd])
        if error:
            return jsonify({'success': False, 'error': error, 'method': method})
        raw = outputs.get(cmd, '') if outputs else ''
        return jsonify({'success': True, 'method': method, 'command': cmd,
                        'raw_output': raw, 'length': len(raw)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/olt/onus', methods=['GET'])
@login_required
def get_onus():
    ip        = request.args.get('ip', '')
    pon_port  = request.args.get('pon_port', '')
    poll_time = request.args.get('poll_time', '')
    if ip and not poll_time:
        rows = query_db(OLT_DB,
            "SELECT MAX(poll_time) as pt FROM onu_data WHERE olt_ip=?", (ip,))
        if rows and rows[0]['pt']:
            poll_time = rows[0]['pt']
    sql    = "SELECT * FROM onu_data WHERE 1=1"
    params = []
    if ip:
        sql += " AND olt_ip=?";        params.append(ip)
    if poll_time:
        sql += " AND poll_time=?";     params.append(poll_time)
    if pon_port:
        sql += " AND pon_port=?";      params.append(pon_port)
    sql += " ORDER BY CAST(pon_port AS INT), CAST(onu_id AS INT)"
    return jsonify(query_db(OLT_DB, sql, params))

@app.route('/api/olt/sessions', methods=['GET'])
@login_required
def get_olt_sessions():
    ip = request.args.get('ip', '')
    if ip:
        return jsonify(query_db(OLT_DB,
            "SELECT * FROM olt_poll_sessions WHERE olt_ip=? ORDER BY poll_time DESC LIMIT 20", (ip,)))
    return jsonify(query_db(OLT_DB,
        "SELECT * FROM olt_poll_sessions ORDER BY poll_time DESC LIMIT 50"))

@app.route('/api/olt/poll_times', methods=['GET'])
@login_required
def get_poll_times():
    ip = request.args.get('ip', '')
    poll_date = request.args.get('date', '')
    limit = min(max(int(request.args.get('limit', 50)), 1), 500)
    sql = "SELECT DISTINCT poll_time FROM onu_data WHERE olt_ip=?"
    params = [ip]
    if poll_date:
        sql += " AND substr(poll_time, 1, 10)=?"
        params.append(poll_date)
    sql += " ORDER BY poll_time DESC LIMIT ?"
    params.append(limit)
    return jsonify(query_db(OLT_DB,
        sql, params))

@app.route('/api/olt/poll_dates', methods=['GET'])
@login_required
def get_poll_dates():
    ip = request.args.get('ip', '')
    limit = min(max(int(request.args.get('limit', 180)), 1), 365)
    return jsonify(query_db(OLT_DB,
        """SELECT substr(poll_time, 1, 10) AS poll_date, COUNT(DISTINCT poll_time) AS polls
           FROM onu_data
           WHERE olt_ip=?
           GROUP BY substr(poll_time, 1, 10)
           ORDER BY poll_date DESC
           LIMIT ?""",
        (ip, limit)))

@app.route('/api/olt/pon_ports', methods=['GET'])
@login_required
def get_pon_ports():
    ip = request.args.get('ip', '')
    return jsonify(query_db(OLT_DB,
        "SELECT DISTINCT pon_port, COUNT(*) as onu_count FROM onu_data WHERE olt_ip=? GROUP BY pon_port ORDER BY CAST(pon_port AS INT)",
        (ip,)))




@app.route('/api/olt/uplink_stats', methods=['GET'])
@login_required
def get_uplink_stats():
    ip    = request.args.get('ip', '')
    iface = request.args.get('interface', '')
    limit = int(request.args.get('limit', 5))
    sql = "SELECT * FROM uplink_stats WHERE olt_ip=?"
    params = [ip]
    if iface:
        sql += " AND interface=?"
        params.append(iface)
    sql += " ORDER BY poll_time DESC LIMIT ?"
    params.append(limit)
    return jsonify(query_db(OLT_DB, sql, params))

@app.route('/api/olt/uplink_aggregate', methods=['GET'])
@login_required
def get_uplink_aggregate():
    ip = request.args.get('ip', '')
    iface = request.args.get('interface', '')
    rng = (request.args.get('range') or 'day').strip().lower()
    if rng not in ('day', 'week', 'month'):
        rng = 'day'

    now = datetime.datetime.now()
    if rng == 'day':
        cutoff = now - datetime.timedelta(days=1)
        bucket = 'hour'
    elif rng == 'week':
        cutoff = now - datetime.timedelta(days=7)
        bucket = 'day'
    else:
        cutoff = now - datetime.timedelta(days=30)
        bucket = 'day'

    sql = f"""SELECT
        DATE_TRUNC('{bucket}', poll_time::timestamp) AS poll_time,
        olt_ip,
        COALESCE(interface, '') AS interface,
        AVG(COALESCE(in_mbps,0))  AS in_mbps,
        AVG(COALESCE(out_mbps,0)) AS out_mbps,
        COUNT(*) AS samples
      FROM uplink_stats
      WHERE olt_ip=? AND poll_time >= ?"""
    params = [ip, cutoff.replace(microsecond=0).isoformat()]
    if iface:
        sql += " AND interface=?"
        params.append(iface)
    sql += " GROUP BY poll_time, olt_ip, interface ORDER BY poll_time ASC"
    rows = query_db(OLT_DB, sql, params)
    # Normalize poll_time into ISO strings (pg may return datetime)
    for r in rows:
        pt = r.get('poll_time')
        if hasattr(pt, 'isoformat'):
            r['poll_time'] = pt.replace(microsecond=0).isoformat()
    return jsonify(rows)

@app.route('/api/olt/uplink_latest', methods=['GET'])
@login_required
def get_uplink_latest():
    ip = request.args.get('ip', '')
    # Get latest row per interface for this OLT.
    rows = query_db(OLT_DB, "SELECT * FROM uplink_stats WHERE olt_ip=? ORDER BY poll_time DESC LIMIT 50", (ip,))
    
    # Keep only latest per interface
    seen = {}
    result = []
    for r in rows:
        iface = r.get('interface','')
        if iface not in seen:
            seen[iface] = True
            result.append(r)
    return jsonify(result)


@app.route('/api/olt/onu_summary', methods=['GET'])
@login_required
def get_onu_summary():
    ip   = request.args.get('ip', '')


threading.Thread(target=olt_job_scheduler, daemon=True).start()
threading.Thread(target=retention_cleanup_worker, daemon=True).start()


if __name__ == '__main__':
    import ssl as _ssl
    from datetime import timedelta
    from werkzeug.serving import make_server

    app.permanent_session_lifetime = timedelta(hours=12)

    http_port  = _cfg.API_PORT
    https_port = HTTPS_PORT

    # ── Resolve SSL certificate ────────────────────────────────────────────────
    cert_path = SSL_CERT or ''
    key_path  = SSL_KEY  or ''

    if https_port:
        if not cert_path or not key_path:
            try:
                from gen_cert import ensure_ssl_cert
                cert_path, key_path = ensure_ssl_cert(BASE_DIR)
            except Exception as e:
                print(f"[SSL] Certificate generation failed: {e}")
                print("[SSL] HTTPS disabled — fix the error above and restart.")
                https_port = 0

    # ── Build SSL context ──────────────────────────────────────────────────────
    ssl_ctx = None
    if https_port and cert_path and key_path:
        try:
            ssl_ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_SERVER)
            ssl_ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
            ssl_ctx.minimum_version = _ssl.TLSVersion.TLSv1_2
            print(f"[SSL] TLS context ready  — cert: {cert_path}")
        except Exception as e:
            print(f"[SSL] Failed to load certificate: {e}")
            print("[SSL] HTTPS disabled.")
            ssl_ctx = None
            https_port = 0

    # ── HTTP server (redirect or full app) — with port-busy retry ──────────────
    app.config['SESSION_COOKIE_SECURE'] = bool(https_port and ssl_ctx)

    def _run_http():
        import socket as _socket
        target_app = None
        label = ""

        if HTTP_REDIRECT and https_port:
            from flask import Flask as _Flask, redirect as _redir, request as _req
            redir_app = _Flask("__redirect__")

            @redir_app.route("/", defaults={"path": ""})
            @redir_app.route("/<path:path>")
            def _do_redirect(path):
                host = _req.host.split(":")[0]
                target = f"https://{host}:{https_port}/{path}"
                qs = _req.query_string.decode()
                if qs:
                    target += "?" + qs
                return _redir(target, code=301)

            target_app = redir_app
            label = f"[HTTP]  Redirect  http://localhost:{http_port}  ->  https://localhost:{https_port}"
        else:
            target_app = app
            label = f"[HTTP]  Dashboard http://localhost:{http_port}"

        # Retry loop — old process may still hold the port for a few seconds
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                srv = make_server("0.0.0.0", http_port, target_app)
                print(label)
                srv.serve_forever()
                return
            except OSError as e:
                if "address" in str(e).lower() or e.errno in (98, 10048, 10049):
                    print(f"[HTTP]  Port {http_port} busy, retrying in 2s...")
                    time.sleep(2)
                else:
                    print(f"[HTTP]  Error: {e}")
                    return
        print(f"[HTTP]  Could not bind to port {http_port} after 30s — HTTP redirect disabled.")

    # ── HTTPS server — with port-busy retry ────────────────────────────────────
    def _run_https():
        if not ssl_ctx:
            return
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                srv = make_server("0.0.0.0", https_port, app, ssl_context=ssl_ctx)
                print(f"[HTTPS] Dashboard https://localhost:{https_port}")
                srv.serve_forever()
                return
            except OSError as e:
                if "address" in str(e).lower() or e.errno in (98, 10048, 10049):
                    print(f"[HTTPS] Port {https_port} busy, retrying in 2s...")
                    time.sleep(2)
                else:
                    print(f"[HTTPS] Error: {e}")
                    return
        print(f"[HTTPS] Could not bind to port {https_port} after 30s.")

    print("=" * 55)
    print("  SimpleNOC v0.5.5.2  –  Starting servers")
    print("=" * 55)
    print(f"  Default login : admin / admin123")

    if https_port and ssl_ctx:
        t_http  = threading.Thread(target=_run_http,  daemon=True, name="http-server")
        t_https = threading.Thread(target=_run_https, daemon=True, name="https-server")
        t_http.start()
        t_https.start()
        print("=" * 55)
        try:
            while t_https.is_alive():
                t_https.join(timeout=1)
        except KeyboardInterrupt:
            print("\n[NOC] Shutting down.")
    else:
        # HTTPS disabled — run plain HTTP on main thread (with retry)
        print(f"  Dashboard : http://localhost:{http_port}")
        print("=" * 55)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                app.run(host='0.0.0.0', port=http_port, debug=False)
                break
            except OSError:
                print(f"[HTTP]  Port {http_port} busy, retrying in 2s...")
                time.sleep(2)
