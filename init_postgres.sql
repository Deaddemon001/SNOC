-- SimpleNOC v0.5.5.1 - PostgreSQL Initialization Script
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

\echo 'PostgreSQL Initialization Complete for SimpleNOC!'
