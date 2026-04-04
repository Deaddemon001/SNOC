# SimpleNOC v0.5.5.1

**v0.5.5.1** is a focused on **dashboard UI and appearance** (theme contrast, Settings for database retention, Refresh behavior, uplink card readability). Core behavior matches **v0.5.5** unless noted in [CHANGELOG.md](CHANGELOG.md).

SimpleNOC is a Windows-focused Network Operations Center application for small ISP and OLT operations. It provides a web dashboard, SNMP trap collection, syslog collection, TFTP backup intake, OLT polling, ping monitoring, and alerting on top of a PostgreSQL backend.

## Features

- Web dashboard with login and role-based admin actions
- SNMP trap receiver
- Syslog server with device state tracking
- TFTP backup receiver
- Ping monitor
- Alert rules with SMTP email delivery
- OLT Connect for SSH/Telnet access profiles
- ONU and uplink polling for supported VSOL OLT models
- HTTPS dashboard with auto-generated self-signed certificate

## Repository Layout

- `api.py` - main Flask API and dashboard server
- `dashboard.html` - main web UI
- `login.html` - login page
- `launcher.pyw` - GUI launcher that starts all app services
- `trap_receiver.py` - SNMP trap service
- `syslog_server.py` - syslog service
- `tftp_server.py` - TFTP backup receiver
- `olt_connector.py` - OLT login, polling, parsers, and OLT DB init
- `alert_engine.py` - SMTP config, alert rules, and alert log
- `noc_config.py` - central application configuration
- `setup.py` - installer/uninstaller
- `run.bat` - setup and maintenance menu
- `setup_postgres.bat` - PostgreSQL bootstrap helper
- `init_postgres.sql` - PostgreSQL DB and user creation script

## Platform Support

This version is built for Windows.

Recommended environments:

- Windows 10 or Windows 11
- Windows Server 2019 or newer
- Administrator access during install and when binding privileged ports

## Prerequisites

Install these before first setup:

- Python 3.10 or newer
- PostgreSQL 12 or newer
- Network access for monitored devices
- Local firewall access for dashboard and listener ports

Recommended Python installation options:

- Enable `Add Python to PATH`
- Enable `Install for all users`

Recommended PostgreSQL installation options:

- Install PostgreSQL Server
- Install `psql` command-line tools
- Keep the PostgreSQL service running
- Note the PostgreSQL superuser account and password

## Python Dependencies

The application installer currently installs these packages automatically:

- `flask`
- `flask-cors`
- `pysnmp`
- `paramiko`
- `psycopg2-binary`

For HTTPS certificate generation, install this package as well:

- `cryptography`

If you are running from source, install everything manually:

```powershell
python -m pip install flask flask-cors pysnmp paramiko psycopg2-binary cryptography
```

## Default Ports

Configured in [noc_config.py](/E:/codex/SimpleNOCv0.5.5/noc_config.py):

- `5000` - HTTP listener
- `5443` - HTTPS dashboard
- `162/udp` - SNMP trap receiver
- `5141/udp` - syslog server
- `69/udp` - TFTP server
- `5432` - PostgreSQL

Notes:

- Ports `69` and `162` usually require Administrator privileges on Windows.
- When HTTPS is enabled, HTTP redirects to HTTPS.
- If certificate generation fails, the API disables HTTPS and falls back to HTTP-only behavior.

## Database Model

SimpleNOC v0.5.5.1 is configured for PostgreSQL only.

Default application database settings from [noc_config.py](/E:/codex/SimpleNOCv0.5.5/noc_config.py):

- Database name: `simplenoc`
- App DB user: `adminsql`
- App DB password: `adminsql`
- Host: `localhost`
- Port: `5432`

These can also be overridden with environment variables:

- `SIMPLENOC_PGHOST`
- `SIMPLENOC_PGPORT`
- `SIMPLENOC_PGUSER`
- `SIMPLENOC_PGPASSWORD`
- `SIMPLENOC_PGDBNAME`

## Installation Options

There are two practical ways to install this project.

### Option 1: Install Using the Included Windows Menu

This is the recommended path for most users.

1. Clone or copy this repository to a local Windows machine.
2. Open an elevated Command Prompt or PowerShell window.
3. Run:

```bat
run.bat
```

4. Choose `1. Install or Update SimpleNOC`.
5. After install completes, return to the menu and choose `2. Setup PostgreSQL Database`.

What this does:

- installs Python dependencies
- creates `C:\SimpleNOC`
- copies app files into `C:\SimpleNOC`
- creates logs and control scripts
- attempts to install Windows Services if `nssm` is available
- otherwise uses `launcher.pyw` as the main runtime entrypoint

### Option 2: Run From Source

Use this if you are developing, testing, or preparing the repository for GitHub.

1. Clone the repository:

```powershell
git clone <your-repo-url>
cd SimpleNOCv0.5.5
```

2. Open a terminal in the project root.
3. Install Python dependencies:

```powershell
python -m pip install flask flask-cors pysnmp paramiko psycopg2-binary cryptography
```

4. Set up PostgreSQL using the bundled script:

```bat
setup_postgres.bat
```

5. Start the full app:

```powershell
python launcher.pyw
```

Alternative source startup:

```powershell
python api.py
```

`python api.py` starts only the dashboard/API process. It does not start SNMP, syslog, or TFTP collectors.

## PostgreSQL Setup

The bundled PostgreSQL helper script:

```bat
setup_postgres.bat
```

This script:

- locates `psql.exe`
- prompts for the PostgreSQL superuser name
- runs [init_postgres.sql](/E:/codex/SimpleNOCv0.5.5/init_postgres.sql)
- creates the `simplenoc` database if it does not exist
- creates or resets the `adminsql` DB user password
- grants privileges on the `public` schema

If `psql` is not in PATH, the script will also search common install paths such as:

- `C:\Program Files\PostgreSQL\18\bin`
- `C:\Program Files\PostgreSQL\17\bin`
- `C:\Program Files\PostgreSQL\16\bin`
- `C:\Program Files\PostgreSQL\15\bin`
- `C:\Program Files\PostgreSQL\14\bin`

If PostgreSQL is installed elsewhere, enter the `bin` path manually when prompted.

## Installed Location

The installer copies the application to:

```text
C:\SimpleNOC
```

Important installed files:

- `C:\SimpleNOC\run.bat`
- `C:\SimpleNOC\launcher.pyw`
- `C:\SimpleNOC\START_NOC.bat`
- `C:\SimpleNOC\STOP_NOC.bat`
- `C:\SimpleNOC\STATUS_NOC.bat`
- `C:\SimpleNOC\noc_config.py`
- `C:\SimpleNOC\logs\`
- `C:\SimpleNOC\data\`
- `C:\SimpleNOC\backups\`

## Starting the Application

Recommended:

```powershell
python launcher.pyw
```

or after installation:

```bat
C:\SimpleNOC\launcher.pyw
```

`launcher.pyw` starts:

- SNMP Trap Receiver
- Syslog Server
- TFTP Server
- API and Dashboard

Other startup helpers:

- `START_NOC.bat` starts SNMP, syslog, and API in background console windows
- `STOP_NOC.bat` stops the console-window processes
- `STATUS_NOC.bat` shows a basic status message

Important note:

- `launcher.pyw` is the more complete runtime entrypoint because it starts the TFTP server too.

## Accessing the Dashboard

Default dashboard URL:

- [https://localhost:5443](https://localhost:5443)

If HTTPS certificate generation fails, check logs and try:

- [http://localhost:5000](http://localhost:5000)

On first HTTPS access, the browser may warn about the self-signed certificate. This is expected unless you replace it with a trusted cert.

## Default Login

If no users exist, the application creates this default user automatically:

- Username: `admin`
- Password: `admin123`

Change the password after first login.

## Configuration

The main configuration file is [noc_config.py](/E:/codex/SimpleNOCv0.5.5/noc_config.py).

Key settings include:

- HTTP and HTTPS ports
- SNMP, syslog, and TFTP ports
- PostgreSQL connection details
- retention periods
- SSL certificate paths

The API also auto-generates a self-signed certificate under:

```text
data\ssl\cert.pem
data\ssl\key.pem
```

You can replace these with your own certificate and key by setting `SSL_CERT` and `SSL_KEY` in `noc_config.py`.

## OLT Connection Profiles

In the `OLT Connect` section:

- OLT profiles store login credentials, OLT model, connection mode, and uplink port definitions.
- Supported connection modes are `auto`, `ssh`, and `telnet`.
- The same OLT IP can be added more than once if the ports differ.
- OLT profile uniqueness is based on `IP address + SSH port + Telnet port`.
- Exact duplicates of the same `IP + SSH port + Telnet port` are rejected.

This behavior is enforced in both the API and the database schema.

## Services and Runtime Behavior

Main runtime components:

- `api.py` - dashboard, API, authentication, polling routes, reports, and HTTPS
- `trap_receiver.py` - UDP listener for SNMP traps
- `syslog_server.py` - UDP syslog listener and state tracker
- `tftp_server.py` - receives TFTP backup uploads
- `alert_engine.py` - stores alert rules and email settings

The launcher writes service logs into the `logs` directory.

Typical log files:

- `logs\API_and_Dashboard.log`
- `logs\SNMP_Trap_Receiver.log`
- `logs\Syslog_Server.log`
- `logs\TFTP_Server.log`

The batch startup scripts also write logs such as:

- `logs\api.log`
- `logs\snmp.log`
- `logs\syslog.log`

## Data Storage

Application data is kept under the working directory or installed directory:

- `data\` - app data, SSL files, and local storage paths
- `backups\` - backup exports and retained files
- `logs\` - runtime logs

Although some variable names still reference legacy `.db` file paths, the active database engine in this version is PostgreSQL.

## Uninstall

Using the menu:

```bat
run.bat
```

Then choose:

- `3. Uninstall SimpleNOC`

The uninstaller:

- stops and removes SimpleNOC services if present
- removes scheduled tasks
- stops running SimpleNOC processes
- removes shortcuts
- optionally preserves `data`, `backups`, and `logs`
- schedules removal of `C:\SimpleNOC`

## Troubleshooting

### Installer cannot find Python

- Install Python from [python.org](https://www.python.org/downloads/)
- enable `Add Python to PATH`
- avoid the Windows Store stub-only install

### PostgreSQL setup fails

- confirm PostgreSQL Server is installed and running
- confirm `psql.exe` exists
- verify the PostgreSQL superuser password
- verify port `5432` is reachable locally

### HTTPS does not start

- install `cryptography`
- check whether `data\ssl\cert.pem` and `data\ssl\key.pem` can be created
- verify port `5443` is free
- inspect the API log for `[SSL]` errors

### SNMP, syslog, or TFTP listeners do not bind

- run as Administrator
- verify ports `162`, `5141`, and `69` are not already in use
- allow inbound rules in Windows Firewall

### Dashboard loads but collectors are not running

- start the app with `launcher.pyw` instead of `api.py`
- if using installed scripts, prefer `launcher.pyw` over `START_NOC.bat` when you need TFTP too

## Git Upload Notes

Before pushing this repository to GitHub or another remote:

- make sure secrets are not hardcoded for production use
- review default PostgreSQL credentials in `noc_config.py`
- review the default `admin/admin123` login behavior
- decide whether to commit generated logs, backups, or runtime data
- add a `.gitignore` if you do not want `logs/`, `data/ssl/`, or generated files tracked

Suggested exclusions for Git:

```gitignore
logs/
data/ssl/
__pycache__/
*.pyc
```

## Summary

For a clean Windows install:

1. Install Python 3.10+ and PostgreSQL.
2. Run `run.bat` as Administrator.
3. Choose `Install or Update SimpleNOC`.
4. Choose `Setup PostgreSQL Database`.
5. Start the app with `launcher.pyw`.
6. Open `https://localhost:5443`.
7. Log in with `admin / admin123` and change the password.
