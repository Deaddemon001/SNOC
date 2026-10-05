-- Smart NOC v0.6.0 - PostgreSQL Initialization Script
-- Usage: psql -U postgres -f init_postgres.sql

-- 1. Create the database
SELECT 'CREATE DATABASE simplenoc'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'simplenoc')\gexec

-- 2. Create the user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'adminsql') THEN
        CREATE USER adminsql WITH PASSWORD 'adminsql';
    ELSE
        ALTER USER adminsql WITH PASSWORD 'adminsql';
    END IF;
END
$$;

-- 3. Grant privileges
GRANT ALL PRIVILEGES ON DATABASE simplenoc TO adminsql;

-- 4. Connect to the database and grant schema privileges
\c simplenoc
GRANT ALL ON SCHEMA public TO adminsql;
GRANT ALL ON SCHEMA public TO public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO adminsql;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO adminsql;

\echo 'PostgreSQL Initialization Complete for Smart NOC!'

-- 5. ONU configuration lookup table (PPPoE / landline search)
\c simplenoc
CREATE TABLE IF NOT EXISTS onu_configs (
    id              SERIAL PRIMARY KEY,
    olt_id          TEXT NOT NULL,
    onu_id          TEXT NOT NULL,
    pon_port        TEXT DEFAULT '',
    serial_number   TEXT DEFAULT '',
    description     TEXT DEFAULT '',
    pppoe_id        TEXT DEFAULT '',
    landline        TEXT DEFAULT '',
    wan_vlan        TEXT DEFAULT '',
    line_profile    TEXT DEFAULT '',
    srv_profile     TEXT DEFAULT '',
    raw_config      TEXT DEFAULT '',
    polled_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (olt_id, onu_id)
);

CREATE INDEX IF NOT EXISTS idx_onu_configs_pppoe    ON onu_configs (pppoe_id);
CREATE INDEX IF NOT EXISTS idx_onu_configs_landline ON onu_configs (landline);
CREATE INDEX IF NOT EXISTS idx_onu_configs_serial   ON onu_configs (serial_number);
CREATE INDEX IF NOT EXISTS idx_onu_configs_olt      ON onu_configs (olt_id);

\echo 'onu_configs table ready.'
