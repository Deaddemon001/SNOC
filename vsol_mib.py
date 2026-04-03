"""
Vsol V1600G/D OLT - Complete MIB OID Translation Engine
Auto-translates any OID to human readable name + value
Scraped from: https://mibs.observium.org/mib/V1600G/
Enterprise ID: 37950 (vsolution)
"""

# ── STANDARD SNMP OIDs ──────────────────────────────────────────────────────
STANDARD_OIDS = {
    '1.3.6.1.2.1.1.1.0':       'sysDescr',
    '1.3.6.1.2.1.1.2.0':       'sysObjectID',
    '1.3.6.1.2.1.1.3.0':       'sysUpTime',
    '1.3.6.1.2.1.1.4.0':       'sysContact',
    '1.3.6.1.2.1.1.5.0':       'sysName',
    '1.3.6.1.2.1.1.6.0':       'sysLocation',
    '1.3.6.1.2.1.2.2.1.1':     'ifIndex',
    '1.3.6.1.2.1.2.2.1.2':     'ifDescr',
    '1.3.6.1.2.1.2.2.1.5':     'ifSpeed',
    '1.3.6.1.2.1.2.2.1.7':     'ifAdminStatus',
    '1.3.6.1.2.1.2.2.1.8':     'ifOperStatus',
    '1.3.6.1.2.1.2.2.1.10':    'ifInOctets',
    '1.3.6.1.2.1.2.2.1.14':    'ifInErrors',
    '1.3.6.1.2.1.2.2.1.16':    'ifOutOctets',
    '1.3.6.1.2.1.2.2.1.20':    'ifOutErrors',
    '1.3.6.1.6.3.1.1.4.1.0':   'snmpTrapOID',
    '1.3.6.1.6.3.1.1.4.3.0':   'snmpTrapEnterprise',
    '1.3.6.1.6.3.1.1.5.1':     'coldStart',
    '1.3.6.1.6.3.1.1.5.2':     'warmStart',
    '1.3.6.1.6.3.1.1.5.3':     'linkDown',
    '1.3.6.1.6.3.1.1.5.4':     'linkUp',
    '1.3.6.1.6.3.1.1.5.5':     'authenticationFailure',
    '1.3.6.1.6.3.18.1.3.0':    'agentAddress',
    '1.3.6.1.6.3.18.1.4.0':    'community',
}

# ── VSOL ENTERPRISE OIDs ─────────────────────────────────────────────────────
# Base: 1.3.6.1.4.1.37950
VSOL_OID_MAP = {
    # Trap alarm varbinds (1.3.6.1.4.1.37950.1.1.5.10.13.x)
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.1.0':  'alarmIndex',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.2.0':  'alarmType',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.3.0':  'onuId',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.4.0':  'alarmPort',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.5.0':  'alarmObjOID',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.6.0':  'ponSlot',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.7.0':  'oltMacAddress',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.8.0':  'oltTimestamp',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.9.0':  'alarmSeverity',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.10.0': 'alarmDescription',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.11.0': 'alarmStatus',
    '1.3.6.1.4.1.37950.1.1.5.10.13.2.12.0': 'alarmName',
    '1.3.6.1.4.1.37950.1.1.5.10.13.5.30':   'alarmObj_PON_UP',
    '1.3.6.1.4.1.37950.1.1.5.10.13.5.31':   'alarmObj_PON_DOWN',
    '1.3.6.1.4.1.37950.1.1.5.10.13.5.32':   'alarmObj_ONU_OFFLINE',
    '1.3.6.1.4.1.37950.1.1.5.10.13.5.65':   'alarmObj_LAN',
    '1.3.6.1.4.1.37950.1.1.5.10.13.6.1':    'ponAlarmTrap',

    # ONU auth info (1.3.6.1.4.1.37950.1.1.6.1.1.2.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.1':    'gOnuAuthInfoPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.2':    'gOnuAuthInfoOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.3':    'gOnuAuthInfoOnuPName',
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.4':    'gOnuAuthInfoAuthMode',
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.5':    'gOnuAuthInfoAuthInfo',
    '1.3.6.1.4.1.37950.1.1.6.1.1.2.1.6':    'gOnuModel',

    # ONU optical info (1.3.6.1.4.1.37950.1.1.6.1.1.3.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.1':    'gOnuOpticalInfoPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.2':    'gOnuOpticalInfoOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.3':    'gOnuOpticalInfoTemp',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.4':    'gOnuOpticalInfoVolt',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.5':    'gOnuOpticalInfoBias',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.6':    'gOnuOpticalInfoTxPwr',
    '1.3.6.1.4.1.37950.1.1.6.1.1.3.1.7':    'gOnuOpticalInfoRxPwr',

    # ONU detail info (1.3.6.1.4.1.37950.1.1.6.1.1.4.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.1':    'gOnuDetailInfoPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.2':    'gOnuDetailInfoOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.3':    'gOnuDetailInfoVendorId',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.4':    'gOnuDetailInfoVersion',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.5':    'gOnuDetailInfoSn',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.6':    'gOnuDetailInfoAdminSta',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.13':   'gOnuDetailInfoOpSta',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.14':   'gOnuDetailInfoEquipmentId',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.17':   'gOnuDetailInfoModel',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.24':   'gOnuDetailInfoOnuDesc',
    '1.3.6.1.4.1.37950.1.1.6.1.1.4.1.25':   'gOnuDetailInfoMainVer',

    # ONU status table (1.3.6.1.4.1.37950.1.1.6.1.1.1.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.1':    'gOnuStaInfoPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.2':    'gOnuStaInfoOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.3':    'gOnuStaInfoAdminSta',
    '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.4':    'gOnuStaInfoOmccSta',
    '1.3.6.1.4.1.37950.1.1.6.1.1.1.1.5':    'gOnuStaInfoPhaseSta',

    # ONU statistics (1.3.6.1.4.1.37950.1.1.6.1.1.17.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.1':   'gOnuStaPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.2':   'gOnuStaOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.3':   'gOnuStaInputRateBps',
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.5':   'gOnuStaOutputRateBps',
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.13':  'gOnuStaInputOctets',
    '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.15':  'gOnuStaOutputOctets',

    # ONU count (1.3.6.1.4.1.37950.1.1.6.1.1.18.x)
    '1.3.6.1.4.1.37950.1.1.6.1.1.18.1.1':   'gOnuNumberPon',
    '1.3.6.1.4.1.37950.1.1.6.1.1.18.1.2':   'gOnuNumberAll',
    '1.3.6.1.4.1.37950.1.1.6.1.1.18.1.3':   'gOnuNumberOnline',

    # Auto-find ONU (1.3.6.1.4.1.37950.1.1.6.1.2.x)
    '1.3.6.1.4.1.37950.1.1.6.1.2.1.1.1':    'gOnuAutoFindBasePonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.2.1.1.2':    'gOnuAutoFindBaseOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.2.1.1.3':    'gOnuAutoFindBaseSn',
    '1.3.6.1.4.1.37950.1.1.6.1.2.1.1.4':    'gOnuAutoFindBaseState',
    '1.3.6.1.4.1.37950.1.1.6.1.2.2.1.3':    'gOnuAutoFindDetailSn',
    '1.3.6.1.4.1.37950.1.1.6.1.2.2.1.7':    'gOnuAutoFindDetailModel',
    '1.3.6.1.4.1.37950.1.1.6.1.2.2.1.8':    'gOnuAutoFindDetailVersion',

    # Rogue ONU (1.3.6.1.4.1.37950.1.1.6.1.5.x)
    '1.3.6.1.4.1.37950.1.1.6.1.5.3.1.1':    'gRogueOnuListPonInx',
    '1.3.6.1.4.1.37950.1.1.6.1.5.3.1.2':    'gRogueOnuListOnuInx',
    '1.3.6.1.4.1.37950.1.1.6.1.5.3.1.3':    'gRogueOnuListKeywords',
    '1.3.6.1.4.1.37950.1.1.6.1.5.3.1.4':    'gRogueOnuListTime',
    '1.3.6.1.4.1.37950.1.1.6.1.5.3.1.5':    'gRogueOnuListState',
}

# Merge all OIDs
ALL_OIDS = {**STANDARD_OIDS, **VSOL_OID_MAP}

# ── VALUE DECODERS ───────────────────────────────────────────────────────────
SEVERITY_MAP = {
    '1': 'Critical', '2': 'Major', '3': 'Minor',
    '4': 'Warning',  '5': 'Info',  '6': 'Clear',
}

ALARM_TYPE_MAP = {
    '1':  'ONU_ONLINE',
    '2':  'ONU_OFFLINE',
    '3':  'ONU_REGISTER',
    '4':  'ONU_DEREGISTER',
    '5':  'PON_UP',
    '6':  'LAN_DOWN',
    '7':  'LAN_UP',
    '8':  'PON_DOWN',
    '9':  'OPTICAL_ALARM',
    '10': 'POWER_ALARM',
    '11': 'TEMPERATURE_ALARM',
    '12': 'AUTH_FAIL',
    '13': 'CONFIG_CHANGE',
    '14': 'LOOP_DETECT',
    '15': 'ROGUE_ONU',
    '30': 'PON_DOWN',
    '31': 'PON_UP',
}

ALARM_STATUS_MAP = {
    '1': 'RAISED',
    '2': 'CLEARED',
    '3': 'CHANGED',
}

ADMIN_STATUS_MAP = {
    '1': 'UP',
    '2': 'DOWN',
    '3': 'TESTING',
}

OPER_STATUS_MAP = {
    '1': 'UP',
    '2': 'DOWN',
    '3': 'TESTING',
    '4': 'UNKNOWN',
    '5': 'DORMANT',
    '6': 'NOT_PRESENT',
    '7': 'LOWER_LAYER_DOWN',
}

# ── CORE FUNCTIONS ────────────────────────────────────────────────────────────

def lookup_oid(oid_str):
    """
    Translate OID to human-readable name.
    If exact match not found, tries prefix match then strips instance (.0 etc).
    Returns: (name, matched_oid) or (raw_oid, None) if unknown
    """
    oid = str(oid_str).lstrip('.')

    # 1. Exact match
    if oid in ALL_OIDS:
        return ALL_OIDS[oid], oid

    # 2. Remove trailing instance (.0, .1, .2 etc) and try again
    parts = oid.rsplit('.', 1)
    if len(parts) == 2:
        base = parts[0]
        if base in ALL_OIDS:
            return ALL_OIDS[base], base

    # 3. Prefix match — find the longest known prefix
    best_match = None
    best_len = 0
    for known_oid, name in ALL_OIDS.items():
        if oid.startswith(known_oid + '.') and len(known_oid) > best_len:
            best_match = name
            best_len = len(known_oid)

    if best_match:
        return best_match, None

    # 4. Unknown — return abbreviated OID
    parts = oid.split('.')
    if len(parts) > 6:
        return f"vsol.{'.'.join(parts[6:])}", None

    return oid, None


def bytes_to_mac(raw):
    """Convert raw bytes/string to MAC address format AA:BB:CC:DD:EE:FF"""
    try:
        if hasattr(raw, 'asOctets'):
            b = raw.asOctets()
        elif isinstance(raw, bytes):
            b = raw
        else:
            b = str(raw).encode('latin-1')

        if len(b) == 6:
            return ':'.join(f'{x:02X}' for x in b)
        if len(b) > 6:
            b = b[-6:]
            return ':'.join(f'{x:02X}' for x in b)
    except Exception:
        pass
    return None


def decode_value(oid_name, raw_value):
    """
    Decode a raw SNMP value to human-readable string
    based on the OID name context.
    """
    val = str(raw_value)

    if oid_name == 'oltMacAddress':
        mac = bytes_to_mac(raw_value)
        return mac if mac else val

    if oid_name == 'alarmSeverity':
        return SEVERITY_MAP.get(val, f'SEV_{val}')

    if oid_name == 'alarmType':
        label = ALARM_TYPE_MAP.get(val, f'TYPE_{val}')
        return f"{val} ({label})"

    if oid_name == 'alarmStatus':
        return ALARM_STATUS_MAP.get(val, val)

    if oid_name == 'ifAdminStatus':
        return ADMIN_STATUS_MAP.get(val, val)

    if oid_name == 'ifOperStatus':
        return OPER_STATUS_MAP.get(val, val)

    if oid_name == 'oltTimestamp' and len(val) == 14:
        return f"{val[0:4]}-{val[4:6]}-{val[6:8]} {val[8:10]}:{val[10:12]}:{val[12:14]}"

    if oid_name == 'sysUpTime':
        try:
            ticks = int(val)
            seconds = ticks // 100
            days = seconds // 86400
            hours = (seconds % 86400) // 3600
            mins = (seconds % 3600) // 60
            secs = seconds % 60
            if days > 0:
                return f"{days}d {hours:02d}:{mins:02d}:{secs:02d}"
            return f"{hours:02d}:{mins:02d}:{secs:02d}"
        except Exception:
            pass

    if oid_name in ('ifSpeed',):
        try:
            bps = int(val)
            if bps >= 1_000_000_000:
                return f"{bps // 1_000_000_000} Gbps"
            if bps >= 1_000_000:
                return f"{bps // 1_000_000} Mbps"
            if bps >= 1_000:
                return f"{bps // 1_000} Kbps"
        except Exception:
            pass

    return val


def translate_trap(varBinds):
    """
    Translate a full set of SNMP trap varbinds into a structured dict.

    Returns:
        dict: {
            'oid_name': {
                'oid': '1.3.6.1...',
                'name': 'humanName',
                'value': 'decoded value',
                'raw': <raw pysnmp object>
            }, ...
        }
    """
    result = {}
    for oid, val in varBinds:
        oid_str = str(oid).lstrip('.')
        name, _ = lookup_oid(oid_str)
        decoded = decode_value(name, val)
        result[name] = {
            'oid':   oid_str,
            'name':  name,
            'value': decoded,
            'raw':   val,
        }
    return result


def get_olt_mac(translated):
    """Extract OLT MAC from translated varbinds dict"""
    if 'oltMacAddress' in translated:
        return bytes_to_mac(translated['oltMacAddress']['raw'])
    return None


def mac_to_olt_id(mac):
    """Generate short OLT ID from MAC address"""
    if mac:
        parts = mac.split(':')
        if len(parts) == 6:
            return f"OLT-{parts[3]}{parts[4]}{parts[5]}"
    return None


def is_heartbeat(translated):
    """Return True if this trap is just a heartbeat (no alarm content)"""
    alarm_keys = {'alarmType', 'alarmName', 'alarmDescription',
                  'alarmSeverity', 'ponAlarmTrap'}
    return not any(k in translated for k in alarm_keys)


# ── SUMMARY ──────────────────────────────────────────────────────────────────
OID_COUNT = len(ALL_OIDS)

if __name__ == '__main__':
    print(f"Vsol MIB loaded: {OID_COUNT} OIDs")
    print("\nTest OID lookup:")
    tests = [
        '1.3.6.1.4.1.37950.1.1.5.10.13.2.7.0',
        '1.3.6.1.4.1.37950.1.1.5.10.13.2.10.0',
        '1.3.6.1.4.1.37950.1.1.6.1.1.17.1.3',
        '1.3.6.1.6.3.1.1.5.1',
        '1.3.6.1.2.1.1.3.0',
    ]
    for oid in tests:
        name, _ = lookup_oid(oid)
        print(f"  {oid} -> {name}")
