"""
SimpleNOC v0.5.5.1 - TFTP Server
Receives backup files from OLTs via TFTP (UDP port 69).
RFC 1350 - receive only (WRQ).

Key insight from debug: Vsol OLT sends ALL packets from same source port (49803)
to port 69 only. All ACKs must be sent back on the MAIN socket to that source port.
No separate session socket needed.
"""
import socket, os, struct, threading, time, sqlite3
import noc_config as cfg
from noc_config import execute_db, query_db

TFTP_PORT  = cfg.TFTP_PORT
BACKUP_DIR = cfg.BACKUP_DIR
TFTP_DB    = cfg.TFTP_DB

OP_RRQ  = 1
OP_WRQ  = 2
OP_DATA = 3
OP_ACK  = 4
OP_ERROR = 5

# ── DATABASE ──────────────────────────────────────────────────────────────────
def init_tftp_db():
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    pk = "SERIAL" if db_type == 'postgres' else "INTEGER PRIMARY KEY AUTOINCREMENT"
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
    rows = query_db(TFTP_DB, "SELECT COUNT(*) as count FROM tftp_config")
    if not rows or rows[0]['count'] == 0:
        execute_db(TFTP_DB, "INSERT INTO tftp_config (id, backup_dir, enabled) VALUES (1, ?, 1)", (BACKUP_DIR,))

init_tftp_db()

# ── HELPERS ───────────────────────────────────────────────────────────────────
def get_backup_dir():
    try:
        rows = query_db(TFTP_DB, "SELECT backup_dir FROM tftp_config WHERE id=1")
        d = rows[0]['backup_dir'] if rows and rows[0].get('backup_dir') else BACKUP_DIR
    except Exception:
        d = BACKUP_DIR
    os.makedirs(d, exist_ok=True)
    return d

def extract_mac_from_filename(filename):
    # Vsol filename format: MACADDRESS_TIMESTAMP.cfg e.g. 14a72b41db27_20260323.cfg
    import re
    m = re.match(r"^([0-9a-fA-F]{12})_\d+\.cfg$", filename, re.IGNORECASE)
    if m:
        raw = m.group(1).lower()
        return ":".join(raw[i:i+2] for i in range(0, 12, 2))
    return None

def lookup_olt_by_mac(mac):
    if not mac:
        return None, None
    mac_norm = mac.replace(":", "").lower()

    # 1. Check mac_mapping table in syslog.db (user-configured)
    try:
        rows = query_db(
            cfg.SYSLOG_DB,
            "SELECT olt_hostname FROM mac_mapping WHERE LOWER(REPLACE(olt_mac,':',''))=?",
            (mac_norm,)
        )
        if rows:
            hostname = rows[0]["olt_hostname"]
            dev_rows = query_db(
                cfg.SYSLOG_DB,
                "SELECT name, olt_id FROM syslog_devices WHERE olt_hostname=?",
                (hostname,)
            )
            dev = dev_rows[0] if dev_rows else None
            display = (dev["name"] or hostname) if dev else hostname
            olt_id  = dev["olt_id"] if dev else hostname
            return display, olt_id
    except Exception:
        pass

    # 2. Check olt_mac in syslog_devices
    try:
        rows = query_db(cfg.SYSLOG_DB, "SELECT olt_hostname, name, olt_id, olt_mac FROM syslog_devices")
        for row in rows:
            stored = (row["olt_mac"] or "").replace(":", "").lower()
            if stored == mac_norm:
                return row["name"] or row["olt_hostname"], row["olt_id"] or row["olt_hostname"]
    except Exception:
        pass

    # 3. Check traps.db devices
    try:
        rows = query_db(cfg.TRAP_DB, "SELECT olt_id, name, olt_mac FROM devices")
        for row in rows:
            stored = (row["olt_mac"] or "").replace(":", "").lower()
            if stored == mac_norm:
                return row["name"] or row["olt_id"], row["olt_id"]
    except Exception:
        pass

    return None, None

def lookup_olt(source_ip, filename=""):
    # 1. MAC from filename — most reliable for Vsol OLTs
    mac = extract_mac_from_filename(filename)
    if mac:
        name, olt_id = lookup_olt_by_mac(mac)
        if name:
            print(f"[TFTP] Identified by MAC {mac} -> {name}")
            return name, olt_id

    # 2. Source IP in SNMP devices
    try:
        rows = query_db(cfg.TRAP_DB, "SELECT olt_id, name FROM devices WHERE source_ip=?", (source_ip,))
        if rows:
            row = rows[0]
            return row['name'] or row['olt_id'], row['olt_id']
    except Exception:
        pass

    # 3. Source IP in syslog devices
    try:
        rows = query_db(cfg.SYSLOG_DB, "SELECT olt_id, name FROM syslog_devices WHERE source_ip=?", (source_ip,))
        if rows:
            row = rows[0]
            return row['name'] or row['olt_id'], row['olt_id']
    except Exception:
        pass

    # 4. Fall back to source IP
    return source_ip, source_ip

def make_stored_name(olt_name, filename):
    ts       = time.strftime('%Y%m%d_%H%M%S')
    safe_olt = ''.join(c for c in olt_name if c.isalnum() or c in '-_')
    safe_fn  = os.path.basename(filename).replace(' ', '_')
    return f"{safe_olt}_{safe_fn}_{ts}"

def log_file(source_ip, olt_name, olt_id, filename,
             stored_name, file_size, file_path, status="ok"):
    try:
        mac  = extract_mac_from_filename(filename) or ""
        execute_db(
            TFTP_DB,
            """INSERT INTO tftp_files
               (timestamp,source_ip,olt_name,olt_id,filename,
                stored_name,file_size,file_path,status,olt_mac)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (time.strftime("%Y-%m-%dT%H:%M:%S"), source_ip, olt_name, olt_id,
             filename, stored_name, file_size, file_path, status, mac)
        )
        print(f"[TFTP] Logged: {olt_name} ({source_ip}) MAC:{mac or 'N/A'} status:{status}")
    except Exception as e:
        print(f"[TFTP] DB error: {e}")

# ── ACTIVE SESSIONS ───────────────────────────────────────────────────────────
# Track active transfers keyed by (ip, port)
# Each session stores: file handle, expected block, metadata, buffer
sessions = {}
sessions_lock = threading.Lock()

def session_timeout_watcher():
    """Clean up sessions that have been idle for 30 seconds"""
    while True:
        time.sleep(10)
        now = time.time()
        with sessions_lock:
            dead = [k for k, s in sessions.items() if now - s['last_activity'] > 30]
            for k in dead:
                s = sessions.pop(k)
                try:
                    s['file'].close()
                except Exception:
                    pass
                print(f"[TFTP] Session timeout: {k[0]} file={s['filename']}")
                log_file(k[0], s['olt_name'], s['olt_id'], s['filename'],
                         s['stored_name'], 0, s['file_path'], 'timeout')

threading.Thread(target=session_timeout_watcher, daemon=True).start()

# ── MAIN SERVER ───────────────────────────────────────────────────────────────
def start():
    os.makedirs(BACKUP_DIR, exist_ok=True)
        print(f"[TFTP] SimpleNOC v0.5.5.1 TFTP Server")
    print(f"[TFTP] Listening on UDP port {TFTP_PORT}")
    print(f"[TFTP] Backup dir: {get_backup_dir()}")

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.bind(('', TFTP_PORT))
    except PermissionError:
        print(f"[TFTP] ERROR: Cannot bind port {TFTP_PORT} — run as Administrator")
        return
    except OSError as e:
        print(f"[TFTP] ERROR: {e}")
        return

    print(f"[TFTP] Ready — waiting for OLT backups...")

    while True:
        try:
            pkt, addr = sock.recvfrom(516)
            if len(pkt) < 2:
                continue

            opcode = struct.unpack('!H', pkt[:2])[0]

            # ── WRQ: new transfer request ──────────────────────────────────
            if opcode == OP_WRQ:
                try:
                    parts    = pkt[2:].split(b'\x00')
                    filename = parts[0].decode('utf-8', errors='replace').strip()
                    if not filename:
                        filename = 'backup.cfg'
                except Exception:
                    filename = 'backup.cfg'

                source_ip        = addr[0]
                olt_name, olt_id = lookup_olt(source_ip, filename)
                backup_dir       = get_backup_dir()
                stored_name      = make_stored_name(olt_name, filename)
                file_path        = os.path.join(backup_dir, stored_name)

                print(f"[TFTP] WRQ from {source_ip}:{addr[1]} ({olt_name}) file={filename}")

                try:
                    fh = open(file_path, 'wb')
                except Exception as e:
                    print(f"[TFTP] Cannot open file {file_path}: {e}")
                    err = struct.pack('!HH', OP_ERROR, 3) + b'Disk full or access denied\x00'
                    sock.sendto(err, addr)
                    continue

                with sessions_lock:
                    sessions[addr] = {
                        'file':          fh,
                        'expected_block': 1,
                        'filename':       filename,
                        'stored_name':    stored_name,
                        'file_path':      file_path,
                        'olt_name':       olt_name,
                        'olt_id':         olt_id,
                        'source_ip':      source_ip,
                        'last_activity':  time.time(),
                    }

                # ACK block 0 — send on MAIN socket back to OLT's source addr
                sock.sendto(struct.pack('!HH', OP_ACK, 0), addr)
                print(f"[TFTP] Sent ACK 0 to {addr} — waiting for data...")

            # ── DATA: block of file data ───────────────────────────────────
            elif opcode == OP_DATA:
                if len(pkt) < 4:
                    continue

                block = struct.unpack('!H', pkt[2:4])[0]
                data  = pkt[4:]

                with sessions_lock:
                    sess = sessions.get(addr)

                if not sess:
                    # Unknown session — ignore
                    continue

                sess['last_activity'] = time.time()

                if block == sess['expected_block']:
                    try:
                        sess['file'].write(data)
                    except Exception as e:
                        print(f"[TFTP] Write error: {e}")
                        with sessions_lock:
                            sessions.pop(addr, None)
                        continue

                    # ACK this block — on MAIN socket to OLT source addr
                    sock.sendto(struct.pack('!HH', OP_ACK, block), addr)
                    sess['expected_block'] += 1
                    if sess['expected_block'] > 65535:
                        sess['expected_block'] = 0

                    # Last block = less than 512 bytes
                    if len(data) < 512:
                        sess['file'].close()
                        file_size = os.path.getsize(sess['file_path'])
                        print(f"[TFTP] Complete: {sess['stored_name']} "
                              f"({file_size} bytes, {block} blocks)")
                        log_file(sess['source_ip'], sess['olt_name'], sess['olt_id'],
                                 sess['filename'], sess['stored_name'],
                                 file_size, sess['file_path'], 'ok')
                        with sessions_lock:
                            sessions.pop(addr, None)

                elif block < sess['expected_block']:
                    # Duplicate — re-ACK
                    sock.sendto(struct.pack('!HH', OP_ACK, block), addr)

            # ── ERROR from OLT ─────────────────────────────────────────────
            elif opcode == OP_ERROR:
                code = struct.unpack('!H', pkt[2:4])[0] if len(pkt) >= 4 else 0
                msg  = pkt[4:].rstrip(b'\x00').decode('utf-8', errors='replace')
                print(f"[TFTP] OLT ERROR from {addr}: code={code} msg={msg}")
                with sessions_lock:
                    sess = sessions.pop(addr, None)
                if sess:
                    try:
                        sess['file'].close()
                    except Exception:
                        pass
                    log_file(sess['source_ip'], sess['olt_name'], sess['olt_id'],
                             sess['filename'], sess['stored_name'],
                             0, sess['file_path'], f'olt_error:{code}:{msg}')

            elif opcode == OP_RRQ:
                err = struct.pack('!HH', OP_ERROR, 2) + b'Read not supported\x00'
                sock.sendto(err, addr)
                print(f"[TFTP] RRQ rejected from {addr[0]} (receive-only)")

        except Exception as e:
            print(f"[TFTP] Main loop error: {e}")

if __name__ == '__main__':
    start()
