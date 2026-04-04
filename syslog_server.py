"""
SimpleNOC v0.5.5.1 - Syslog Server
Listens on UDP port defined in noc_config.py (default 514)
Change SYSLOG_PORT in noc_config.py to use a custom port
"""
import socket, datetime, threading, re, queue, time
import noc_config as cfg
from noc_config import execute_db, query_db, get_db_connection
from alert_engine import process_alert

DB_PATH     = cfg.SYSLOG_DB
SYSLOG_PORT = cfg.SYSLOG_PORT
OFFLINE_S   = cfg.OFFLINE_AFTER_SECS
write_queue = queue.Queue()

# ── SYSLOG PARSING ────────────────────────────────────────────────────────────
SEVERITY = {0:'Emergency',1:'Alert',2:'Critical',3:'Error',4:'Warning',5:'Notice',6:'Info',7:'Debug'}
FACILITY = {0:'kernel',1:'user',2:'mail',3:'system',4:'auth',5:'syslog',6:'lpr',7:'news',
            8:'uucp',9:'cron',10:'authpriv',11:'ftp',16:'local0',17:'local1',18:'local2',
            19:'local3',20:'local4',21:'local5',22:'local6',23:'local7'}
SEVERITY_LABEL = {0:'Emergency',1:'Alert',2:'Critical',3:'Major',4:'Warning',5:'Notice',6:'Info',7:'Debug'}

# Order matters — specific patterns before general ones
EVENT_PATTERNS = [
    # ── OLT UPLINK PORT (all ports: 0/9, 0/10, 0/11, 1/0 etc.) ─────────────
    ('uplink-port',                    'UPLINK'),      # parsed further below

    # ── OLT USER LOGIN/LOGOUT (web and vty) ──────────────────────────────────
    ('logged out from',                'USER_LOGOUT'), # must be before logged in
    ('logged in from',                 'USER_LOGIN'),
    ('login failed',                   'LOGIN_FAILED'),

    # ── OLT SYSTEM ───────────────────────────────────────────────────────────
    ('cold start',                     'OLT_COLD_START'),
    ('warm start',                     'OLT_WARM_START'),
    ('reboot',                         'OLT_REBOOT'),

    # ── ONU (stored but filtered from OLT events view) ───────────────────────
    ('onu offline',                    'ONU_OFFLINE'),
    ('onu online',                     'ONU_ONLINE'),
    ('onu dying gasp',                 'ONU_DYING_GASP'),
    ('onu register',                   'ONU_REGISTER'),
    ('onu deregist',                   'ONU_DEREGISTER'),
    ('onu bip8',                       'ONU_BIP8_ERR'),
    ('onu los',                        'ONU_LOS'),
]

# OLT-level events shown in main events dashboard
OLT_EVENTS = {
    'UPLINK_UP', 'UPLINK_DOWN',
    'USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED',
    'OLT_COLD_START', 'OLT_WARM_START', 'OLT_REBOOT',
}

ONU_PATTERN = re.compile(r'PON\s+(\d+/\d+)\s+ONU\s+(\d+)(?:\s+sn\s+(\S+))?', re.IGNORECASE)

def detect_event(msg):
    ml = msg.lower()
    for pat, tag in EVENT_PATTERNS:
        if pat in ml:
            if tag == 'UPLINK':
                # Determine up or down from message
                return 'UPLINK_DOWN' if 'down' in ml else 'UPLINK_UP'
            return tag
    return 'GENERAL'

UPLINK_PATTERN = re.compile(r'Uplink-port\s+([\d/]+)\s+(Up|Down)', re.IGNORECASE)
LOGIN_PATTERN  = re.compile(r'User\s+(\S+)\s+logged\s+(in|out)\s+from\s+([\d.]+)(?:\s+on\s+(\S+))?', re.IGNORECASE)
FAIL_PATTERN   = re.compile(r'User\s+(\S+)\s+login\s+failed\s+from\s+([\d.]+)', re.IGNORECASE)

def extract_onu(msg):
    m = ONU_PATTERN.search(msg)
    if m:
        return m.group(1), m.group(2), m.group(3) or ''
    return '', '', ''

def extract_uplink(msg):
    m = UPLINK_PATTERN.search(msg)
    if m:
        return m.group(1), m.group(2).upper()  # port, state
    return '', ''

def extract_login(msg):
    m = LOGIN_PATTERN.search(msg)
    if m:
        return m.group(1), m.group(3)  # username, from_ip
    return '', ''

def parse_syslog(data, source_ip):
    raw  = data.decode('utf-8', errors='replace').strip()
    out  = dict(source_ip=source_ip, timestamp=datetime.datetime.now().isoformat(),
                facility='system', severity='Info', severity_num=6,
                hostname=source_ip, process='', message=raw, raw=raw)
    m = re.match(r'<(\d+)>(.*)', raw, re.DOTALL)
    if not m:
        return out
    pri  = int(m.group(1))
    rest = m.group(2).strip()
    out['facility']     = FACILITY.get(pri >> 3, str(pri >> 3))
    out['severity']     = SEVERITY_LABEL.get(pri & 7, 'Info')
    out['severity_num'] = pri & 7

    # RFC 3164: "MMM DD HH:MM:SS HOSTNAME PROCESS[PID]: MSG"
    ts = re.match(r'(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.*)', rest, re.DOTALL)
    if ts:
        rest = ts.group(2).strip()
    parts = rest.split(None, 1)
    if parts:
        out['hostname'] = parts[0]
        remainder = parts[1] if len(parts) > 1 else ''
        pm = re.match(r'(\S+?)(?:\[\d+\])?:\s*(.*)', remainder, re.DOTALL)
        if pm:
            out['process'] = pm.group(1)
            out['message'] = pm.group(2).strip()
        else:
            out['message'] = remainder.strip()
    return out

# ── DATABASE ──────────────────────────────────────────────────────────────────
def init_db(path=None):
    if path is None: path = DB_PATH
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    pk = "SERIAL" if db_type == 'postgres' else "INTEGER PRIMARY KEY AUTOINCREMENT"
    
    # Ensure tables exist
    execute_db(path, f'''CREATE TABLE IF NOT EXISTS syslog (
        id {pk},
        timestamp TEXT, source_ip TEXT, olt_hostname TEXT, olt_id TEXT,
        facility TEXT, severity TEXT, severity_num INTEGER,
        hostname TEXT, process TEXT, message TEXT, event_tag TEXT,
        onu_pon TEXT, onu_id TEXT, onu_sn TEXT, raw TEXT)''')
    
    execute_db(path, '''CREATE TABLE IF NOT EXISTS syslog_devices (
        olt_hostname TEXT PRIMARY KEY, source_ip TEXT, olt_id TEXT,
        name TEXT, last_seen TEXT, status TEXT DEFAULT 'unknown',
        olt_mac TEXT DEFAULT '')''')

    execute_db(path, '''CREATE TABLE IF NOT EXISTS mac_mapping (
        olt_mac      TEXT PRIMARY KEY,
        olt_hostname TEXT,
        description  TEXT DEFAULT '',
        created_at   TEXT)''')

    # Add indexes for performance
    if db_type == 'postgres':
        execute_db(path, "CREATE INDEX IF NOT EXISTS idx_syslog_timestamp ON syslog (timestamp DESC)")
        execute_db(path, "CREATE INDEX IF NOT EXISTS idx_syslog_olt ON syslog (olt_hostname)")
        execute_db(path, "CREATE INDEX IF NOT EXISTS idx_syslog_tag ON syslog (event_tag)")
    else:
        execute_db(path, "CREATE INDEX IF NOT EXISTS idx_syslog_timestamp ON syslog (timestamp)")
        execute_db(path, "CREATE INDEX IF NOT EXISTS idx_syslog_olt ON syslog (olt_hostname)")


def rotate_db():
    """
    Checks if active SQLite syslog DB exceeds 200MB and archives it.
    Returns path of archived DB if rotation occurred, else None.
    """
    try:
        import os
        if not os.path.exists(DB_PATH): return None
        
        size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
        if size_mb < 200: return None
        
        print(f"Syslog DB size {size_mb:.1f}MB exceeds 200MB limit. Rotating...")
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        rotated_path = DB_PATH.replace(".db", f"_{timestamp}.db")
        
        # Renaissance the file
        try:
            os.rename(DB_PATH, rotated_path)
            init_db(DB_PATH) # Create fresh DB
            return rotated_path
        except Exception as re:
            print(f"File rename failed: {re}. If DB is locked, rotation will retry.")
            return None
    except Exception as e:
        print(f"Rotation check error: {e}")
        return None


# ── DB WRITER ─────────────────────────────────────────────────────────────────
# ── DB WRITER ─────────────────────────────────────────────────────────────────
def db_writer():
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    conn = get_db_connection(DB_PATH)
    if not conn:
        print("CRITICAL: Syslog DB writer could not connect to database.")
        return

    print(f"Syslog DB writer ({db_type}) started.")
    
    last_rotate_check = time.time()
    last_prune_check  = time.time()
    
    while True:
        try:
            now_ts = time.time()
            
            # SQLite Rotation (every 60s)
            if db_type == 'sqlite' and now_ts - last_rotate_check > 60:
                if rotate_db(): # If rotated, we need to reconnect
                    conn.close()
                    conn = get_db_connection(DB_PATH)
                    if not conn: break
                last_rotate_check = now_ts

            # PostgreSQL Pruning (every 1 hour)
            if db_type == 'postgres' and now_ts - last_prune_check > 3600:
                retention_days = getattr(cfg, "SYSLOG_RETENTION_DAYS", 7)
                if retention_days > 0:
                    cutoff = (datetime.datetime.now() - datetime.timedelta(days=retention_days)).isoformat()
                    execute_db(DB_PATH, "DELETE FROM syslog WHERE timestamp < ?", (cutoff,))
                    print(f"Pruned syslogs older than {cutoff}")
                last_prune_check = now_ts

            try:
                task = write_queue.get(timeout=2)
            except queue.Empty:
                continue

            if task is None: break
            t = task[0]
            
            if t == 'log':
                p = task[1]
                sql = """INSERT INTO syslog
                    (timestamp,source_ip,olt_hostname,olt_id,facility,severity,severity_num,
                     hostname,process,message,event_tag,onu_pon,onu_id,onu_sn,raw)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
                if db_type == 'postgres': sql = sql.replace('?', '%s')
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(sql, (p['timestamp'], p['source_ip'], p['olt_hostname'], p['olt_id'],
                         p['facility'], p['severity'], p['severity_num'],
                         p['hostname'], p['process'], p['message'], p['event_tag'],
                         p['onu_pon'], p['onu_id'], p['onu_sn'], p['raw']))
                conn.commit()

            elif t == 'device':
                _, src, hostname, olt_id = task
                now = datetime.datetime.now().isoformat()
                if db_type == 'postgres':
                    sql = """INSERT INTO syslog_devices (olt_hostname,source_ip,olt_id,name,last_seen,status)
                             VALUES (%s,%s,%s,%s,%s,'receiving') ON CONFLICT(olt_hostname) DO UPDATE SET
                             source_ip=EXCLUDED.source_ip, last_seen=EXCLUDED.last_seen,
                             status='receiving', olt_id=EXCLUDED.olt_id"""
                else:
                    sql = """INSERT INTO syslog_devices (olt_hostname,source_ip,olt_id,name,last_seen,status)
                             VALUES (?,?,?,?,?,'receiving') ON CONFLICT(olt_hostname) DO UPDATE SET
                             source_ip=excluded.source_ip, last_seen=excluded.last_seen,
                             status='receiving', olt_id=excluded.olt_id"""
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(sql, (hostname, src, olt_id, olt_id, now))
                conn.commit()

            elif t == 'offline':
                now_dt = datetime.datetime.now()
                standby_threshold = (now_dt - datetime.timedelta(seconds=OFFLINE_S)).isoformat()
                offline_threshold = (now_dt - datetime.timedelta(hours=1)).isoformat()
                
                q1 = "UPDATE syslog_devices SET status='offline' WHERE last_seen < ? AND status != 'offline'"
                q2 = "UPDATE syslog_devices SET status='standby' WHERE last_seen >= ? AND last_seen < ? AND status IN ('receiving','online')"
                
                if db_type == 'postgres':
                    q1 = q1.replace('?', '%s'); q2 = q2.replace('?', '%s')
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(q1, (offline_threshold,))
                    cur.execute(q2, (offline_threshold, standby_threshold))
                conn.commit()

            write_queue.task_done()
        except Exception as e:
            print(f"Syslog DB writer error: {e}")
            try: conn.rollback()
            except: pass
            time.sleep(1) # Prevent tight error loop
    
    if conn: conn.close()

    conn.close()

def offline_checker():
    while True:
        time.sleep(30)
        write_queue.put(('offline',))

def start():
    init_db()
    threading.Thread(target=db_writer,       daemon=True).start()
    threading.Thread(target=offline_checker,  daemon=True).start()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('0.0.0.0', SYSLOG_PORT))
    print(f"Syslog server listening on UDP port {SYSLOG_PORT}...")

    while True:
        try:
            data, addr = sock.recvfrom(4096)
            src     = addr[0]
            parsed  = parse_syslog(data, src)
            hostname = parsed['hostname']
            onu_pon, onu_id, onu_sn = extract_onu(parsed['message'])
            parsed['olt_hostname'] = hostname
            parsed['olt_id']       = hostname
            parsed['event_tag']    = detect_event(parsed['message'])
            parsed['onu_pon']      = onu_pon
            parsed['onu_id']       = onu_id
            parsed['onu_sn']       = onu_sn

            tag = parsed['event_tag']
            sev = parsed['severity']
            msg = parsed['message']

            # Console output — only show OLT-level events
            if tag in OLT_EVENTS:
                if 'UPLINK' in tag:
                    port, state = extract_uplink(msg)
                    print(f"[{hostname}] [{sev}] [{tag}] Uplink-port {port} is {state} | {src}")
                elif 'LOGIN' in tag or 'LOGOUT' in tag:
                    lm = LOGIN_PATTERN.search(msg)
                    if lm:
                        via = lm.group(4) or 'unknown'
                        print(f"[{hostname}] [{sev}] [{tag}] User:{lm.group(1)} From:{lm.group(3)} Via:{via.upper()} | {src}")
                    else:
                        fm = FAIL_PATTERN.search(msg)
                        if fm:
                            print(f"[{hostname}] [{sev}] [{tag}] FAILED User:{fm.group(1)} From:{fm.group(2)} | {src}")
                else:
                    print(f"[{hostname}] [{sev}] [{tag}] {src} | {msg[:60]}")

            # Store all messages in DB
            write_queue.put(('log',    parsed))
            write_queue.put(('device', src, hostname, hostname))

            # Check alert rules
            try:
                process_alert(hostname, parsed['message'], parsed['timestamp'])
            except Exception as ae:
                pass
        except KeyboardInterrupt:
            write_queue.put(None)
            break
        except Exception as e:
            print(f"Syslog error: {e}")

if __name__ == '__main__':
    start()
