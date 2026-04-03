"""
SimpleNOC v0.5.5 - SNMP Trap Receiver
Listens on UDP port defined in noc_config.py (default 162)
Identifies OLTs by MAC address from Vsol trap varbinds
"""
from pysnmp.carrier.asyncio.dgram import udp
from pysnmp.entity import engine
from pysnmp.entity import config as snmp_config
from pysnmp.entity.rfc3413 import ntfrcv
import re, socket, datetime, threading, queue, time
import noc_config as cfg
from noc_config import execute_db, query_db, get_db_connection

DB_PATH    = cfg.TRAP_DB
SNMP_PORT  = cfg.SNMP_PORT
OFFLINE_S  = cfg.OFFLINE_AFTER_SECS
write_queue = queue.Queue()

# ── DATABASE ──────────────────────────────────────────────────────────────────
def init_db():
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    pk = "SERIAL" if db_type == 'postgres' else "INTEGER PRIMARY KEY AUTOINCREMENT"
    
    execute_db(DB_PATH, f'''CREATE TABLE IF NOT EXISTS traps (
        id        {pk},
        timestamp TEXT, source_ip TEXT, olt_mac TEXT,
        olt_id TEXT, oid TEXT, oid_name TEXT, value TEXT)''')
    
    execute_db(DB_PATH, '''CREATE TABLE IF NOT EXISTS devices (
        olt_mac   TEXT PRIMARY KEY, source_ip TEXT, olt_id TEXT,
        name TEXT, last_seen TEXT, status TEXT DEFAULT 'unknown')''')
    
    execute_db(DB_PATH, f'''CREATE TABLE IF NOT EXISTS events (
        id        {pk},
        timestamp TEXT, olt_mac TEXT, olt_id TEXT,
        alarm_type TEXT, alarm_name TEXT, severity TEXT,
        onu_id TEXT, pon_slot TEXT, alarm_port TEXT,
        description TEXT, status TEXT)''')

    if db_type == 'postgres':
        execute_db(DB_PATH, "CREATE INDEX IF NOT EXISTS idx_traps_timestamp ON traps (timestamp DESC)")
        execute_db(DB_PATH, "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)")
    else:
        execute_db(DB_PATH, "CREATE INDEX IF NOT EXISTS idx_traps_timestamp ON traps (timestamp)")
        execute_db(DB_PATH, "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp)")

    print(f"Trap DB ({db_type}) ready.")


# ── DB WRITER ─────────────────────────────────────────────────────────────────
def db_writer():
    db_type = getattr(cfg, 'DB_TYPE', 'sqlite')
    conn = get_db_connection(DB_PATH)
    if not conn:
        print("CRITICAL: Trap DB writer could not connect.")
        return

    print(f"Trap DB writer ({db_type}) started.")
    while True:
        try:
            task = write_queue.get(timeout=2)
            if task is None: break
            t = task[0]
            
            if t == 'trap':
                _, src, mac, oid_id, oid, name, val = task
                sql = "INSERT INTO traps (timestamp,source_ip,olt_mac,olt_id,oid,oid_name,value) VALUES (?,?,?,?,?,?,?)"
                params = (datetime.datetime.now().isoformat(), src, mac, oid_id, oid, name, val)
                if db_type == 'postgres': sql = sql.replace('?', '%s')
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(sql, params)
                conn.commit()

            elif t == 'device':
                _, src, mac, oid_id = task
                now = datetime.datetime.now().isoformat()
                if db_type == 'postgres':
                    sql = """INSERT INTO devices (olt_mac,source_ip,olt_id,name,last_seen,status)
                        VALUES (%s,%s,%s,%s,%s,'online') ON CONFLICT(olt_mac) DO UPDATE SET
                        source_ip=EXCLUDED.source_ip, last_seen=EXCLUDED.last_seen,
                        status='online', olt_id=EXCLUDED.olt_id"""
                else:
                    sql = """INSERT INTO devices (olt_mac,source_ip,olt_id,name,last_seen,status)
                        VALUES (?,?,?,?,?,'online') ON CONFLICT(olt_mac) DO UPDATE SET
                        source_ip=excluded.source_ip, last_seen=excluded.last_seen,
                        status='online', olt_id=excluded.olt_id"""
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(sql, (mac, src, oid_id, oid_id, now))
                conn.commit()

            elif t == 'event':
                _, mac, oid_id, atype, aname, sev, onu, slot, port, desc, sta = task
                if atype or aname:
                    sql = """INSERT INTO events
                        (timestamp,olt_mac,olt_id,alarm_type,alarm_name,severity,
                         onu_id,pon_slot,alarm_port,description,status)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)"""
                    params = (datetime.datetime.now().isoformat(), mac, oid_id,
                              atype, aname, sev, onu, slot, port, desc, sta)
                    if db_type == 'postgres': sql = sql.replace('?', '%s')
                    
                    with conn.cursor() if db_type == 'postgres' else conn as cur:
                        cur.execute(sql, params)
                    conn.commit()

            elif t == 'offline':
                threshold = (datetime.datetime.now() - datetime.timedelta(seconds=OFFLINE_S)).isoformat()
                sql = "UPDATE devices SET status='offline' WHERE last_seen < ? AND status='online'"
                if db_type == 'postgres': sql = sql.replace('?', '%s')
                
                with conn.cursor() if db_type == 'postgres' else conn as cur:
                    cur.execute(sql, (threshold,))
                conn.commit()

            write_queue.task_done()
        except queue.Empty:
            continue
        except Exception as e:
            print(f"Trap DB writer error: {e}")
            try: conn.rollback()
            except: pass
            time.sleep(1)
    
    if conn: conn.close()


def offline_checker():
    while True:
        threading.Event().wait(30)
        write_queue.put(('offline',))

# ── TRAP HANDLER ──────────────────────────────────────────────────────────────
def trap_callback(snmpEngine, stateReference, contextEngineId, contextName, varBinds, cbCtx):
    _, addr = snmpEngine.message_dispatcher.get_transport_info(stateReference)
    source_ip = addr[0]
    translated = translate_trap(varBinds)
    olt_mac = get_olt_mac(translated) or f"IP-{source_ip}"
    olt_id  = mac_to_olt_id(olt_mac)  or f"OLT-{source_ip.split('.')[-1]}"

    if not is_heartbeat(translated):
        desc  = translated.get('alarmDescription', {}).get('value', '')
        aname = translated.get('alarmName',        {}).get('value', '')
        sev   = translated.get('alarmSeverity',    {}).get('value', '')
        print(f"[{olt_id}] {source_ip} | {desc or aname or 'alarm'} | {sev}")

    write_queue.put(('device', source_ip, olt_mac, olt_id))
    for name, data in translated.items():
        write_queue.put(('trap', source_ip, olt_mac, olt_id, data['oid'], name, data['value']))
    if not is_heartbeat(translated):
        write_queue.put(('event', olt_mac, olt_id,
            translated.get('alarmType',        {}).get('value', ''),
            translated.get('alarmName',        {}).get('value', ''),
            translated.get('alarmSeverity',    {}).get('value', ''),
            translated.get('onuId',            {}).get('value', ''),
            translated.get('ponSlot',          {}).get('value', ''),
            translated.get('alarmPort',        {}).get('value', ''),
            translated.get('alarmDescription', {}).get('value', ''),
            translated.get('alarmStatus',      {}).get('value', ''),
        ))

def start():
    init_db()
    threading.Thread(target=db_writer,      daemon=True).start()
    threading.Thread(target=offline_checker, daemon=True).start()

    snmpEngine = engine.SnmpEngine()
    snmp_config.add_transport(snmpEngine, udp.DOMAIN_NAME,
        udp.UdpTransport().open_server_mode(('0.0.0.0', SNMP_PORT)))
    snmp_config.add_v1_system(snmpEngine, 'my-area', 'public')
    snmp_config.add_vacm_user(snmpEngine, 1, 'my-area', 'noAuthNoPriv', (1,3,6), (1,3,6))
    snmp_config.add_vacm_user(snmpEngine, 2, 'my-area', 'noAuthNoPriv', (1,3,6), (1,3,6))
    ntfrcv.NotificationReceiver(snmpEngine, trap_callback)
    snmpEngine.transport_dispatcher.job_started(1)

    print(f"SNMP Trap Receiver listening on UDP port {SNMP_PORT}...")
    try:
        snmpEngine.transport_dispatcher.run_dispatcher()
    except KeyboardInterrupt:
        write_queue.put(None)
        snmpEngine.transport_dispatcher.close_dispatcher()

if __name__ == '__main__':
    start()
