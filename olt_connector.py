"""
Smart NOC v0.6.0 - OLT Connector
SSH and Telnet client for V1600G1/G1B OLTs.
Collects ONU state and uplink traffic from Vsol GPON OLT.
"""
import concurrent.futures
import re, time, socket
import noc_config as cfg
from noc_config import query_db, execute_db, get_db_connection

OLT_DB = cfg.OLT_DB
DEFAULT_PROMPTS = ['(config-pon', '(config)#', '#', '>']
PAGER_RE = re.compile(
    r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
    r'<\s*space\s*>|continue\?\s*\[y/n\])',
    re.IGNORECASE)

# ── DATABASE ──────────────────────────────────────────────────────────────────
def init_olt_db():
    pk = "SERIAL"
    bigint = "BIGINT"
    real = "REAL"
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS olt_profiles (
        id          {pk},
        name        TEXT,
        ip          TEXT,
        ssh_port    INTEGER DEFAULT 22,
        telnet_port INTEGER DEFAULT 23,
        conn_type   TEXT DEFAULT 'auto',
        olt_model   TEXT DEFAULT 'V1600G1',
        username    TEXT,
        password    TEXT,
        enable_pass TEXT,
        uplink_ports TEXT DEFAULT 'gigabitethernet 0/10',
        created_at  TEXT,
        last_poll   TEXT,
        last_status TEXT DEFAULT 'never'
    )''')

    # Allow the same OLT IP to be stored more than once when the connection
    # ports differ. Older installs created a unique constraint on ip only.
    execute_db(OLT_DB, "ALTER TABLE olt_profiles DROP CONSTRAINT IF EXISTS olt_profiles_ip_key")
    execute_db(OLT_DB, "DROP INDEX IF EXISTS olt_profiles_ip_key")
    execute_db(OLT_DB, "CREATE UNIQUE INDEX IF NOT EXISTS uq_olt_profiles_ip_ports ON olt_profiles (ip, ssh_port, telnet_port)")
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS onu_data (
        id          {pk},
        poll_time   TEXT,
        olt_ip      TEXT,
        olt_name    TEXT,
        pon_slot    TEXT,
        pon_port    TEXT,
        onu_id      TEXT,
        onu_index   TEXT,
        model       TEXT,
        profile     TEXT,
        serial_no   TEXT,
        phase_state TEXT,
        admin_state TEXT,
        omcc_state  TEXT,
        online      INTEGER DEFAULT 0,
        rx_power    {real},
        tx_power    {real},
        distance_m  INTEGER
    )''')
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS onu_history (
        id          {pk},
        poll_time   TEXT,
        olt_ip      TEXT,
        pon_port    TEXT,
        onu_id      TEXT,
        serial_no   TEXT,
        online      INTEGER,
        rx_power    {real},
        distance_m  INTEGER
    )''')
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS uplink_stats (
        id          {pk},
        poll_time   TEXT,
        olt_ip      TEXT,
        olt_name    TEXT,
        interface   TEXT,
        in_bps      {bigint} DEFAULT 0,
        out_bps     {bigint} DEFAULT 0,
        in_mbps     {real} DEFAULT 0,
        out_mbps    {real} DEFAULT 0,
        in_errors   {bigint} DEFAULT 0,
        out_errors  {bigint} DEFAULT 0,
        in_pkts     {bigint} DEFAULT 0,
        out_pkts    {bigint} DEFAULT 0,
        link_status TEXT DEFAULT 'unknown',
        description TEXT DEFAULT ''
    )''')
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS olt_poll_sessions (
        id          {pk},
        olt_ip      TEXT,
        olt_name    TEXT,
        poll_time   TEXT,
        duration_s  {real},
        onu_count   INTEGER,
        online_count INTEGER,
        method      TEXT,
        status      TEXT,
        error       TEXT DEFAULT ''
    )''')
    
    execute_db(OLT_DB, f'''CREATE TABLE IF NOT EXISTS olt_poll_jobs (
        id            {pk},
        profile_id    INTEGER NOT NULL,
        profile_name  TEXT DEFAULT '',
        profile_ip    TEXT DEFAULT '',
        poll_type     TEXT NOT NULL,
        run_mode      TEXT NOT NULL,
        start_at      TEXT,
        interval_min  INTEGER DEFAULT 60,
        selected_ports TEXT DEFAULT '',
        next_run      TEXT,
        last_run      TEXT,
        last_status   TEXT DEFAULT 'never',
        last_error    TEXT DEFAULT '',
        enabled       INTEGER DEFAULT 1,
        created_at    TEXT
    )''')

    # Add indexes
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_data_poll ON onu_data (poll_time DESC)")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_data_olt ON onu_data (olt_ip)")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_uplink_stats_poll ON uplink_stats (poll_time DESC)")

    print(f"OLT DB (postgres) ready.")


init_olt_db()

# ── PARSERS ───────────────────────────────────────────────────────────────────
INFO_RE = re.compile(
    r'((?:GPON)?(\d+)/(\d+):(\d+))\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)', re.IGNORECASE)
STATE_RE = re.compile(
    r'((?:GPON)?(\d+)/(\d+):(\d+))\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)', re.IGNORECASE)
# Matches lines like:  GPON0/1:2           -15.802(dbm)
# Skips lines where value is N/A
# Groups: (1) full onu_index e.g. GPON0/1:2  (2) rx_power float
RX_POWER_RE = re.compile(
    r'^(GPON\d+/\d+:\d+)\s+([-]\d+\.?\d*)\s*\(dbm\)',
    re.IGNORECASE)
RX_POWER_ONU_RE = re.compile(
    r'^(?:GPON\d+/\d+:)?(\d+)\s+(-?\d+\.?\d*|N/A)(?:\s+(-?\d+\.?\d*|N/A))?\s*$',
    re.IGNORECASE)

DISTANCE_RE = re.compile(r'onu\s+(\d+)\s+Distance:\s+(\d+)m', re.IGNORECASE)

def clean_output(text):
    import re as _re
    text = _re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
    text = _re.sub(r'\[\d+[A-Za-z]', '', text)
    text = _re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]', '', text)
    return text

def extract_hostname(text, fallback=''):
    cleaned = clean_output(text or '')
    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        m = re.match(r'^([A-Za-z0-9._-]+)(?:\([^)]*\))?[>#]\s*$', stripped)
        if m:
            return m.group(1)
    return fallback

def _has_prompt(text, prompts=None):
    prompts = prompts or DEFAULT_PROMPTS
    lines = [line.strip().lower() for line in clean_output(text).splitlines() if line.strip()]
    if not lines:
        return False
    last_line = lines[-1]
    return any(prompt.lower() in last_line for prompt in prompts)

def _read_until_complete(read_chunk, on_pager=None, prompts=None, timeout=15,
                         idle_after_prompt=0.35, idle_without_prompt=0.9):
    """Collect command output until a CLI prompt returns or the stream goes idle."""
    output = ''
    deadline = time.time() + timeout
    last_data = time.time()
    saw_prompt = False

    while time.time() < deadline:
        chunk = read_chunk()
        if chunk:
            output += chunk
            last_data = time.time()
            if PAGER_RE.search(chunk) and on_pager:
                on_pager()
                saw_prompt = False
                continue
            saw_prompt = _has_prompt(output, prompts)
            continue

        idle_for = time.time() - last_data
        if saw_prompt and idle_for >= idle_after_prompt:
            break
        if output and idle_for >= idle_without_prompt:
            break
        time.sleep(0.1)

    return output

def _progress(callback, stage, detail=''):
    if callback:
        try:
            callback(stage, detail)
        except Exception:
            pass

def get_olt_model(profile):
    model = str((profile or {}).get('olt_model') or 'V1600G1').strip().upper()
    return model if model in ('V1600G1', 'V1600G1B') else 'V1600G1'

def get_pon_metric_commands(profile, port):
    model = get_olt_model(profile)
    port = str(port)
    if model == 'V1600G1B':
        return {
            'interface': f'int gpon 0/{port}',
            'rx_commands': ['show pon onu all rx-power', 'show pon rx_power onu'],
            'dist': 'show onu 1-128 distance',
        }
    return {
        'interface': f'interface gpon 0/{port}',
        'rx_commands': ['show pon onu all rx-power'],
        'dist': 'show onu 1-128 distance',
    }

def count_rx_entries(output):
    count = 0
    for line in clean_output(output).splitlines():
        stripped = line.strip()
        m = RX_POWER_RE.match(stripped)
        if m:
            count += 1
            continue
        m = RX_POWER_ONU_RE.match(stripped)
        if m and str(m.group(2)).upper() != 'N/A':
            count += 1
    return count

def parse_onu_info(output):
    output = clean_output(output)
    onus = {}
    for line in output.split('\n'):
        stripped = line.strip()
        if not stripped or stripped.lower().startswith('onuindex') or stripped.startswith('-'):
            continue
        m = INFO_RE.search(line)
        if m:
            key = (m.group(3), m.group(4))
            existing = onus.get(key, {})
            onus[key] = {
                'onu_index': m.group(1), 'pon_slot': m.group(2),
                'pon_port':  m.group(3), 'onu_id':   m.group(4),
                'model':     m.group(5), 'profile':  m.group(6),
                'serial_no': m.group(8), 'phase_state': existing.get('phase_state', 'unknown'),
                'admin_state': existing.get('admin_state', ''),
                'omcc_state': existing.get('omcc_state', ''),
                'online': existing.get('online', 0),
            }
    return onus

def parse_onu_state(output, onus):
    output = clean_output(output)
    for line in output.split('\n'):
        stripped = line.strip()
        if not stripped or stripped.lower().startswith('onuindex') or stripped.startswith('-'):
            continue
        m = STATE_RE.search(line)
        if m:
            key = (m.group(3), m.group(4))
            phase_state = m.group(7)
            existing = onus.get(key, {})
            onus[key] = {
                'onu_index': existing.get('onu_index') or m.group(1),
                'pon_slot': existing.get('pon_slot') or m.group(2),
                'pon_port': existing.get('pon_port') or m.group(3),
                'onu_id': existing.get('onu_id') or m.group(4),
                'model': existing.get('model', 'unknown'),
                'profile': existing.get('profile', ''),
                'serial_no': existing.get('serial_no') or m.group(8),
                'phase_state': phase_state,
                'admin_state': m.group(5),
                'omcc_state': m.group(6),
                'online': 1 if phase_state.lower() == 'working' else 0,
            }
    return onus

def parse_onu_optical(output, onus, port):
    """
    Parses 'show pon onu all rx-power' output.
    Line format:  GPON0/1:2           -15.802(dbm)
    N/A lines are automatically skipped by the regex.
    Merges rx_power into onus dict by matching full onu_index string.
    """
    cleaned = clean_output(output)
    print(f"[OLT DEBUG] Parsing optical port {port} ({len(cleaned)} chars):\n{cleaned[:600]}")

    # Build lookup: onu_index uppercase -> dict key
    index_lookup = {}
    for k, o in onus.items():
        idx = o.get('onu_index', '')
        if idx:
            index_lookup[idx.upper()] = k

    match_count = 0
    for line in cleaned.split('\n'):
        stripped = line.strip()
        m = RX_POWER_RE.match(stripped)
        target_key = None
        rx_val = None
        onu_index_raw = ''
        if m:
            onu_index_raw = m.group(1)
            rx_val = m.group(2)
            target_key = index_lookup.get(onu_index_raw.upper())
            if target_key is None:
                print(f"[OLT DEBUG] No match in onus for index: {onu_index_raw}")
                continue
        else:
            m = RX_POWER_ONU_RE.match(stripped)
            if not m:
                continue
            onu_id = str(m.group(1))
            rx_val = m.group(2)
            if str(rx_val).upper() == 'N/A':
                continue
            onu_index_raw = f"GPON0/{port}:{onu_id}"
            target_key = (str(port), onu_id)
            if target_key not in onus:
                print(f"[OLT DEBUG] No ONU match for port {port} onu {onu_id}")
                continue

        try:
            onus[target_key]['rx_power'] = float(rx_val)
            match_count += 1
            print(f"[OLT DEBUG] Matched {onu_index_raw} -> rx_power={rx_val} dBm")
        except Exception as e:
            print(f"[OLT DEBUG] Parse error '{line.strip()}': {e}")

    print(f"[OLT DEBUG] Optical done: {match_count}/{len(onus)} ONUs updated on port {port}")
    return onus

def parse_onu_distance(output, onus, port):
    """
    Parses 'show onu 1-128 distance' output.
    Line format:  onu 4 Distance: 2085m
    Merges distance into onus dict by matching port and onu_id.
    """
    cleaned = clean_output(output)
    print(f"[OLT DEBUG] Parsing distance for port {port} ({len(cleaned)} chars):\n{cleaned[:400]}")

    match_count = 0
    for line in cleaned.split('\n'):
        m = DISTANCE_RE.search(line.strip())
        if not m:
            continue
        onu_id = m.group(1)   # e.g. 4
        dist   = m.group(2)   # e.g. 2085

        key = (str(port), str(onu_id))
        if key in onus:
            try:
                onus[key]['distance_m'] = int(dist)
                match_count += 1
            except Exception as e:
                print(f"[OLT DEBUG] Distance parse error '{line.strip()}': {e}")

    print(f"[OLT DEBUG] Distance done: {match_count} ONUs updated on port {port}")
    return onus

def parse_uplink_interface(output, interface):
    r = {'interface': interface, 'link_status': 'unknown',
         'in_bps': 0, 'out_bps': 0, 'in_mbps': 0.0, 'out_mbps': 0.0,
         'in_errors': 0, 'out_errors': 0, 'in_pkts': 0, 'out_pkts': 0,
         'description': '',
         'raw_output': output}   # kept for diagnostic API
    cleaned = clean_output(output)
    lo = cleaned.lower()

    # Link status — multiple OLT vendors phrase this differently
    if 'line protocol is up' in lo or ' is up,' in lo or ', line protocol is up' in lo:
        r['link_status'] = 'up'
    elif re.search(r'\bis\s+up\b', lo) or re.search(r'\bstatus\s*:?\s*up\b', lo) or re.search(r'\bstate\s*:?\s*up\b', lo):
        r['link_status'] = 'up'
    elif 'is down' in lo or 'line protocol is down' in lo or re.search(r'\bstatus\s*:?\s*down\b', lo) or re.search(r'\bstate\s*:?\s*down\b', lo):
        r['link_status'] = 'down'

    def find_int(pattern):
        m = re.search(pattern, cleaned, re.IGNORECASE)
        return int(m.group(1).replace(',', '').replace(' ', '')) if m else 0

    # --- NEW BANDWIDTH PARSING LOGIC ---
    # Look for the "Last 300 seconds input: X packets/sec Y bytes/sec" pattern
    # We use (?:...) for packets so find_int correctly targets the bytes as group 1
    bytes_in = find_int(r'input:\s*(?:[\d,]+)\s*packets?/sec\s*([\d,]+)\s*bytes?')
    
    if not bytes_in:
        # Fallback to older bit-rate patterns if the exact byte line isn't found
        bps_in = find_int(r'(?:input\s+rate|input\s+rate\s*:)\s*([\d,]+)\s*(?:bits?(?:/sec|/s)?)')
        if bps_in == 0:
            bps_in = find_int(r'minute\s+input\s+rate\s+([\d,]+)\s*bits?')
        bytes_in = bps_in / 8

    bytes_out = find_int(r'output:\s*(?:[\d,]+)\s*packets?/sec\s*([\d,]+)\s*bytes?')
    
    if not bytes_out:
        bps_out = find_int(r'(?:output\s+rate|output\s+rate\s*:)\s*([\d,]+)\s*(?:bits?(?:/sec|/s)?)')
        if bps_out == 0:
            bps_out = find_int(r'minute\s+output\s+rate\s+([\d,]+)\s*bits?')
        bytes_out = bps_out / 8

# Store raw bits for DB (keeps your table schema happy)
    r['in_bps'] = int(bytes_in * 8)
    r['out_bps'] = int(bytes_out * 8)

    # Calculate Megabits per second (1 Mbps = 1,000,000 bits)
    # Using the already calculated bps variables for a cleaner conversion
    r['in_mbps']  = round(r['in_bps'] / 1000000, 2)
    r['out_mbps'] = round(r['out_bps'] / 1000000, 2)
    # --- END NEW LOGIC ---
 
    # Packet counters
    r['in_pkts']    = find_int(r'([\d,]+)\s+packets?\s+input')
    r['out_pkts']   = find_int(r'([\d,]+)\s+packets?\s+output')
    # Fallback for "input: X packets"
    if r['in_pkts'] == 0:
        r['in_pkts']  = find_int(r'input\s*:\s*([\d,]+)\s+packets?')
    if r['out_pkts'] == 0:
        r['out_pkts'] = find_int(r'output\s*:\s*([\d,]+)\s+packets?')

    # Error counters
    r['in_errors']  = find_int(r'([\d,]+)\s+input\s+errors?')
    r['out_errors'] = find_int(r'([\d,]+)\s+output\s+errors?')
    if r['in_errors'] == 0:
        r['in_errors']  = find_int(r'input\s+errors?\s*:\s*([\d,]+)')
    if r['out_errors'] == 0:
        r['out_errors'] = find_int(r'output\s+errors?\s*:\s*([\d,]+)')

    desc_match = re.search(r'(?i)description\s*:\s*(.*)', cleaned)
    if desc_match:
        r['description'] = desc_match.group(1).strip()

    return r

# ── SSH ───────────────────────────────────────────────────────────────────────
def _try_ssh(ip, port, username, password, enable_pass, commands):
    try:
        import paramiko
    except (ImportError, ModuleNotFoundError) as ie:
        return None, f"SSH unavailable ({ie}). Using Telnet instead."
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(ip, port=port, username=username, password=password,
                       timeout=15, look_for_keys=False, allow_agent=False)
        shell = client.invoke_shell(width=512, height=2000)
        time.sleep(0.6)
        if shell.recv_ready():
            shell.recv(65535)

        def send_cmd(cmd, prompts=None, timeout=15):
            shell.send(cmd + '\n')
            time.sleep(0.15)
            return _read_until_complete(
                lambda: shell.recv(65535).decode('utf-8', errors='replace') if shell.recv_ready() else '',
                on_pager=lambda: shell.send(' '),
                prompts=prompts,
                timeout=timeout)

        send_cmd('en', prompts=['Password:', 'password:', '#', '>'], timeout=8)
        send_cmd(enable_pass or password, prompts=['#', '>'], timeout=8)
        send_cmd('configure terminal', prompts=['(config)#', '#'], timeout=8)
        # Disable pager so full output arrives without --More-- prompts
        send_cmd('terminal length 0', prompts=['(config)#', '#'], timeout=6)
        send_cmd('screen-length 0 temporary', prompts=['(config)#', '#'], timeout=6)
        results = {}
        for cmd in commands:
            is_pon_cmd = 'interface gpon' in cmd.lower() or re.match(r'^\s*int\s+gpon\b', cmd, re.IGNORECASE)
            prompts = ['(config-pon', '(config)#', '#', '>'] if is_pon_cmd else ['(config)#', '#', '>']
            timeout = 30 if 'show interface ' in cmd.lower() else 25
            results[cmd] = send_cmd(cmd, prompts=prompts, timeout=timeout)
        client.close()
        return results, None
    except Exception as e:
        return None, str(e)

# ── TELNET (raw socket, Python 3.13 compatible) ───────────────────────────────
def _try_telnet(ip, port, username, password, enable_pass, commands):
    IAC  = bytes([255])
    DONT = bytes([254])
    DO   = bytes([253])
    WONT = bytes([252])
    WILL = bytes([251])
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(15)
        sock.connect((ip, port))
        sock.settimeout(0.5)
        buf = b''

        def recv_until(prompts, timeout=10):
            """Read until a prompt is seen, automatically sending space to
            dismiss any --More-- / press-any-key pager screens so the full
            output is collected before the final prompt arrives."""
            nonlocal buf
            if isinstance(prompts, str):
                prompts = [prompts]
            # Pager patterns this OLT uses — add more here if needed
            PAGER_RE = re.compile(
                r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
                r'<\s*space\s*>|continue\?\s*\[y/n\])',
                re.IGNORECASE)
            deadline = time.time() + timeout
            while time.time() < deadline:
                try:
                    chunk = sock.recv(4096)
                    if chunk:
                        clean = b''
                        i = 0
                        while i < len(chunk):
                            if chunk[i:i+1] == IAC and i + 2 < len(chunk):
                                cb  = chunk[i+1:i+2]
                                opt = chunk[i+2:i+3]
                                if cb == DO:
                                    sock.send(IAC + WONT + opt)
                                elif cb == WILL:
                                    sock.send(IAC + DONT + opt)
                                i += 3
                            else:
                                clean += chunk[i:i+1]
                                i += 1
                        buf += clean
                except socket.timeout:
                    pass
                decoded = buf.decode('utf-8', errors='replace')
                # If pager prompt detected send space to continue
                if PAGER_RE.search(decoded):
                    sock.send(b' ')
                    time.sleep(0.4)
                    continue
                for p in prompts:
                    if p.lower() in decoded.lower():
                        return decoded
                time.sleep(0.2)
            return buf.decode('utf-8', errors='replace')

        def send_line(text):
            sock.send((text + '\r\n').encode('utf-8'))
            time.sleep(0.3)

        recv_until(['Login:', 'login:', 'Username:'])
        buf = b''
        send_line(username)
        recv_until(['Password:', 'password:'])
        buf = b''
        send_line(password)
        time.sleep(1.5)
        recv_until(['>', '#'])
        buf = b''

        send_line('en')
        out = recv_until(['Password:', 'password:', '#'], timeout=5)
        if 'assword' in out:
            buf = b''
            send_line(enable_pass or password)
            time.sleep(1)
            recv_until(['#'])
        buf = b''

        send_line('configure terminal')
        time.sleep(1.5)
        recv_until(['(config)#', '#'])

        # Disable pager at OLT level so output comes all at once
        # Vsol / Huawei CLIs accept one of these — send both, ignore errors
        for no_page_cmd in ['terminal length 0', 'screen-length 0 temporary']:
            buf = b''
            send_line(no_page_cmd)
            time.sleep(0.8)
            recv_until(['(config)#', '#'], timeout=4)
        buf = b''

        results = {}
        for cmd in commands:
            buf = b''
            send_line(cmd)
            # Interface output is longer — give it more time
            wait = 6 if 'interface' in cmd.lower() else 3
            time.sleep(wait)
            results[cmd] = recv_until(['(config)#', '#'], timeout=25)

        sock.close()
        return results, None
    except Exception as e:
        return None, str(e)

# ── OPTICAL POWER FETCH (sequential commands per port in one session) ─────────
# ── PON ONU METRICS FETCH (rx-power and distance per port) ─────────
def fetch_pon_onu_metrics(profile, ports):
    """
    For each PON port, enters 'interface gpon 0/<port>' then runs:
    1. 'show pon onu all rx-power'
    2. 'show onu 1-128 distance'
    Returns dict: { port_str -> { 'rx': raw_rx, 'dist': raw_dist } }
    """
    ip          = profile['ip']
    ssh_port    = int(profile.get('ssh_port', 22) or 22)
    telnet_port = int(profile.get('telnet_port', 23) or 23)
    username    = profile['username']
    password    = profile['password']
    enable_pass = profile.get('enable_pass', '') or password
    conn_type   = (profile.get('conn_type', 'auto') or 'auto').lower()

    results = {}

    # ── SSH path ──────────────────────────────────────────────────────────────
    def _ssh_metrics():
        try:
            import paramiko
        except (ImportError, ModuleNotFoundError):
            return None
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(ip, port=ssh_port, username=username, password=password,
                           timeout=15, look_for_keys=False, allow_agent=False)
            shell = client.invoke_shell(width=512, height=2000)
            time.sleep(2)
            shell.recv(65535)

            PAGER_RE = re.compile(
                r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
                r'<\s*space\s*>|continue\?\s*\[y/n\])',
                re.IGNORECASE)
            PROMPT_RE = re.compile(r'[#>]\s*$', re.MULTILINE)

            def send_and_collect(cmd, wait=2.5, extra_timeout=15):
                shell.send(cmd + '\n')
                time.sleep(wait)
                out = ''
                deadline = time.time() + extra_timeout
                while time.time() < deadline:
                    if shell.recv_ready():
                        chunk = shell.recv(65535).decode('utf-8', errors='replace')
                        out += chunk
                        if PAGER_RE.search(chunk):
                            shell.send(' ')
                            time.sleep(0.4)
                            continue
                        time.sleep(0.3)
                        if PROMPT_RE.search(out.split('\n')[-1]):
                            break
                    else:
                        time.sleep(0.5)
                        if not shell.recv_ready():
                            break
                return out

            send_and_collect('en', wait=1.5)
            send_and_collect(enable_pass or password, wait=1.5)
            send_and_collect('configure terminal', wait=1.5)
            send_and_collect('terminal length 0', wait=1.0)
            send_and_collect('screen-length 0 temporary', wait=1.0)

            for p in ports:
                metric_cmds = get_pon_metric_commands(profile, p)
                send_and_collect(metric_cmds['interface'], wait=1.5)
                raw_rx = ''
                best_rx_matches = -1
                for rx_cmd in metric_cmds.get('rx_commands', []):
                    candidate_rx = send_and_collect(rx_cmd, wait=4.0, extra_timeout=20)
                    candidate_matches = count_rx_entries(candidate_rx)
                    if candidate_matches > best_rx_matches:
                        raw_rx = candidate_rx
                        best_rx_matches = candidate_matches
                    if candidate_matches > 0:
                        break
                raw_dist = ''
                if metric_cmds['dist']:
                    raw_dist = send_and_collect(metric_cmds['dist'], wait=3.0, extra_timeout=15)
                results[str(p)] = {'rx': raw_rx, 'dist': raw_dist}
                print(f"[OLT METRICS SSH] port {p} (rx={len(raw_rx)}, dist={len(raw_dist)})")
                send_and_collect('exit', wait=1.0)

            client.close()
            return results
        except Exception as e:
            print(f"[OLT METRICS SSH] Error: {e}")
            return None

    # ── Telnet path ───────────────────────────────────────────────────────────
    def _telnet_metrics():
        IAC  = bytes([255])
        DONT = bytes([254])
        DO   = bytes([253])
        WONT = bytes([252])
        WILL = bytes([251])
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(15)
            sock.connect((ip, telnet_port))
            sock.settimeout(0.5)
            buf = b''

            PAGER_RE = re.compile(
                r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
                r'<\s*space\s*>|continue\?\s*\[y/n\])',
                re.IGNORECASE)

            def recv_until(prompts, timeout=10):
                nonlocal buf
                if isinstance(prompts, str):
                    prompts = [prompts]
                deadline = time.time() + timeout
                while time.time() < deadline:
                    try:
                        chunk = sock.recv(4096)
                        if chunk:
                            clean = b''
                            i = 0
                            while i < len(chunk):
                                if chunk[i:i+1] == IAC and i + 2 < len(chunk):
                                    cb  = chunk[i+1:i+2]
                                    opt = chunk[i+2:i+3]
                                    if cb == DO:
                                        sock.send(IAC + WONT + opt)
                                    elif cb == WILL:
                                        sock.send(IAC + DONT + opt)
                                    i += 3
                                else:
                                    clean += chunk[i:i+1]
                                    i += 1
                            buf += clean
                    except socket.timeout:
                        pass
                    decoded = buf.decode('utf-8', errors='replace')
                    if PAGER_RE.search(decoded):
                        sock.send(b' ')
                        time.sleep(0.4)
                        continue
                    for p in prompts:
                        if p.lower() in decoded.lower():
                            return decoded
                    time.sleep(0.2)
                return buf.decode('utf-8', errors='replace')

            def send_line(text):
                sock.send((text + '\r\n').encode('utf-8'))
                time.sleep(0.3)

            recv_until(['Login:', 'login:', 'Username:'])
            buf = b''
            send_line(username)
            recv_until(['Password:', 'password:'])
            buf = b''
            send_line(password)
            time.sleep(1.5)
            recv_until(['>', '#'])
            buf = b''

            send_line('en')
            out = recv_until(['Password:', 'password:', '#'], timeout=5)
            if 'assword' in out:
                buf = b''
                send_line(enable_pass or password)
                time.sleep(1)
                recv_until(['#'])
            buf = b''

            send_line('configure terminal')
            time.sleep(1.5)
            recv_until(['(config)#', '#'])

            for no_page_cmd in ['terminal length 0', 'screen-length 0 temporary']:
                buf = b''
                send_line(no_page_cmd)
                time.sleep(0.8)
                recv_until(['(config)#', '#'], timeout=4)

            for p in ports:
                metric_cmds = get_pon_metric_commands(profile, p)
                buf = b''
                send_line(metric_cmds['interface'])
                time.sleep(1.5)
                recv_until(['(config-pon', '#'], timeout=8)

                raw_rx = ''
                best_rx_matches = -1
                for rx_cmd in metric_cmds.get('rx_commands', []):
                    buf = b''
                    send_line(rx_cmd)
                    time.sleep(4)
                    candidate_rx = recv_until(['(config-pon', '#'], timeout=25)
                    candidate_matches = count_rx_entries(candidate_rx)
                    if candidate_matches > best_rx_matches:
                        raw_rx = candidate_rx
                        best_rx_matches = candidate_matches
                    if candidate_matches > 0:
                        break

                raw_dist = ''
                if metric_cmds['dist']:
                    buf = b''
                    send_line(metric_cmds['dist'])
                    time.sleep(3)
                    raw_dist = recv_until(['(config-pon', '#'], timeout=25)

                results[str(p)] = {'rx': raw_rx, 'dist': raw_dist}
                print(f"[OLT METRICS TELNET] port {p} (rx={len(raw_rx)}, dist={len(raw_dist)})")

                buf = b''
                send_line('exit')
                time.sleep(1)
                recv_until(['(config)#', '#'], timeout=5)

            sock.close()
            return results
        except Exception as e:
            print(f"[OLT METRICS TELNET] Error: {e}")
            return None

    # Choose connection method
    if conn_type == 'ssh':
        r = _ssh_metrics()
    elif conn_type == 'telnet':
        r = _telnet_metrics()
    else:
        r = _ssh_metrics()
        if r is None:
            print("[OLT METRICS] SSH failed, trying Telnet...")
            r = _telnet_metrics()

    return r or {}

def _fetch_single_pon_metrics_fast(profile, port):
    port = str(port)
    ip          = profile['ip']
    ssh_port    = int(profile.get('ssh_port', 22) or 22)
    telnet_port = int(profile.get('telnet_port', 23) or 23)
    username    = profile['username']
    password    = profile['password']
    enable_pass = profile.get('enable_pass', '') or password
    conn_type   = (profile.get('conn_type', 'auto') or 'auto').lower()

    def _ssh_metrics():
        try:
            import paramiko
        except (ImportError, ModuleNotFoundError):
            return None
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(ip, port=ssh_port, username=username, password=password,
                           timeout=15, look_for_keys=False, allow_agent=False)
            shell = client.invoke_shell(width=512, height=2000)
            time.sleep(0.6)
            if shell.recv_ready():
                shell.recv(65535)

            def send_and_collect(cmd, prompts=None, timeout=15):
                shell.send(cmd + '\n')
                time.sleep(0.15)
                return _read_until_complete(
                    lambda: shell.recv(65535).decode('utf-8', errors='replace') if shell.recv_ready() else '',
                    on_pager=lambda: shell.send(' '),
                    prompts=prompts,
                    timeout=timeout)

            send_and_collect('en', prompts=['Password:', 'password:', '#', '>'], timeout=8)
            send_and_collect(enable_pass or password, prompts=['#', '>'], timeout=8)
            send_and_collect('configure terminal', prompts=['(config)#', '#'], timeout=8)
            send_and_collect('terminal length 0', prompts=['(config)#', '#'], timeout=6)
            send_and_collect('screen-length 0 temporary', prompts=['(config)#', '#'], timeout=6)
            metric_cmds = get_pon_metric_commands(profile, port)
            send_and_collect(metric_cmds['interface'], prompts=['(config-pon', '#'], timeout=10)
            raw_rx = ''
            best_rx_matches = -1
            for rx_cmd in metric_cmds.get('rx_commands', []):
                candidate_rx = send_and_collect(rx_cmd, prompts=['(config-pon', '#'], timeout=25)
                candidate_matches = count_rx_entries(candidate_rx)
                if candidate_matches > best_rx_matches:
                    raw_rx = candidate_rx
                    best_rx_matches = candidate_matches
                if candidate_matches > 0:
                    break
            raw_dist = ''
            if metric_cmds['dist']:
                raw_dist = send_and_collect(metric_cmds['dist'], prompts=['(config-pon', '#'], timeout=20)
            client.close()
            print(f"[OLT METRICS FAST SSH] port {port} (rx={len(raw_rx)}, dist={len(raw_dist)})")
            return {'rx': raw_rx, 'dist': raw_dist}
        except Exception as e:
            print(f"[OLT METRICS FAST SSH] Error on port {port}: {e}")
            return None

    def _telnet_metrics():
        metric_cmds = get_pon_metric_commands(profile, port)
        commands = [metric_cmds['interface']]
        commands.extend(metric_cmds.get('rx_commands', []))
        if metric_cmds['dist']:
            commands.append(metric_cmds['dist'])
        outputs, err = _try_telnet(ip, telnet_port, username, password, enable_pass, commands)
        if err or not outputs:
            print(f"[OLT METRICS FAST TELNET] Error on port {port}: {err or 'No output'}")
            return None
        raw_rx = ''
        best_rx_matches = -1
        for rx_cmd in metric_cmds.get('rx_commands', []):
            candidate_rx = outputs.get(rx_cmd, '')
            candidate_matches = count_rx_entries(candidate_rx)
            if candidate_matches > best_rx_matches:
                raw_rx = candidate_rx
                best_rx_matches = candidate_matches
            if candidate_matches > 0:
                break
        raw_dist = outputs.get(metric_cmds['dist'], '') if metric_cmds['dist'] else ''
        print(f"[OLT METRICS FAST TELNET] port {port} (rx={len(raw_rx)}, dist={len(raw_dist)})")
        return {'rx': raw_rx, 'dist': raw_dist}

    if conn_type == 'ssh':
        return _ssh_metrics()
    if conn_type == 'telnet':
        return _telnet_metrics()

    result = _ssh_metrics()
    if result is None:
        print(f"[OLT METRICS FAST] SSH failed for port {port}, trying Telnet...")
        result = _telnet_metrics()
    return result

def fetch_pon_onu_metrics_parallel(profile, ports, progress_callback=None):
    normalized_ports = [str(p) for p in ports if str(p).strip()]
    if not normalized_ports:
        return {}

    _progress(progress_callback, 'Getting ONU optical metrics', 'Starting parallel RX power / distance collection')
    results = {}
    missing = list(normalized_ports)
    max_workers = max(1, min(4, len(normalized_ports)))

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(_fetch_single_pon_metrics_fast, profile, port): port
            for port in normalized_ports
        }
        for future in concurrent.futures.as_completed(future_map):
            port = future_map[future]
            try:
                data = future.result()
            except Exception as e:
                print(f"[OLT METRICS FAST] Worker failed on port {port}: {e}")
                data = None
            if data and (data.get('rx') or data.get('dist')):
                results[port] = data
                _progress(progress_callback, 'Collected ONU optical metrics', f'Completed PON {port}')
                if port in missing:
                    missing.remove(port)

    for port in list(missing):
        print(f"[OLT METRICS FAST] Retrying port {port} using the original collector...")
        _progress(progress_callback, 'Retrying ONU optical metrics', f'Retrying PON {port}')
        data = fetch_pon_onu_metrics(profile, [port]).get(port)
        if data and (data.get('rx') or data.get('dist')):
            results[port] = data
            missing.remove(port)

    if missing:
        print(f"[OLT METRICS FAST] Missing data after retry for ports: {', '.join(missing)}")
    return results


# ── CONNECT AND RUN ───────────────────────────────────────────────────────────
def connect_and_run(profile, commands):
    ip          = profile['ip']
    ssh_port    = int(profile.get('ssh_port', 22) or 22)
    telnet_port = int(profile.get('telnet_port', 23) or 23)
    username    = profile['username']
    password    = profile['password']
    enable_pass = profile.get('enable_pass', '') or password
    conn_type   = (profile.get('conn_type', 'auto') or 'auto').lower()

    if conn_type == 'ssh':
        out, err = _try_ssh(ip, ssh_port, username, password, enable_pass, commands)
        return out, 'SSH', err
    elif conn_type == 'telnet':
        out, err = _try_telnet(ip, telnet_port, username, password, enable_pass, commands)
        return out, 'Telnet', err
    else:
        # Auto: try SSH first, fallback to Telnet
        out, err = _try_ssh(ip, ssh_port, username, password, enable_pass, commands)
        if not err:
            return out, 'SSH', None
        print(f"[OLT] SSH failed ({err}), trying Telnet...")
        out, err = _try_telnet(ip, telnet_port, username, password, enable_pass, commands)
        return out, 'Telnet', err

# ── MAIN POLL ─────────────────────────────────────────────────────────────────
def poll_olt(profile, progress_callback=None):
    ip      = profile['ip']
    name    = profile.get('name', ip)
    uplinks = [u.strip() for u in (profile.get('uplink_ports','gigabitethernet 0/10') or 'gigabitethernet 0/10').split(',') if u.strip()]
    commands = ['show onu info', 'show onu state'] + [f'show interface {u}' for u in uplinks]

    start = time.time()
    _progress(progress_callback, 'Connecting to OLT', f'{name} ({ip})')
    outputs, method, error = connect_and_run(profile, commands)
    duration = round(time.time() - start, 1)

    if error or not outputs:
        _save_session(ip, name, duration, 0, 0, method, 'failed', error or 'No output')
        return {'success': False, 'error': error or 'No output', 'method': method}
    name = extract_hostname('\n'.join(outputs.values()), name) or name

    _progress(progress_callback, 'Getting ONU info', f'Connected via {method}')
    onus = parse_onu_info(outputs.get('show onu info', ''))
    _progress(progress_callback, 'Getting ONU state', f'Found {len(onus)} ONUs')
    onus = parse_onu_state(outputs.get('show onu state', ''), onus)

    # ── PON ONU METRICS (rx-power and distance per port) ──
    ports = sorted(list(set(o['pon_port'] for o in onus.values() if o.get('pon_port'))))
    if ports:
        print(f"[OLT] Fetching metrics for PON ports: {ports}")
        _progress(progress_callback, 'Getting ONU rx-power', f'PONs: {", ".join(ports)}')
        pon_metrics = fetch_pon_onu_metrics_parallel(profile, ports, progress_callback=progress_callback)
        _progress(progress_callback, 'Getting ONU distance', f'Processing optical results for {len(ports)} PONs')
        for p in ports:
            m = pon_metrics.get(str(p))
            if not m: continue
            if m.get('rx'):
                onus = parse_onu_optical(m['rx'], onus, p)
            if m.get('dist'):
                onus = parse_onu_distance(m['dist'], onus, p)

    _progress(progress_callback, 'Getting uplink stats', f'{len(uplinks)} interface(s)')
    uplink_results = []
    for u in uplinks:
        raw = outputs.get(f'show interface {u}', '')
        print(f"[OLT DEBUG] interface '{u}' raw output ({len(raw)} chars): {raw[:300]!r}")
        uplink_results.append(parse_uplink_interface(raw, u))

    poll_time    = time.strftime('%Y-%m-%dT%H:%M:%S')
    online_count = sum(1 for o in onus.values() if o['online'])

    for onu in onus.values():
        execute_db(OLT_DB,
            'INSERT INTO onu_data (poll_time,olt_ip,olt_name,pon_slot,pon_port,onu_id,onu_index,model,profile,serial_no,phase_state,admin_state,omcc_state,online,rx_power,tx_power,distance_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (poll_time, ip, name, onu['pon_slot'], onu['pon_port'], onu['onu_id'],
             onu['onu_index'], onu['model'], onu['profile'], onu['serial_no'],
             onu['phase_state'], onu['admin_state'], onu['omcc_state'], onu['online'],
             onu.get('rx_power'), onu.get('tx_power'), onu.get('distance_m')))
    for s in uplink_results:
        execute_db(OLT_DB,
            'INSERT INTO uplink_stats (poll_time,olt_ip,olt_name,interface,in_bps,out_bps,in_mbps,out_mbps,in_errors,out_errors,in_pkts,out_pkts,link_status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (poll_time, ip, name, s['interface'], s['in_bps'], s['out_bps'],
             s['in_mbps'], s['out_mbps'], s['in_errors'], s['out_errors'],
             s['in_pkts'], s['out_pkts'], s['link_status'], s.get('description', '')))
    execute_db(OLT_DB, "UPDATE olt_profiles SET last_poll=?, last_status='ok' WHERE ip=?", (poll_time, ip))

    _save_session(ip, name, duration, len(onus), online_count, method, 'ok', '')
    _progress(progress_callback, 'Poll complete', f'{len(onus)} ONUs, {online_count} online in {duration}s')
    print(f"[OLT] {name}: {len(onus)} ONUs ({online_count} online), {len(uplink_results)} uplinks via {method} in {duration}s")
    return {'success': True, 'method': method, 'olt_name': name,
            'onu_count': len(onus), 'online_count': online_count,
            'poll_time': poll_time, 'duration': duration,
            'onus': list(onus.values()), 'uplink_stats': uplink_results}

# ── ONU-ONLY POLL ─────────────────────────────────────────────────────────────
def poll_onu_only(profile, progress_callback=None):
    """Connect once, run only show onu info + show onu state. Fast."""
    ip   = profile['ip']
    name = profile.get('name', ip)
    commands = ['show onu info', 'show onu state']

    start = time.time()
    _progress(progress_callback, 'Connecting to OLT', f'{name} ({ip})')
    outputs, method, error = connect_and_run(profile, commands)
    duration = round(time.time() - start, 1)

    if error or not outputs:
        _save_session(ip, name, duration, 0, 0, method, 'failed', error or 'No output')
        return {'success': False, 'error': error or 'No output', 'method': method}
    name = extract_hostname('\n'.join(outputs.values()), name) or name

    _progress(progress_callback, 'Getting ONU info', f'Connected via {method}')
    onus = parse_onu_info(outputs.get('show onu info', ''))
    _progress(progress_callback, 'Getting ONU state', f'Found {len(onus)} ONUs')
    onus = parse_onu_state(outputs.get('show onu state', ''), onus)

    # ── PON ONU METRICS (rx-power and distance per port) ──
    ports = sorted(list(set(o['pon_port'] for o in onus.values() if o.get('pon_port'))))
    if ports:
        print(f"[OLT] Fetching metrics for PON ports: {ports}")
        _progress(progress_callback, 'Getting ONU rx-power', f'PONs: {", ".join(ports)}')
        pon_metrics = fetch_pon_onu_metrics_parallel(profile, ports, progress_callback=progress_callback)
        _progress(progress_callback, 'Getting ONU distance', f'Processing optical results for {len(ports)} PONs')
        for p in ports:
            m = pon_metrics.get(str(p))
            if not m: continue
            if m.get('rx'):
                onus = parse_onu_optical(m['rx'], onus, p)
            if m.get('dist'):
                onus = parse_onu_distance(m['dist'], onus, p)

    poll_time    = time.strftime('%Y-%m-%dT%H:%M:%S')
    online_count = sum(1 for o in onus.values() if o['online'])

    for onu in onus.values():
        execute_db(OLT_DB,
            'INSERT INTO onu_data (poll_time,olt_ip,olt_name,pon_slot,pon_port,onu_id,onu_index,model,profile,serial_no,phase_state,admin_state,omcc_state,online,rx_power,tx_power,distance_m) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (poll_time, ip, name, onu['pon_slot'], onu['pon_port'], onu['onu_id'],
             onu['onu_index'], onu['model'], onu['profile'], onu['serial_no'],
             onu['phase_state'], onu['admin_state'], onu['omcc_state'], onu['online'],
             onu.get('rx_power'), onu.get('tx_power'), onu.get('distance_m')))
    execute_db(OLT_DB, "UPDATE olt_profiles SET last_poll=?, last_status='ok' WHERE ip=?", (poll_time, ip))

    _save_session(ip, name, duration, len(onus), online_count, method, 'ok', '')
    _progress(progress_callback, 'Poll complete', f'{len(onus)} ONUs, {online_count} online in {duration}s')
    print(f"[OLT] ONU-ONLY {name}: {len(onus)} ONUs ({online_count} online) via {method} in {duration}s")
    return {'success': True, 'method': method, 'olt_name': name,
            'onu_count': len(onus), 'online_count': online_count,
            'poll_time': poll_time, 'duration': duration,
            'onus': list(onus.values())}

# ── UPLINK-ONLY POLL ──────────────────────────────────────────────────────────
def poll_uplink_only(profile, interfaces=None):
    """Connect once, run show interface for the requested ports only.
    interfaces: list of interface name strings, e.g. ['gigabitethernet 0/1'].
    If None, uses the profile's saved uplink_ports.
    """
    ip      = profile['ip']
    name    = profile.get('name', ip)
    if interfaces:
        uplinks = [u.strip() for u in interfaces if u.strip()]
    else:
        uplinks = [u.strip() for u in
                   (profile.get('uplink_ports', 'gigabitethernet 0/10') or 'gigabitethernet 0/10').split(',')
                   if u.strip()]

    commands = [f'show interface {u}' for u in uplinks]

    start = time.time()
    outputs, method, error = connect_and_run(profile, commands)
    duration = round(time.time() - start, 1)

    if error or not outputs:
        return {'success': False, 'error': error or 'No output', 'method': method}

    poll_time = time.strftime('%Y-%m-%dT%H:%M:%S')
    uplink_results = []
    for u in uplinks:
        raw = outputs.get(f'show interface {u}', '')
        print(f"[OLT DEBUG] interface '{u}' raw ({len(raw)} chars): {raw[:300]!r}")
        res = parse_uplink_interface(raw, u)
        res['olt_ip']   = ip
        res['olt_name'] = name
        uplink_results.append(res)

    for s in uplink_results:
        execute_db(OLT_DB,
            'INSERT INTO uplink_stats (poll_time,olt_ip,olt_name,interface,in_bps,out_bps,in_mbps,out_mbps,in_errors,out_errors,in_pkts,out_pkts,link_status,description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (poll_time, ip, name, s['interface'], s['in_bps'], s['out_bps'],
             s['in_mbps'], s['out_mbps'], s['in_errors'], s['out_errors'],
             s['in_pkts'], s['out_pkts'], s['link_status'], s.get('description', '')))

    print(f"[OLT] UPLINK-ONLY {name}: {len(uplink_results)} interface(s) via {method} in {duration}s")
    return {'success': True, 'method': method, 'olt_name': name,
            'poll_time': poll_time, 'duration': duration,
            'uplink_stats': uplink_results}

def fetch_single_onu_live(profile, pon_port, onu_id, serial_no=''):
    """
    Targeted live query for a single ONU: connects to the OLT once, runs
    'show onu state', 'interface gpon 0/<port>', rx-power and distance
    commands for the specific pon_port/onu_id, then returns live telemetry.

    Returns:
        dict with keys: success, online, phase_state, admin_state, omcc_state,
                        rx_power, distance_m, poll_time, method, error
    """
    ip          = profile['ip']
    name        = profile.get('name', ip)
    olt_model   = get_olt_model(profile)
    port        = str(pon_port)
    onu         = str(onu_id)
    now         = time.strftime('%Y-%m-%dT%H:%M:%S')

    # --- Commands to run ---
    metric_cmds = get_pon_metric_commands(profile, port)

    # We need: show onu state, then enter PON interface for rx-power + distance
    state_cmd     = 'show onu state'
    iface_cmd     = metric_cmds['interface']
    rx_cmds       = metric_cmds.get('rx_commands', ['show pon onu all rx-power'])
    dist_cmd      = metric_cmds.get('dist', 'show onu 1-128 distance')

    commands = [state_cmd, iface_cmd] + rx_cmds
    if dist_cmd:
        commands.append(dist_cmd)

    start = time.time()
    outputs, method, error = connect_and_run(profile, commands)
    duration = round(time.time() - start, 1)

    if error or not outputs:
        return {
            'success': False,
            'error': error or 'No output from OLT',
            'method': method,
            'poll_time': now,
        }

    # --- Parse ONU state for this specific ONU ---
    raw_state = outputs.get(state_cmd, '')
    onus_state = parse_onu_state(raw_state, {})

    # Look up by (port, onu_id) key
    target_key   = (port, onu)
    onu_data     = onus_state.get(target_key, {})

    # Also try alternate GPON index format (e.g. the index could be slot/port:id)
    if not onu_data:
        for k, v in onus_state.items():
            if str(k[0]) == port and str(k[1]) == onu:
                onu_data = v
                break

    phase_state  = onu_data.get('phase_state', 'unknown')
    admin_state  = onu_data.get('admin_state', 'unknown')
    omcc_state   = onu_data.get('omcc_state', 'unknown')
    online       = 1 if phase_state.lower() == 'working' else 0

    # --- Parse rx_power ---
    raw_rx = ''
    best_rx_matches = -1
    for rx_cmd in rx_cmds:
        candidate_rx = outputs.get(rx_cmd, '')
        candidate_matches = count_rx_entries(candidate_rx)
        if candidate_matches > best_rx_matches:
            raw_rx = candidate_rx
            best_rx_matches = candidate_matches
        if candidate_matches > 0:
            break

    # Build a minimal onus dict for parsing (just this one ONU)
    temp_onus = {target_key: {
        'onu_index': f'GPON0/{port}:{onu}',
        'pon_port': port,
        'onu_id': onu,
        'serial_no': serial_no,
    }}
    temp_onus = parse_onu_optical(raw_rx, temp_onus, port)

    rx_power = temp_onus.get(target_key, {}).get('rx_power')

    # --- Parse distance ---
    distance_m = None
    if dist_cmd:
        raw_dist = outputs.get(dist_cmd, '')
        temp_onus = parse_onu_distance(raw_dist, temp_onus, port)
        distance_m = temp_onus.get(target_key, {}).get('distance_m')

    # --- Save live reading into onu_data for history continuity ---
    try:
        execute_db(OLT_DB,
            '''INSERT INTO onu_data
               (poll_time, olt_ip, olt_name, pon_slot, pon_port, onu_id, onu_index,
                model, profile, serial_no, phase_state, admin_state, omcc_state,
                online, rx_power, tx_power, distance_m)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (now, ip, name, '0', port, onu,
             f'GPON0/{port}:{onu}',
             onu_data.get('model', ''), onu_data.get('profile', ''),
             serial_no or onu_data.get('serial_no', ''),
             phase_state, admin_state, omcc_state,
             online, rx_power, None, distance_m))
    except Exception as e:
        print(f'[ONT LIVE] DB save error: {e}')

    print(f'[ONT LIVE] {name} GPON0/{port}:{onu} -> {phase_state}, '
          f'rx={rx_power} dBm, dist={distance_m}m via {method} in {duration}s')

    return {
        'success': True,
        'online': online,
        'phase_state': phase_state,
        'admin_state': admin_state,
        'omcc_state': omcc_state,
        'rx_power': rx_power,
        'distance_m': distance_m,
        'poll_time': now,
        'method': method,
        'duration': duration,
        'olt_name': name,
        'olt_ip': ip,
        'pon_port': port,
        'onu_id': onu,
    }


def _save_session(ip, name, duration, total, online, method, status, error):
    try:
        execute_db(OLT_DB,
            'INSERT INTO olt_poll_sessions (olt_ip,olt_name,poll_time,duration_s,onu_count,online_count,method,status,error) VALUES (?,?,?,?,?,?,?,?,?)',
            (ip, name, time.strftime('%Y-%m-%dT%H:%M:%S'), duration, total, online, method, status, error))
    except Exception as e:
        print(f"[OLT SESSION] Failed to save poll session for {ip}: {e}")


def _match_serial_by_mac(olt_ip: str, raw_mac: str, min_overlap: int = 5):
    """
    Finds the most recent ONU record in onu_data whose serial number shares a
    contiguous >=min_overlap-char hex substring with the learned MAC address.

    Background: VSOL GPON ONUs embed their MAC-derived identifier inside the
    GPON serial number (e.g. MAC 14a7:2b41:38fb <-> serial GPON004138F6 share
    the 5-char hex run '4138f').

    Args:
        olt_ip:      IP of the OLT to scope the search.
        raw_mac:     Raw learned MAC string from the OLT (any separator/format).
        min_overlap: Minimum hex character run that must appear in both strings.
                     Default 5 avoids false matches while covering VSOL serials.

    Returns:
        dict of the matching onu_data row (latest poll), or None if not found.
    """
    # Strip all non-hex chars from MAC
    clean_mac = ''.join(c for c in raw_mac.lower() if c in '0123456789abcdef')
    if len(clean_mac) < min_overlap:
        return None

    # Fetch distinct serials for this OLT from the database
    serial_rows = query_db(
        OLT_DB,
        "SELECT DISTINCT serial_no FROM onu_data WHERE olt_ip=?",
        (olt_ip,)
    )

    best_serial = None
    for row in serial_rows:
        sn = row.get('serial_no') or ''
        clean_sn = ''.join(c for c in sn.lower() if c in '0123456789abcdef')
        if len(clean_sn) < min_overlap:
            continue
        # Check for a contiguous hex run of length >= min_overlap in clean_sn
        # that also appears in clean_mac
        for i in range(len(clean_sn) - min_overlap + 1):
            substr = clean_sn[i:i + min_overlap]
            if substr in clean_mac:
                best_serial = sn
                break
        if best_serial:
            break  # Take first match (serials are unique per OLT)

    if not best_serial:
        return None

    db_rows = query_db(
        OLT_DB,
        "SELECT * FROM onu_data WHERE olt_ip=? AND serial_no=? ORDER BY poll_time DESC LIMIT 1",
        (olt_ip, best_serial)
    )
    return dict(db_rows[0]) if db_rows else None


def lookup_onu_by_vlan(profile, vlan_id):
    """
    Queries OLT MAC address table for a specific VLAN ID, extracts connected GPON ports / ONUs,
    and matches them against database inventory & live optical telemetry.

    Supports two OLT MAC table formats:
      1. Standard 2-char groups:  34:e6:ad:12:34:56  with port  GPON0/1:2
      2. VSOL 4-char groups:      14a7:2b41:38fb     with port  GPON  (no ONU locator)

    For format (2), uses _match_serial_by_mac to correlate the learned MAC against
    stored serial numbers by finding a >=5-char hex substring overlap.
    """
    vlan_str = str(vlan_id).strip()
    if not vlan_str:
        return {'success': False, 'error': 'vlan_id is required'}

    ip          = profile['ip']
    port_ssh    = profile.get('ssh_port', 22)
    port_telnet = profile.get('telnet_port', 23)
    username    = profile['username']
    password    = profile['password']
    enable_pass = profile.get('enable_pass') or password
    conn_type   = profile.get('conn_type', 'auto').lower()
    name        = profile.get('name') or ip

    # Try spaced form first (VSOL/BSNL), then hyphenated (other vendors), then generic
    cmds = [
        f'show mac address-table vlan {vlan_str}',
        f'show mac-address-table vlan {vlan_str}',
        f'show mac vlan {vlan_str}',
    ]

    t0 = time.time()
    outputs = None; method = None; error = None

    if conn_type in ('ssh', 'auto'):
        outputs, error = _try_ssh(ip, port_ssh, username, password, enable_pass, cmds)
        if outputs: method = 'SSH'

    if not outputs and conn_type in ('telnet', 'auto'):
        outputs, error = _try_telnet(ip, port_telnet, username, password, enable_pass, cmds)
        if outputs: method = 'Telnet'

    if not outputs:
        return {'success': False, 'error': f'Failed to connect to OLT {name}: {error or "Unknown error"}'}

    # Aggregate all command outputs
    combined_raw = '\n'.join(filter(None, [outputs.get(c, '') for c in cmds]))
    cleaned = clean_output(combined_raw)

    # ── MAC patterns ──────────────────────────────────────────────────────────
    # Standard 2-char groups with slot/port:onu_id locator
    # e.g.  100   34:e6:ad:12:34:56  Dynamic  GPON0/1:2
    mac_with_locator = re.compile(
        r'(\d+)\s+'
        r'([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-]'
        r'[0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})\s+'
        r'\S+\s+'
        r'(?:gpon\s*)?(\d+)/(\d+):(\d+)',
        re.IGNORECASE
    )
    # VSOL 4-char groups, bare GPON port (no ONU locator)
    # e.g.  199   14a7:2b41:38fb   Dynamic   GPON   Aging
    mac_4char_gpon = re.compile(
        r'(\d+)\s+'
        r'([0-9a-f]{4}[:\-][0-9a-f]{4}[:\-][0-9a-f]{4})\s+'
        r'\S+\s+'
        r'(gpon)\b',
        re.IGNORECASE
    )
    # Standard 2-char format with bare GPON port (some vendor variants)
    mac_std_gpon = re.compile(
        r'(\d+)\s+'
        r'([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-]'
        r'[0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})\s+'
        r'\S+\s+'
        r'(gpon)\b',
        re.IGNORECASE
    )
    # Skip uplink GE / Ethernet interfaces
    uplink_re = re.compile(r'\bge\b|\bethernet\b|\bge\s*0/\d', re.IGNORECASE)

    matched_targets = set()   # (pon_port, onu_id) for locator-style rows
    mac_mappings    = {}      # (pon_port, onu_id) -> raw MAC string
    gpon_macs       = []      # learned MACs for bare-GPON rows (no locator)

    for line in cleaned.splitlines():
        stripped = line.strip()
        if not stripped or vlan_str not in stripped:
            continue
        if uplink_re.search(stripped):
            continue

        # Try full locator match first (slot/port:onu_id)
        m = mac_with_locator.search(stripped)
        if m and m.group(1) == vlan_str:
            pon_port = m.group(4)
            onu_id   = m.group(5)
            key      = (str(pon_port), str(onu_id))
            matched_targets.add(key)
            mac_mappings[key] = m.group(2)
            continue

        # Try VSOL 4-char bare GPON
        m = mac_4char_gpon.search(stripped)
        if m and m.group(1) == vlan_str:
            gpon_macs.append(m.group(2))
            continue

        # Try standard 2-char bare GPON
        m = mac_std_gpon.search(stripped)
        if m and m.group(1) == vlan_str:
            gpon_macs.append(m.group(2))

    # ── Phase 1: Exact DB lookup for locator-style matches ────────────────────
    results = []
    for (pon_port, onu_id) in matched_targets:
        db_rows = query_db(
            OLT_DB,
            "SELECT * FROM onu_data WHERE olt_ip=? AND pon_port=? AND onu_id=? ORDER BY poll_time DESC LIMIT 1",
            (ip, pon_port, onu_id)
        )
        if db_rows:
            r = dict(db_rows[0])
            r['learned_mac'] = mac_mappings.get((pon_port, onu_id), '')
            r['vlan_id']     = vlan_str
            results.append(r)
        else:
            # Entry discovered on CLI but not in DB yet
            results.append({
                'olt_ip':      ip,
                'olt_name':    name,
                'pon_port':    pon_port,
                'onu_id':      onu_id,
                'vlan_id':     vlan_str,
                'serial_no':   'Discovered on OLT',
                'online':      1,
                'phase_state': 'working',
                'learned_mac': mac_mappings.get((pon_port, onu_id), ''),
                'rx_power':    None,
                'distance_m':  None,
            })

    # ── Phase 2: MAC→Serial correlation for bare-GPON rows ───────────────────
    seen_serials = {r.get('serial_no') for r in results}
    for raw_mac in gpon_macs:
        db_row = _match_serial_by_mac(ip, raw_mac, min_overlap=5)
        if db_row and db_row.get('serial_no') not in seen_serials:
            db_row['learned_mac'] = raw_mac
            db_row['vlan_id']     = vlan_str
            results.append(db_row)
            seen_serials.add(db_row.get('serial_no'))
        elif not db_row:
            # No DB record yet — report discovery stub
            stub_key = f'gpon_mac_{raw_mac}'
            if stub_key not in seen_serials:
                results.append({
                    'olt_ip':      ip,
                    'olt_name':    name,
                    'pon_port':    None,
                    'onu_id':      None,
                    'vlan_id':     vlan_str,
                    'serial_no':   f'Discovered (MAC {raw_mac})',
                    'online':      1,
                    'phase_state': 'working',
                    'learned_mac': raw_mac,
                    'rx_power':    None,
                    'distance_m':  None,
                })
                seen_serials.add(stub_key)

    duration = round(time.time() - t0, 2)
    return {
        'success':    True,
        'vlan_id':    vlan_str,
        'olt_name':   name,
        'olt_ip':     ip,
        'count':      len(results),
        'onus':       results,
        'method':     method,
        'duration':   duration,
        'raw_output': cleaned[:2000],
    }


# ── ONU CONFIGS (PPPoE / Landline) ────────────────────────────────────────────

def init_onu_configs_table():
    """Create onu_configs table if it does not exist (idempotent)."""
    execute_db(OLT_DB, """CREATE TABLE IF NOT EXISTS onu_configs (
        id            SERIAL PRIMARY KEY,
        olt_id        TEXT NOT NULL,
        onu_id        TEXT NOT NULL,
        pon_port      TEXT DEFAULT '',
        serial_number TEXT DEFAULT '',
        description   TEXT DEFAULT '',
        pppoe_id      TEXT DEFAULT '',
        landline      TEXT DEFAULT '',
        wan_vlan      TEXT DEFAULT '',
        line_profile  TEXT DEFAULT '',
        srv_profile   TEXT DEFAULT '',
        raw_config    TEXT DEFAULT '',
        polled_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (olt_id, onu_id)
    )""")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_configs_pppoe    ON onu_configs (pppoe_id)")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_configs_landline ON onu_configs (landline)")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_configs_serial   ON onu_configs (serial_number)")
    execute_db(OLT_DB, "CREATE INDEX IF NOT EXISTS idx_onu_configs_olt      ON onu_configs (olt_id)")


try:
    init_onu_configs_table()
except Exception as _onu_cfg_err:
    print(f"[OLT] onu_configs table init warning: {_onu_cfg_err}")


def store_onu_config(olt_id, onu_id, pon_port, record: dict):
    """Upsert a single ONU config row into onu_configs."""
    execute_db(OLT_DB, """
        INSERT INTO onu_configs
            (olt_id, onu_id, pon_port, serial_number, description,
             pppoe_id, landline, wan_vlan, line_profile, srv_profile,
             raw_config, polled_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP)
        ON CONFLICT (olt_id, onu_id)
        DO UPDATE SET
            pon_port      = EXCLUDED.pon_port,
            serial_number = EXCLUDED.serial_number,
            description   = EXCLUDED.description,
            pppoe_id      = EXCLUDED.pppoe_id,
            landline      = EXCLUDED.landline,
            wan_vlan      = EXCLUDED.wan_vlan,
            line_profile  = EXCLUDED.line_profile,
            srv_profile   = EXCLUDED.srv_profile,
            raw_config    = EXCLUDED.raw_config,
            polled_at     = CURRENT_TIMESTAMP
    """, (
        str(olt_id), str(onu_id), str(pon_port),
        record.get('serial_number', ''),
        record.get('description', ''),
        record.get('pppoe_id', ''),
        record.get('landline', ''),
        record.get('wan_vlan', ''),
        record.get('line_profile', ''),
        record.get('srv_profile', ''),
        record.get('raw_config', ''),
    ))


def _parse_running_config(raw: str) -> dict:
    """
    Parse 'show running-config onu N' output.
    Returns dict with pppoe_id, landline, wan_vlan, line_profile,
    srv_profile, description, serial_number extracted from the text.
    Correctly associates the WAN VLAN with the PPPoE connection index.
    """
    cleaned = clean_output(raw)
    result = {
        'pppoe_id': '', 'landline': '', 'wan_vlan': '',
        'line_profile': '', 'srv_profile': '', 'description': '',
        'serial_number': '', 'raw_config': cleaned,
    }
    wan_indexes = {}
    general_vlans = []

    for line in cleaned.splitlines():
        s = line.strip()
        if not s:
            continue

        # Description: "onu 2 desc Ollapatti_Room/1:2"
        m = re.search(r'\bonu\s+\d+\s+desc\s+(\S+)', s, re.IGNORECASE)
        if m:
            result['description'] = m.group(1)

        # Line profile: "onu 2 profile line BSNL_194_204_1831"
        m = re.search(r'\bprofile\s+line\s+(\S+)', s, re.IGNORECASE)
        if m:
            result['line_profile'] = m.group(1)

        # Service profile: "onu 2 profile srv FOR_WIFI"
        m = re.search(r'\bprofile\s+srv\s+(\S+)', s, re.IGNORECASE)
        if m:
            result['srv_profile'] = m.group(1)

        # Equipment ID / serial: "onu 2 pri equid MONUH113"
        m = re.search(r'\bequid\s+(\S+)', s, re.IGNORECASE)
        if m:
            result['serial_number'] = m.group(1)

        # Track WAN settings by index: "onu 20 pri wan_adv index 1 ..."
        m_idx = re.search(r'\bwan_adv\s+index\s+(\d+)\b', s, re.IGNORECASE)
        if m_idx:
            idx = m_idx.group(1)
            if idx not in wan_indexes:
                wan_indexes[idx] = {'user': '', 'wan_vlan': '', 'is_pppoe': False, 'mode': ''}

            # PPPoE user on this index: "... user sv4290292735_sid@ ftth.bsnl.in pwd ..."
            m_user = re.search(r'\buser\s+(.*?)\s+pwd\b', s, re.IGNORECASE)
            if m_user:
                cleaned_user = re.sub(r'\s+', '', m_user.group(1))
                wan_indexes[idx]['user'] = cleaned_user
                wan_indexes[idx]['is_pppoe'] = True

            if re.search(r'\broute\s+ipv4\s+pppoe\b', s, re.IGNORECASE):
                wan_indexes[idx]['is_pppoe'] = True

            m_vlan = re.search(r'\bwan_vlan\s+(\d+)\b', s, re.IGNORECASE)
            if m_vlan:
                wan_indexes[idx]['wan_vlan'] = m_vlan.group(1)

            m_mode = re.search(r'\bmode\s+(\S+)\b', s, re.IGNORECASE)
            if m_mode:
                wan_indexes[idx]['mode'] = m_mode.group(1)
        else:
            # Fallback for configs not using "wan_adv index N"
            m_user = re.search(r'\buser\s+(.*?)\s+pwd\b', s, re.IGNORECASE)
            if m_user and not result['pppoe_id']:
                result['pppoe_id'] = re.sub(r'\s+', '', m_user.group(1))
            m_vlan = re.search(r'\bwan_vlan\s+(\d+)\b', s, re.IGNORECASE)
            if m_vlan:
                general_vlans.append(m_vlan.group(1))

    # Match the PPPoE WAN index
    pppoe_vlan = ''
    pppoe_user = ''
    if wan_indexes:
        # Priority 1: Index with both user and pppoe flag
        for idx, data in wan_indexes.items():
            if data['user'] and data['is_pppoe']:
                pppoe_user = data['user']
                pppoe_vlan = data['wan_vlan']
                break
        # Priority 2: Index with user
        if not pppoe_user:
            for idx, data in wan_indexes.items():
                if data['user']:
                    pppoe_user = data['user']
                    pppoe_vlan = data['wan_vlan']
                    break
        # Priority 3: Index with internet/pppoe mode
        if not pppoe_vlan:
            for idx, data in wan_indexes.items():
                if 'internet' in data['mode'].lower() or data['is_pppoe']:
                    pppoe_vlan = data['wan_vlan']
                    break
        # Priority 4: First WAN index with any vlan
        if not pppoe_vlan:
            for idx, data in wan_indexes.items():
                if data['wan_vlan']:
                    pppoe_vlan = data['wan_vlan']
                    break

    if pppoe_user:
        result['pppoe_id'] = pppoe_user
    if pppoe_vlan:
        result['wan_vlan'] = pppoe_vlan
    elif general_vlans:
        result['wan_vlan'] = general_vlans[0]

    # Extract landline (7 to 12 digits) from PPPoE ID
    if result['pppoe_id']:
        num_m = re.search(r'(\d{7,12})', result['pppoe_id'])
        if num_m:
            result['landline'] = num_m.group(1)

    return result


def poll_onu_running_configs(profile: dict, ports=None, progress_callback=None):
    """
    Connect to OLT, iterate 'show running-config onu N' for every ONU on
    every PON port, parse PPPoE/landline/VLAN info and upsert into onu_configs.
    Returns dict with success, saved count, error.
    """
    if ports is None:
        ports = list(range(1, 9))

    ip          = profile['ip']
    ssh_port    = int(profile.get('ssh_port', 22) or 22)
    telnet_port = int(profile.get('telnet_port', 23) or 23)
    username    = profile['username']
    password    = profile['password']
    enable_pass = profile.get('enable_pass', '') or password
    conn_type   = (profile.get('conn_type', 'auto') or 'auto').lower()
    olt_id      = str(profile.get('id', ip))
    name        = profile.get('name', ip) or ip
    model       = get_olt_model(profile)

    _progress(progress_callback, 'Connecting', f'SSH/Telnet to {name} ({ip})')

    saved = 0

    # ── SSH path ──────────────────────────────────────────────────────────────
    def _run_ssh():
        nonlocal saved
        try:
            import paramiko
        except (ImportError, ModuleNotFoundError):
            return False, 'paramiko not available'
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(ip, port=ssh_port, username=username, password=password,
                           timeout=15, look_for_keys=False, allow_agent=False)
            shell = client.invoke_shell(width=512, height=2000)
            time.sleep(1.5)
            if shell.recv_ready():
                shell.recv(65535)

            PAGER_R = re.compile(
                r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
                r'<\s*space\s*>|continue\?\s*\[y/n\])', re.IGNORECASE)
            PROMPT_R = re.compile(r'[#>]\s*$', re.MULTILINE)

            def sc(cmd, timeout=12):
                shell.send(cmd + '\n')
                out = ''
                deadline = time.time() + timeout
                last_recv = time.time()
                while time.time() < deadline:
                    if shell.recv_ready():
                        chunk = shell.recv(65535).decode('utf-8', errors='replace')
                        out += chunk
                        last_recv = time.time()
                        if PAGER_R.search(chunk):
                            shell.send(' ')
                            time.sleep(0.05)
                            continue
                        lines = [l.strip() for l in out.splitlines() if l.strip()]
                        if len(lines) > 1 and PROMPT_R.search(lines[-1]):
                            break
                    else:
                        if out and (time.time() - last_recv > 0.15):
                            lines = [l.strip() for l in out.splitlines() if l.strip()]
                            if lines and PROMPT_R.search(lines[-1]):
                                break
                        time.sleep(0.02)
                return out

            sc('en'); sc(enable_pass)
            sc('configure terminal')
            sc('terminal length 0')
            sc('screen-length 0 temporary')

            for port_n in ports:
                iface_cmd = f'int gpon 0/{port_n}' if model == 'V1600G1B' else f'interface gpon 0/{port_n}'
                sc(iface_cmd)
                _progress(progress_callback, f'Polling PON {port_n}', f'Checking ONUs on PON {port_n}...')
                info_out = sc('show onu info', timeout=15)
                onus_on_port = sorted(set(
                    m.group(1)
                    for line in clean_output(info_out).splitlines()
                    for m in [re.search(r'(?:GPON)?\d+/\d+:(\d+)', line)]
                    if m
                ))
                for onu_n in onus_on_port:
                    _progress(progress_callback, f'PON {port_n}', f'Config ONU {onu_n} ({saved + 1} saved)')
                    cfg_out = sc(f'show running-config onu {onu_n}', timeout=15)
                    parsed = _parse_running_config(cfg_out)
                    store_onu_config(olt_id, f'{port_n}:{onu_n}', str(port_n), parsed)
                    saved += 1
                sc('exit')

            client.close()
            return True, None
        except Exception as e:
            return False, str(e)

    # ── Telnet path ───────────────────────────────────────────────────────────
    def _run_telnet():
        nonlocal saved
        IAC = bytes([255]); DONT = bytes([254]); DO = bytes([253])
        WONT = bytes([252]); WILL = bytes([251])
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(15); sock.connect((ip, telnet_port)); sock.settimeout(0.5)
            buf = b''
            PAGER_T = re.compile(
                r'(-{0,3}\s*more\s*-{0,3}|press\s+(space|enter|any\s+key)|--\s*more\s*--|'
                r'<\s*space\s*>|continue\?\s*\[y/n\])', re.IGNORECASE)

            def recv_until(prompts, timeout=10):
                nonlocal buf
                if isinstance(prompts, str): prompts = [prompts]
                deadline = time.time() + timeout
                last_recv = time.time()
                while time.time() < deadline:
                    try:
                        chunk = sock.recv(4096)
                        if chunk:
                            clean_b = b''; i = 0
                            while i < len(chunk):
                                if chunk[i:i+1] == IAC and i + 2 < len(chunk):
                                    cb = chunk[i+1:i+2]; opt = chunk[i+2:i+3]
                                    if cb == DO: sock.send(IAC + WONT + opt)
                                    elif cb == WILL: sock.send(IAC + DONT + opt)
                                    i += 3
                                else:
                                    clean_b += chunk[i:i+1]; i += 1
                            buf += clean_b
                            last_recv = time.time()
                    except socket.timeout:
                        pass
                    decoded = buf.decode('utf-8', errors='replace')
                    if PAGER_T.search(decoded):
                        sock.send(b' '); time.sleep(0.05); continue
                    for p in prompts:
                        if p.lower() in decoded.lower():
                            return decoded
                    if buf and (time.time() - last_recv > 0.15):
                        for p in prompts:
                            if p.lower() in decoded.lower():
                                return decoded
                    time.sleep(0.02)
                return buf.decode('utf-8', errors='replace')

            def sl(text):
                sock.send((text + '\r\n').encode('utf-8'))

            recv_until(['Login:', 'login:', 'Username:']); buf = b''; sl(username)
            recv_until(['Password:', 'password:']); buf = b''; sl(password)
            time.sleep(1.0); recv_until(['>', '#']); buf = b''
            sl('en'); out = recv_until(['Password:', 'password:', '#'], timeout=5)
            if 'assword' in out:
                buf = b''; sl(enable_pass); time.sleep(0.5); recv_until(['#']); buf = b''
            sl('configure terminal'); time.sleep(0.8); recv_until(['(config)#', '#'])
            for nc in ['terminal length 0', 'screen-length 0 temporary']:
                buf = b''; sl(nc); time.sleep(0.4); recv_until(['(config)#', '#'], timeout=4)
            buf = b''

            for port_n in ports:
                iface_cmd = f'int gpon 0/{port_n}' if model == 'V1600G1B' else f'interface gpon 0/{port_n}'
                buf = b''; sl(iface_cmd)
                recv_until(['(config-pon', '#'], timeout=6)
                _progress(progress_callback, f'Polling PON {port_n}', f'Checking ONUs on PON {port_n}...')
                buf = b''; sl('show onu info')
                info_out = recv_until(['(config-pon', '#'], timeout=15)
                onus_on_port = sorted(set(
                    m.group(1)
                    for line in clean_output(info_out).splitlines()
                    for m in [re.search(r'(?:GPON)?\d+/\d+:(\d+)', line)]
                    if m
                ))
                for onu_n in onus_on_port:
                    _progress(progress_callback, f'PON {port_n}', f'Config ONU {onu_n} ({saved + 1} saved)')
                    buf = b''; sl(f'show running-config onu {onu_n}')
                    cfg_out = recv_until(['(config-pon', '#'], timeout=15)
                    parsed = _parse_running_config(cfg_out)
                    store_onu_config(olt_id, f'{port_n}:{onu_n}', str(port_n), parsed)
                    saved += 1; buf = b''
                buf = b''; sl('exit'); recv_until(['(config)#', '#'], timeout=4)

            sock.close()
            return True, None
        except Exception as e:
            return False, str(e)

    ok = False; err_msg = ''
    if conn_type in ('ssh', 'auto'):
        ok, err_msg = _run_ssh()
    if not ok and conn_type in ('telnet', 'auto'):
        _progress(progress_callback, 'Trying Telnet', f'{ip}:{telnet_port}')
        ok, err_msg = _run_telnet()

    _progress(progress_callback, 'Done' if ok else 'Failed',
              f'{saved} ONU configs saved' if ok else err_msg)
    return {'success': ok, 'saved': saved, 'error': err_msg if not ok else ''}


def pppoe_lookup_from_db(query: str) -> list:
    """
    Search onu_configs by PPPoE ID or numeric subscriber ID (landline).
    Accepts full strings like 'pe4290290469_sid@ftth.bsnl.in' or numeric '4290290469'.
    Returns list of matching rows joined with latest onu_data optical readings.
    """
    q = str(query).strip()
    if not q:
        return []
    num_m = re.search(r'(\d{7,12})', q)
    numeric = num_m.group(1) if num_m else None

    rows = query_db(OLT_DB, """
        SELECT c.*,
               COALESCE(NULLIF(c.serial_number, ''), d.serial_no) AS serial_no,
               d.rx_power, d.distance_m, d.online, d.phase_state,
               d.admin_state, d.omcc_state, d.poll_time,
               p.name AS olt_name, p.ip AS olt_ip
        FROM onu_configs c
        LEFT JOIN LATERAL (
            SELECT serial_no, rx_power, distance_m, online, phase_state,
                   admin_state, omcc_state, poll_time
            FROM onu_data
            WHERE olt_ip = (SELECT ip FROM olt_profiles WHERE CAST(id AS TEXT)=c.olt_id LIMIT 1)
              AND onu_id = SPLIT_PART(c.onu_id, ':', 2)
              AND CAST(pon_port AS TEXT) = c.pon_port
            ORDER BY poll_time DESC LIMIT 1
        ) d ON TRUE
        LEFT JOIN olt_profiles p ON CAST(p.id AS TEXT) = c.olt_id
        WHERE c.pppoe_id ILIKE ? OR c.pppoe_id ILIKE ?
        LIMIT 50
    """, (f'%{q}%', f'%{numeric}%' if numeric else f'%{q}%'))

    if not rows and numeric:
        rows = query_db(OLT_DB, """
            SELECT c.*,
                   COALESCE(NULLIF(c.serial_number, ''), d.serial_no) AS serial_no,
                   d.rx_power, d.distance_m, d.online, d.phase_state,
                   d.admin_state, d.omcc_state, d.poll_time,
                   p.name AS olt_name, p.ip AS olt_ip
            FROM onu_configs c
            LEFT JOIN LATERAL (
                SELECT serial_no, rx_power, distance_m, online, phase_state,
                       admin_state, omcc_state, poll_time
                FROM onu_data
                WHERE olt_ip = (SELECT ip FROM olt_profiles WHERE CAST(id AS TEXT)=c.olt_id LIMIT 1)
                  AND onu_id = SPLIT_PART(c.onu_id, ':', 2)
                  AND CAST(pon_port AS TEXT) = c.pon_port
                ORDER BY poll_time DESC LIMIT 1
            ) d ON TRUE
            LEFT JOIN olt_profiles p ON CAST(p.id AS TEXT) = c.olt_id
            WHERE c.landline ILIKE ?
            LIMIT 50
        """, (f'%{numeric}%',))

    return [dict(r) for r in rows] if rows else []
