"""
SimpleNOC v0.5.5.1 - OLT Connector
SSH (primary) or Telnet (raw socket, Python 3.13 compatible) fallback.
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

def _save_session(ip, name, duration, total, online, method, status, error):
    try:
        execute_db(OLT_DB,
            'INSERT INTO olt_poll_sessions (olt_ip,olt_name,poll_time,duration_s,onu_count,online_count,method,status,error) VALUES (?,?,?,?,?,?,?,?,?)',
            (ip, name, time.strftime('%Y-%m-%dT%H:%M:%S'), duration, total, online, method, status, error))
    except Exception as e:
        print(f"[OLT SESSION] Failed to save poll session for {ip}: {e}")
