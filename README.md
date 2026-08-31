# Smart NOC v0.6.0

Smart NOC is a Windows-first network operations application for ISP and OLT environments. It combines a web dashboard, PostgreSQL-backed monitoring data, trap/syslog/TFTP collectors, OLT polling, ping monitoring, alerts, user management, and operational tools in one package.

This repository contains the full desktop/server application used by SNOC v0.6.0

## What the App Does

Smart NOC is built around one main dashboard and several background services:

- A Flask-based HTTPS dashboard and API
- SNMP trap collection
- Syslog ingestion and device/event tracking
- TFTP backup intake
- Ping monitoring with online/offline state tracking
- Alerting through email, Telegram, and Discord
- OLT profile management and ONU/uplink polling
- User login, role-based access, and tab-level permissions

## Major Modules

- `frontend/`
  Modern Single-Page Application (SPA) built with React 19, TypeScript, Tailwind CSS 3.4, Lucide icons, and Watermelon UI design system ([ui.watermelon.sh](https://ui.watermelon.sh)). Features dark studio glassmorphism, responsive sidebar layout, and Chart.js 4 telemetry graphs.

- `api.py`
  Main Flask server, authentication, settings APIs, ping engine, dashboard endpoints, backup/restore, OLT APIs, retention helpers, and static bundle delivery (`frontend/dist/`).

- `dashboard.html` / `legacy_dashboard_js.js`
  Classic legacy single-file dashboard interface, accessible anytime via `/?legacy=1` for fallback and validation.

- `login.html`
  Legacy authentication view fallback.

- `alert_engine.py`
  Alert rule storage, matching, email sending, Telegram sending, Discord webhooks, template rendering, and alert logging.

- `launcher.pyw`
  Windows launcher GUI that starts all runtime services together.

- `trap_receiver.py`
  SNMP trap receiver (UDP 162) and trap/event ingestion.

- `syslog_server.py`
  Syslog receiver (UDP 5141) and syslog device/event processing.

- `tftp_server.py`
  TFTP receive server (UDP 69) used for OLT backup/config uploads.

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

### Modern Watermelon UI & System Health Dashboard

- **Watermelon UI Studio Aesthetics**: Dark studio surface (`#030712` / `slate-950`), translucent cards with subtle borders (`#1e293b` / `slate-800`), glassmorphism backdrop blur, and glowing neon accents.
- **Diagnostic Health Engine**: Automated diagnostic banner evaluating database connectivity, process liveness, port changes, and 24/7 uptime milestones with 1-click remediation.
- **Precision Megabyte & Kbps Telemetry**:
  - **5-Way Storage Distribution Doughnut**: PostgreSQL Database, TFTP Backups, Data directory, Logs, and Free Disk Space in exact Megabytes (MB).
  - **3-Way Memory Allocation Doughnut**: Smart NOC App RSS, Other Processes, and Free System Memory in exact Megabytes (MB).
  - **Network Throughput Rate**: Measured and visualized in Kilobits per second (Kbps) across charts and KPI cards.
- **Background Services Matrix**: Real-time status badges, PIDs, memory usage, CPU load, uptime, heartbeats, and per-service restart triggers for API, SNMP, Syslog, TFTP, and PostgreSQL.

### 24x7 Power Controls & Application Lifecycle

- In-app **Restart Smart NOC** and **Shutdown Smart NOC** from Dashboard and Settings
- Individual background daemon restarts (SNMP, Syslog, TFTP, API)
- 6-second auto-reconnection countdown with health polling during restarts
- Admin-gated lifecycle management without requiring host terminal access

### Syslog Device Access Control & Live Monitoring

- **Real-Time Status Engine**: Live device status calculation (<60s Receiving, 1–5m Standby, >5m Offline).
- **Access Authorization**: Devices default to pending; admin controls to **Accept**, **Deny**, **Delete**, and inline **Rename** devices.
- Filter dropdown dynamically filters only authorized devices to prevent log flooding.

### Access & User Management

- Login-protected dashboard with session timeout control
- Admin and read-only user roles
- Admin accounts retain unconditional access to all 11 product tabs
- Per-user visible tab permissions for non-admin viewers
- Global tab enable/disable controls from Settings
- Password change flow
- Encrypted backup and restore of operational configuration (AES-256-GCM)

### Monitoring and Collection

- SNMP trap receiver (UDP 162)
- Syslog receiver with event summaries (UDP 5141)
- Ping monitor with online/offline/high-latency view and latency history curves
- TFTP backup receiver with MAC mapping for NAT gateways
- Log viewer for local service logs with tail and search
- ONT history lookup by serial number with optical distance formatting (m/km) and Rx power curves


### OLT and ONU Operations

- OLT connection profiles with SSH and Telnet auto-failover
- Live interactive ONU inventory polling with real-time stage progress and animated spinners
- Automatic background polling scheduler (`olt_job_scheduler` daemon) supporting configurable recurring intervals (5 to 240 min) and one-time execution
- Multi-threaded hardware polling with per-job fault isolation
- ONU inventory history, optical Rx/Tx dBm diagnostics, distance (meters), and state breakdown (Online, Offline, Dying Gasp)
- Interface uplink bandwidth statistics collection and charting
- Historical ONT lookup by serial number with CSV export capabilities

### Alerts

- **Direct Multi-Channel Alert Dispatch**: Syslog and ping monitoring alerts are evaluated and dispatched unconditionally to all configured and rule-selected channels (**Discord Webhooks**, **SMTP Email**, and **Telegram**) without user binding lookup bottlenecks.
- **Color-Coded Visual Status Indicators**: Alerts sent across Discord, Telegram, and Email feature instant status indicators for fast visual understanding:
  - 🔴 **Red Indication**: Sent for **DOWN / OFFLINE / CRITICAL** incidents (loss-of-signal, link down, host unreachable, PON port down) with red dots, red badges, and `#dc3545` Discord sidebar embeds.
  - 🟢 **Green Indication**: Sent for **UP / ONLINE / RESTORED** incidents (service recovery, host reachable, link restored, PON port up) with green dots, green badges, and `#28a745` Discord sidebar embeds.
  - 🟡 **Yellow Indication**: Sent for **WARNING / DEGRADED** states (latency spikes, configuration changes).
- **Discord Rich Embeds & Webhooks**: Structured Discord embeds with color-coded sidebars (Red for DOWN, Green for UP), formatted parameter fields, and timestamp footers.
- **Multipart HTML Email Alerts**: Responsive HTML email templates with prominent color-coded status badges, structured details tables, and message highlight boxes alongside plain-text fallbacks.
- **Telegram Alerts**: Formatted Telegram notifications with bold headers and unicode visual status dots (🔴 for DOWN, 🟢 for UP).
- **Word-Boundary Regex Matching & Compound Tag Handling**: Accurately differentiates UP and DOWN events even when compound phrases like `Updown` or `Port_Updown` appear in OLT syslog headers.
- **Alert Rules Engine**: Syslog-based alert rules, ping offline alert rules, host matching, and excluded-host filters.

### Settings and Runtime Control

- Retention visibility and cleanup settings
- Configurable server ports
- Session timeout control
- HTTPS support with generated certificate files

## Current v0.6.0 Highlights

This version includes:

- **React 19 + TypeScript + Watermelon UI Frontend**: High-performance single page application with modern glassmorphism aesthetic, responsive collapsible sidebar, role badges, and seamless route transitions.
- **Comprehensive Light & Dark Theme Engine**: System-wide theme switcher with full class-based CSS token overrides for high-contrast visibility.
- **Direct Live ONU Snapshot & Telemetry Viewer**: Real-time querying of PostgreSQL ONU database snapshots with optical signal telemetry (Rx Power dBm), distance calculation, and search/filter.
- **OLT Automatic Polling Scheduler Daemon**: Reliable background daemon worker executing recurring polls (5–240 min) with past-date self-correction on job resume and per-job fault isolation.
- **Interactive OLT Polling Progress**: Live animated spinners and elapsed counters across both React SPA and legacy web interfaces during OLT ONU/uplink polls.
- **Direct Multi-Channel Alert Engine**: Global direct delivery to Discord, Email, and Telegram for all matched Syslog rules and Ping state transitions with full cross-platform encoding compatibility.
- **System Health Dashboard**: Dedicated primary monitoring dashboard tab with live PC resource graphs (CPU, RAM, Disk, Network) and 24/7 uptime tracking.
- **Diagnostic Engine**: "Does it need a restart?" automated health analyzer with 1-click remediation actions.
- **24/7 Power Controls**: In-app restart and shutdown capabilities in Dashboard and Settings with automated reconnection timers.
- **Visual Alert Color Indications**: Instant visual indicators across Discord, Telegram, and Email (🔴 Red for DOWN / 🟢 Green for UP / 🟡 Yellow for Warning) with Discord rich embeds and multipart HTML email templates.
- **Word-Boundary Regex Status Detection**: Whole-word regex parsing and compound tag stripping preventing false-positive DOWN alerts on PON port UP messages.
- **Syslog Device Security**: Allow, deny, and delete controls for registered syslog devices to prevent log flooding.
- **Admin Tab Visibility Guarantee**: Permanent access to all 11 tabs for administrators with resilient tab persistence.
- **Auto-Restart System**: Launcher automatically detects and restarts unresponsive API processes (Self-Healing).
- **Dashboard Resilience**: 10-second timeouts and independent module loading prevent full-page hangs.
- **Service Heartbeats**: Background services log "Healthy" status every 5 minutes for troubleshooting.
- **Downtime Audit Tool**: Scan logs for historical downtime gaps (`check_downtime.py`).
- **Threaded Backend Architecture**: Multi-threaded API to ensure UI responsiveness.
- **Performance Optimized SQL**: High-performance indexes on syslog and trap tables.
- **Pure PostgreSQL Architecture**: Standardized PostgreSQL implementation across all modules.

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

- React 19 + TypeScript + Tailwind CSS 3.4 + Chart.js 4 (Modern Frontend)
- Python 3
- Flask & Flask-CORS
- PostgreSQL 12+
- Paramiko (SSH/Telnet OLT communication)
- PySNMP
- Tkinter launcher

## Supported Environment

- Windows 10 / 11
- Windows Server deployments
- PostgreSQL 12+
- Python 3.10+
- Node.js 18+ (for frontend development)

Administrator rights are typically required for installation and for binding to privileged ports like `69/udp` and `162/udp`.

## Default Services and Ports

Defaults come from [`noc_config.py`](noc_config.py):

- Dashboard HTTP: `5000`
- Dashboard HTTPS: `5443`
- Modern Frontend (Dev): `3000`
- SNMP trap listener: `162/udp`
- Syslog listener: `5141/udp`
- TFTP listener: `69/udp`
- PostgreSQL: `5432`

The dashboard can update listener ports from Settings, and a restart is required after changing them.

## Database

Smart NOC v0.6.0 is purely PostgreSQL-based.

Default app DB values:

- Database: `Smart NOC`
- User: `adminsql`
- Password: `adminsql`
- Host: `localhost`
- Port: `5432`

Supported environment variable overrides:

- `Smart NOC_PGHOST`
- `Smart NOC_PGPORT`
- `Smart NOC_PGUSER`
- `Smart NOC_PGPASSWORD`
- `Smart NOC_PGDBNAME`

## Install and Run

### Option 1: Windows menu flow

Use the bundled menu:

```bat
run.bat
```

Recommended order:

1. `Install or Update Smart NOC`
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
Smart NOC/
â”œâ”€â”€ api.py
â”œâ”€â”€ alert_engine.py
â”œâ”€â”€ dashboard.html
â”œâ”€â”€ login.html
â”œâ”€â”€ launcher.pyw
â”œâ”€â”€ noc_config.py
â”œâ”€â”€ olt_connector.py
â”œâ”€â”€ setup.py
â”œâ”€â”€ setup_postgres.bat
â”œâ”€â”€ init_postgres.sql
â”œâ”€â”€ trap_receiver.py
â”œâ”€â”€ syslog_server.py
â”œâ”€â”€ tftp_server.py
â”œâ”€â”€ CHANGELOG.md
â””â”€â”€ data/ logs/ backups/
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

This repository currently reflects an active in-house operational application build, versioned as Smart NOC v0.6.0.

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

The main configuration file is [noc_config.py](noc_config.py).

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

- `3. Uninstall Smart NOC`

The uninstaller:

- stops and removes Smart NOC services if present
- removes scheduled tasks
- stops running Smart NOC processes
- removes shortcuts
- optionally preserves `data`, `backups`, and `logs`
- schedules removal of `C:\Smart NOC`

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
3. Choose `Install or Update Smart NOC`.
4. Choose `Setup PostgreSQL Database`.
5. Start the app with `launcher.pyw`.
6. Open `https://localhost:5443`.
7. Log in with `admin / admin123` and change the password.
