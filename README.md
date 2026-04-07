# SimpleNOC v0.5.5.2

SimpleNOC is a Windows-first network operations application for ISP and OLT environments. It combines a web dashboard, PostgreSQL-backed monitoring data, trap/syslog/TFTP collectors, OLT polling, ping monitoring, alerts, user management, and operational tools in one package.

This repository contains the full desktop/server application used by SNOC v0.5.5.2.

## What the App Does

SimpleNOC is built around one main dashboard and several background services:

- A Flask-based HTTPS dashboard and API
- SNMP trap collection
- Syslog ingestion and device/event tracking
- TFTP backup intake
- Ping monitoring with online/offline state tracking
- Alerting through email and Telegram
- OLT profile management and ONU/uplink polling
- User login, role-based access, and tab-level permissions

## Major Modules

- `api.py`
  Main Flask server, authentication, settings APIs, ping engine, dashboard endpoints, backup/restore, OLT APIs, and retention helpers.

- `dashboard.html`
  Single-page web UI for Syslog, SNMP, TFTP, Ping Monitor, Alerts, OLT Connect, Uplink Traffic, Logs, ONT lookup, and Users.

- `login.html`
  Login page for authenticated dashboard access.

- `alert_engine.py`
  Alert rule storage, matching, email sending, Telegram sending, template rendering, and alert logging.

- `launcher.pyw`
  Windows launcher GUI that starts all runtime services together.

- `trap_receiver.py`
  SNMP trap receiver and trap/event ingestion.

- `syslog_server.py`
  Syslog receiver and syslog device/event processing.

- `tftp_server.py`
  TFTP receive server used for OLT backup/config uploads.

- `olt_connector.py`
  OLT connection logic, SSH/Telnet polling, ONU parsing, uplink collection, and OLT database initialization.

- `noc_config.py`
  Central configuration for ports, paths, PostgreSQL, SSL, and retention defaults.

- `setup.py`
  Installer/uninstaller flow for Windows deployment.

- `setup_postgres.bat`
  PostgreSQL bootstrap helper.

- `init_postgres.sql`
  Database/user initialization SQL for PostgreSQL.

## Core Features

### Dashboard and Access

- Login-protected dashboard
- Admin and read-only user roles
- Per-user visible tab permissions
- Global tab enable/disable controls from Settings
- Password change flow
- Backup and restore of operational configuration

### Monitoring and Collection

- SNMP trap receiver
- Syslog receiver with event summaries
- Ping monitor with online/offline/high-latency view
- TFTP backup receiver with file inventory
- Log viewer for local service logs
- ONT history lookup by serial number

### OLT and ONU Operations

- OLT connection profiles
- SSH/Telnet polling support
- ONU inventory/history storage
- Uplink statistics collection
- Scheduled OLT polling jobs
- ONT history charting

### Alerts

- SMTP email alerts
- Telegram alerts
- Alert templates
- Syslog-based alert rules
- Ping monitor offline alerts
- Host match and excluded-host filters in rules

### Settings and Runtime Control

- Retention visibility and cleanup settings
- Configurable server ports
- Session timeout control
- HTTPS support with generated certificate files

## Current v0.5.5.2 Highlights

This version includes:

- User creation and editing with role selection
- Per-user tab permissions
- Global tab visibility controls
- Read-only-safe Ping Monitor behavior
- Ping offline alert rules
- Alert host exclusion support
- Logs tab
- ONT lookup tab
- Telegram alert support
- Session timeout setting

See [CHANGELOG.md](CHANGELOG.md) for release details.

## Runtime Architecture

Typical runtime flow:

1. `launcher.pyw` starts the application stack.
2. `api.py` serves the dashboard/API and runs supporting background workers.
3. `trap_receiver.py`, `syslog_server.py`, and `tftp_server.py` collect network data.
4. `olt_connector.py` is used by dashboard/API flows to poll OLTs and store ONU/uplink data.
5. `alert_engine.py` evaluates rules and sends notifications.
6. PostgreSQL stores users, events, alert rules/logs, ping status/history, OLT data, and TFTP metadata.

## Technology Stack

- Python 3
- Flask
- Flask-CORS
- PostgreSQL
- Paramiko
- PySNMP
- HTML/CSS/JavaScript dashboard
- Tkinter launcher

## Supported Environment

- Windows 10 / 11
- Windows Server deployments
- PostgreSQL 12+
- Python 3.10+

Administrator rights are typically required for installation and for binding to privileged ports like `69/udp` and `162/udp`.

## Default Services and Ports

Defaults come from [`noc_config.py`](noc_config.py):

- Dashboard HTTP: `5000`
- Dashboard HTTPS: `5443`
- SNMP trap listener: `162/udp`
- Syslog listener: `5141/udp`
- TFTP listener: `69/udp`
- PostgreSQL: `5432`

The dashboard can update listener ports from Settings, and a restart is required after changing them.

## Database

SimpleNOC v0.5.5.2 is PostgreSQL-based.

Default app DB values:

- Database: `simplenoc`
- User: `adminsql`
- Password: `adminsql`
- Host: `localhost`
- Port: `5432`

Supported environment variable overrides:

- `SIMPLENOC_PGHOST`
- `SIMPLENOC_PGPORT`
- `SIMPLENOC_PGUSER`
- `SIMPLENOC_PGPASSWORD`
- `SIMPLENOC_PGDBNAME`

## Install and Run

### Option 1: Windows menu flow

Use the bundled menu:

```bat
run.bat
```

Recommended order:

1. `Install or Update SimpleNOC`
2. `Setup PostgreSQL Database`
3. Start the app with the launcher or installed scripts

### Option 2: Run from source

Install dependencies:

```powershell
python -m pip install flask flask-cors pysnmp paramiko psycopg2-binary cryptography
```

Initialize PostgreSQL:

```bat
setup_postgres.bat
```

Start the full stack:

```powershell
python launcher.pyw
```

Start only dashboard/API:

```powershell
python api.py
```

## Repository Layout

```text
SimpleNOC/
├── api.py
├── alert_engine.py
├── dashboard.html
├── login.html
├── launcher.pyw
├── noc_config.py
├── olt_connector.py
├── setup.py
├── setup_postgres.bat
├── init_postgres.sql
├── trap_receiver.py
├── syslog_server.py
├── tftp_server.py
├── CHANGELOG.md
└── data/ logs/ backups/
```

## Security and Permissions Model

- Admin users can manage settings, users, alert rules, ping targets, backup/restore, and OLT profiles/jobs.
- Read-only users can view assigned tabs and operational data.
- Tab access is controlled at two levels:
  - global enabled tabs
  - per-user visible tabs

## Known Scope of This Release

This release is focused on Windows-based operations with a local launcher and PostgreSQL backend. It is best suited for small NOC environments, OLT monitoring, backup intake, and internal operations teams.

## Upcoming Updates

Planned next-step items:

- Android app to display ONT details
- Limit users to specific OLT profiles so they cannot view ONU information from other OLTs

## Notes for GitHub

- Some installer/runtime scripts are Windows-specific by design.
- The dashboard is a single-file HTML/JS UI rather than a separate frontend framework project.
- The project currently favors operational simplicity over deep service separation.

## License / Project Status

This repository currently reflects an active in-house operational application build, versioned as SNOC v0.5.5.2.

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

User management notes:

- The `viewer` role is shown as `read-only` in the dashboard UI.
- Admins can assign visible tabs per user when creating or editing accounts.
- Per-user tab permissions are stored in the authentication database and applied after login.

## Configuration

The main configuration file is [noc_config.py](/E:/codex/SimpleNOCv0.5.5/noc_config.py).

Key settings include:

- HTTP and HTTPS ports
- SNMP, syslog, and TFTP ports
- PostgreSQL connection details
- retention periods
- SSL certificate paths
- The Settings modal also includes configurable server ports, storage retention, session timeout, and visible-tab controls.

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
