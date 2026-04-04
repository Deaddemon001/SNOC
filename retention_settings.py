"""
Effective retention days: noc_config defaults overridden by noc_settings in PostgreSQL.
Used by api retention worker, syslog_server prune, and dashboard Settings.
"""
import datetime

import noc_config as _cfg
from noc_config import query_db, execute_db

RETENTION_KEYS = (
    "trap_retention_days",
    "syslog_retention_days",
    "ping_retention_days",
    "tftp_retention_days",
    "alert_log_retention_days",
    "olt_data_retention_days",
    "olt_session_retention_days",
)

_MAX_DAYS = 3650


def _defaults_map():
    return {
        "trap_retention_days": int(getattr(_cfg, "TRAP_RETENTION_DAYS", 30)),
        "syslog_retention_days": int(getattr(_cfg, "SYSLOG_RETENTION_DAYS", 7)),
        "ping_retention_days": int(getattr(_cfg, "PING_RETENTION_DAYS", 15)),
        "tftp_retention_days": int(getattr(_cfg, "TFTP_RETENTION_DAYS", 90)),
        "alert_log_retention_days": int(getattr(_cfg, "ALERT_LOG_RETENTION_DAYS", 30)),
        "olt_data_retention_days": int(getattr(_cfg, "OLT_DATA_RETENTION_DAYS", 30)),
        "olt_session_retention_days": int(getattr(_cfg, "OLT_SESSION_RETENTION_DAYS", 30)),
    }


def ensure_noc_settings_table(db_token):
    execute_db(
        db_token,
        """CREATE TABLE IF NOT EXISTS noc_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT
    )""",
    )


def _clamp_days(n):
    try:
        v = int(n)
    except (TypeError, ValueError):
        return None
    if v < 0:
        return 0
    if v > _MAX_DAYS:
        return _MAX_DAYS
    return v


def get_retention_days_map(db_token):
    defaults = _defaults_map()
    placeholders = ",".join(["?"] * len(RETENTION_KEYS))
    rows = query_db(
        db_token,
        f"SELECT key, value FROM noc_settings WHERE key IN ({placeholders})",
        tuple(RETENTION_KEYS),
    )
    overrides = {r["key"]: r["value"] for r in rows}
    out = {}
    for k in RETENTION_KEYS:
        d = defaults[k]
        if k in overrides:
            c = _clamp_days(overrides[k])
            out[k] = c if c is not None else max(0, int(d))
        else:
            out[k] = max(0, int(d))
    return out


def get_retention_policies(db_token):
    m = get_retention_days_map(db_token)
    trap = m["trap_retention_days"]
    syslog = m["syslog_retention_days"]
    ping = m["ping_retention_days"]
    tftp = m["tftp_retention_days"]
    alert = m["alert_log_retention_days"]
    olt_data = m["olt_data_retention_days"]
    olt_sess = m["olt_session_retention_days"]
    return [
        ("traps", "timestamp", trap),
        ("events", "timestamp", trap),
        ("syslog", "timestamp", syslog),
        ("ping_results", "timestamp", ping),
        ("tftp_files", "timestamp", tftp),
        ("alert_log", "timestamp", alert),
        ("onu_data", "poll_time", olt_data),
        ("onu_history", "poll_time", olt_data),
        ("uplink_stats", "poll_time", olt_data),
        ("olt_poll_sessions", "poll_time", olt_sess),
    ]


def save_retention_settings(db_token, payload):
    """
    Upsert retention keys from a dict. Only keys in RETENTION_KEYS are written.
    Returns (True, None) or (False, error_message).
    """
    if not isinstance(payload, dict):
        return False, "Invalid JSON body"
    now = datetime.datetime.now().isoformat()
    for k in RETENTION_KEYS:
        if k not in payload:
            continue
        c = _clamp_days(payload[k])
        if c is None:
            return False, f"Invalid value for {k}"
        ok = execute_db(
            db_token,
            """INSERT INTO noc_settings (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at""",
            (k, str(c), now),
        )
        if not ok:
            return False, f"Failed to save {k}"
    return True, None
