"""
SNOC v0.5.5.1 - Central Configuration
Edit this file to change ports and paths.
All scripts read from this file - restart SNOC after any change.
"""
import os

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None


def get_db_connection(db_path_or_name=None):
    """Return a PostgreSQL connection to the central SimpleNOC database."""
    if not psycopg2:
        print("PostgreSQL driver not installed. Please install psycopg2-binary.")
        return None

    cfg = globals().get("POSTGRES_CONFIG", {})
    try:
        return psycopg2.connect(
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 5432),
            user=cfg.get("user", "postgres"),
            password=cfg.get("password", ""),
            dbname=cfg.get("dbname", "simplenoc"),
            connect_timeout=5,
        )
    except Exception as e:
        print(f"PostgreSQL connection error: {e}")
        return None


def query_db(db, sql, params=()):
    conn = get_db_connection(db)
    if not conn:
        return []
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql.replace("?", "%s"), params)
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return rows
    except Exception as e:
        print(f"Database query error: {e}\nSQL: {sql}")
        return []
    finally:
        conn.close()


def execute_db(db, sql, params=()):
    conn = get_db_connection(db)
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute(sql.replace("?", "%s"), params)
        cur.close()
        conn.commit()
        return True
    except Exception as e:
        print(f"Database execution error: {e}\nSQL: {sql}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DASHBOARD = BASE_DIR

TRAP_DB = os.path.join(DATA_DIR, "traps.db")
SYSLOG_DB = os.path.join(DATA_DIR, "syslog.db")
PING_DB = os.path.join(DATA_DIR, "ping.db")
AUTH_DB = os.path.join(DATA_DIR, "auth.db")
TFTP_DB = os.path.join(DATA_DIR, "tftp.db")
OLT_DB = os.path.join(DATA_DIR, "olt.db")
BACKUP_DIR = os.path.join(BASE_DIR, "backups")

API_PORT = 5000
HTTPS_PORT = 5443
HTTP_REDIRECT = False

SSL_CERT = ""
SSL_KEY = ""

SNMP_PORT = 162
SYSLOG_PORT = 5141
TFTP_PORT = 69

# SimpleNOC now runs only on PostgreSQL.
DB_TYPE = "postgres"

POSTGRES_CONFIG = {
    "host": os.getenv("SIMPLENOC_PGHOST", "localhost"),
    "port": int(os.getenv("SIMPLENOC_PGPORT", "5432")),
    "user": os.getenv("SIMPLENOC_PGUSER", "adminsql"),
    "password": os.getenv("SIMPLENOC_PGPASSWORD", "adminsql"),
    "dbname": os.getenv("SIMPLENOC_PGDBNAME", "simplenoc"),
}

OFFLINE_AFTER_SECS = 120
PING_INTERVAL_SECS = 10

# Retention limits in days for each PostgreSQL-backed module (defaults).
# Admins can override these from the dashboard Settings menu (stored in noc_settings).
TRAP_RETENTION_DAYS = 30
SYSLOG_RETENTION_DAYS = 7
PING_RETENTION_DAYS = 15
TFTP_RETENTION_DAYS = 90
ALERT_LOG_RETENTION_DAYS = 30
OLT_DATA_RETENTION_DAYS = 30
OLT_SESSION_RETENTION_DAYS = 30

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)
