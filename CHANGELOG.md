# SimpleNOC — Changelog

---

## v0.5.5.1 — UI / appearance (pre-release)
**Pre-release:** 2026-04-04

Dashboard and configuration UX improvements. No breaking database changes; retention overrides are stored in PostgreSQL `noc_settings`.

### Added
- **Settings (database retention)** — Header **Settings** opens a modal to view or edit retention days per category (admin save). Values persist in `noc_settings` and apply to hourly cleanup and syslog pruning; [`noc_config.py`](noc_config.py) constants remain defaults until overridden.
- **API** — `GET /api/settings/retention`, `POST /api/settings/retention` (admin). Full backup/restore includes `noc_settings`.

### Fixed / improved
- **Refresh** — Header **Refresh** runs `fetchAll()` and `fetchPing()`, and reloads the **active tab** (Alerts, TFTP, OLT, Uplink, Users) the same way as switching tabs, so the visible panel updates instead of only SNMP/syslog.
- **Light / dark theme** — Header and tab bar use theme variables (`--header-bg`, `--tabs-bg`) so they follow light mode; secondary text and chart tick/legend colors adjusted for contrast.
- **Readability** — Settings modal: larger type and stronger label/note contrast (especially light mode). Uplink traffic cards: larger secondary metrics, higher-contrast meta text, **Sampled** shows short date + time (`toLocaleString` options).

### Files touched (summary)
- [`dashboard.html`](dashboard.html), [`api.py`](api.py), [`retention_settings.py`](retention_settings.py), [`syslog_server.py`](syslog_server.py), [`noc_config.py`](noc_config.py) (defaults comment).

---

## v0.5.5 — Interface Descriptions & Syslog States
**Released:** 2026-03-28

### Upcoming work
- **HTTPS for the dashboard** — switching from `http://localhost:5000` to HTTPS on the localhost API to avoid mixed/cleartext warnings when injecting passwords; plan is to add a self-signed cert loader and update `launcher.pyw`/`api.py` to serve TLS (feel free to flag if a CA cert or trust store change is needed).

## New Features
- **OLT model selector** — the OLT Connection Profile form now lets you choose between `V1600G1` and `V1600G1B`, stores the value in the db, and surfaces it in the registered OLT list.
- **Model-aware polling** — `V1600G1B` runs `int gpon 0/X` plus the appropriate `show pon onu all rx-power`/`show pon rx_power onu` commands while still collecting `show onu 1-128 distance`, so both OLT variants always get optical and distance data.
- **Robust ONU matching** — the parser merges `show onu info` and `show onu state` to build a reliable `onu_index`/`onu_id` map and picks the RX command that actually returns data, keeping optical power columns populated even when output formats differ.

### Fixed
- **ONU state accuracy** — `working` maps to `online`, other phase states map to offline while the dashboard reflects the correct online/offline counts.
- **Optical/distance fallback** — matches on ONU ID and skips `N/A` entries so V1600G1B profiles now show actual Rx power and distance metrics instead of gaps or placeholders.

### New Features
- **Syslog State Machine** — Devices now transition through **Receiving** (active), **Standby** (no logs for 2+ hours), and **Offline** (no logs for 24+ hours).
- **Interface Descriptions** — OLT Uplink cards now show the port description (e.g., "Uplink to Core") instead of just the raw interface name.
- **Navigation Reorganization** — Main tabs simplified to Syslog, SNMP Traps, TFTP Backups, Ping Monitor, and Alerts. OLT Devices merged into SNMP Traps view.
- **Improved Traffic Parsing** — Enhanced regex for Vsol CLI to accurately parse both `bytes/sec` and `bits/sec` traffic rates from `show interface`.
- **Automatic Multi-OLT Support** — TFTP and Syslog now better handle multiple OLTs behind the same NAT IP using the MAC mapping table.

### Fixed
- **Uplink Calculation** — Fixed Mbps calculation showing 0.00 for some Vsol firmware versions due to varying "bits/sec" vs "bytes/sec" labels.
- **Syslog Offline Detection** — Background thread now correctly marks inactive syslog emitters as Offline or Standby based on `last_seen`.
- **Navigation Highlight Bug** — Consistently highlights the active tab after reorganization.

---

## v0.5.5 — OLT Connect & ONU Dashboard
**Released:** 2026-03-25

### New Features
- **OLT Connect tab** — SSH/Telnet into Vsol OLT on demand, per-OLT credentials
- **Connection method selector** — Auto (SSH→Telnet fallback), SSH only, Telnet only
- **Pure socket Telnet** — no `telnetlib` dependency (removed in Python 3.13)
- **ONU data collection** — `show onu info` + `show onu state` combined
- **ONU modal popup** — full table with PON port, ONU ID, Serial, Model, Profile, State
- **PON port filter / Online filter / Search** — filter ONU list in modal
- **Stats bar** — Total, Online, Offline, Dying Gasp counts
- **Uplink traffic monitoring** — `show interface ge 0/X` parsed for In/Out Mbps
- **Uplink cards** — per-port traffic cards showing download/upload in Mbps
- **Multiple uplink ports** — comma-separated in profile (e.g. `ge 0/10, ge 0/11`)
- **Export CSV** — download full ONU table
- **Poll history** — session log with duration, method, ONU count
- **Inline loading spinner** — shows on Connect button during poll, not fullscreen
- **Data saved to DB** — `olt.db` stores ONU snapshots and uplink stats history
- `paramiko` added to installer packages for SSH support

### Fixed
- Login loop after restart — `_SERVER_START` check was blocking valid logins (removed)
- `telnetlib` error on Python 3.13 — replaced with pure `socket` implementation
- SSH module errors now always fall back to Telnet automatically
- OLT API routes were registered after `if __name__` block — moved before main
- Add OLT Profile button did nothing — same route registration bug, fixed

### Notes
- `show onu optical-info` not supported on this OLT model — optical power column shows `—`
- Distance measurement not available via CLI on Vsol V1600G

---

## v0.5.5 — OLT Connect & ONU Dashboard
**Released:** 2026-03-25

### New Features
- **OLT Connect tab** — SSH/Telnet into Vsol OLT on demand
- **Per-OLT credentials** — name, IP, SSH port, Telnet port, username, password, enable password
- **Auto-fallback** — tries SSH first, falls back to Telnet if SSH fails
- **ONU data collection** — runs `show onu info`, `show onu state`, `show onu optical-info`
- **ONU modal popup** — full ONU table shown when clicking Connect or View ONUs
- **ONU table columns** — Status, ONU Index, PON Port, ONU ID, Serial No, Model, Profile, Rx Power, Tx Power, Distance, State
- **PON port filter** — filter ONUs by PON port number
- **Online/Offline filter** — show only online or offline ONUs
- **Search** — filter by serial number or model
- **Stats bar** — Total, Online, Offline, Dying Gasp, Farthest ONU, Weakest Signal
- **Rx power color coding** — green ≥ -20dBm, yellow ≥ -25dBm, red < -25dBm
- **Export CSV** — download full ONU table as CSV
- **Poll history** — session log with duration, ONU count, method used
- **Data saved to DB** — `olt.db` stores snapshots for history tracking
- **`olt_connector.py`** — new module handling SSH/Telnet/parsing
- **`OLT_DB`** added to `noc_config.py`
- `paramiko` required for SSH — install with `pip install paramiko`

### Vsol CLI Commands Used
- `show onu info` — ONU index, model, profile, serial number
- `show onu state` — online/offline/dying gasp status per ONU
- `show onu optical-info` — Rx/Tx power levels (when available)

---

## v0.5.4 — TFTP Server & Dashboard Improvements
**Released:** 2026-03-23

### New Features
- **TFTP Server** (`tftp_server.py`) — RFC 1350 compliant, receive-only (WRQ) mode
- **OLT identification** — identifies OLT by source IP, maps to known OLT name from devices DB
- **Auto file naming** — stored as `OLTNAME_FILENAME_TIMESTAMP` for easy identification
- **TFTP Backups tab** — new dashboard tab showing all received backup files
- **File list** — OLT name, source IP, original filename, stored name, size, timestamp
- **Download & Delete** buttons — directly from dashboard
- **Recent backups panel** — quick view of last 5 files received
- **OLT filter** — filter backup files by hostname/IP or filename with quick-filter badges
- **Storage path config** — set backup directory from dashboard (admin only)
- **TFTP port configurable** — `TFTP_PORT = 69` in `noc_config.py`, change to e.g. 6969 to avoid Admin
- **Email Template editor** — customize alert email subject and body from Alerts tab
- **Template variables** — `{rule_name}`, `{olt_host}`, `{source_ip}`, `{time}`, `{message}`, `{severity}`, `{host_match}`, `{text_match}`
- **Collapsible template panel** — expands/collapses on click, shows subject preview when collapsed, auto-collapses after save
- **Ping Monitor redesigned** — table/list layout like professional ping tools
- **Ping table columns** — Status (Online/Offline), Count, IP Address, Name, Avg, Min, Cur, PL%, Latency bar, Last Seen, Actions
- **Last Seen column** — shows time + "Xm ago", turns red when offline > 5 minutes
- **Latency bar** — inline visual bar scaled to max latency in list
- **Dashboard renamed** — `snmp_dashboard.html` → `dashboard.html`
- **Improved readability** — brighter text colors, visible timestamps, readable IP addresses
- **`BACKUP_DIR` and `TFTP_DB`** added to `noc_config.py`
- TFTP server added to launcher — 4 services now managed

### Fixed
- TFTP initial ACK sent to wrong port — rewrote to use single main socket (same as debug tool confirmed works)
- `TFTP_DB` and `BACKUP_DIR` missing from `api.py` imports — TFTP tab showed no data and path config didn't save
- Backup files writing to default path instead of configured path — fixed with correct DB import
- Email alert body had no formatting/indentation — now fully templated
- `--muted` color was near-invisible (`#3a6070`) — brightened to `#7ab0cc`
- Table cell text color explicitly set — timestamps and IPs were invisible
- Form labels changed from muted to accent color

### New in this build
- **OLT MAC Address Mapping** — map MAC → OLT hostname for multi-OLT behind same NAT IP
- **MAC extracted from Vsol filename** — `14a72b41db27_20260323.cfg` → `14:A7:2B:41:DB:27`
- **3-level OLT lookup** — MAC mapping table → syslog_devices by MAC → syslog_devices by IP → SNMP devices → fallback to IP
- **MAC column in TFTP files table** — shows extracted MAC for every received file
- **Filter by MAC** — search filter matches hostname, IP and MAC address
- **Alert template fixed** — old hardcoded `build_alert_email` replaced with template-based version
- **Alert engine** — emails now use the template configured from dashboard
- **`mac_mapping` table** — added to syslog.db, auto-created on startup in both `syslog_server.py` and `api.py`
- **Error visibility fix** — MAC mapping add errors now visible whether panel is collapsed or open

### OLT TFTP Setup
Configure your Vsol OLT:
- Server IP: SimpleNOC PC public/LAN IP
- Port: 69
- Mode: Upload / PUT / WRQ
- Received files appear in TFTP Backups tab instantly

---

## v0.5.4 — TFTP Server
**Released:** 2026-03-23

### New Features
- **TFTP Server** (`tftp_server.py`) — RFC 1350 compliant, receive-only (WRQ) mode
- **OLT identification** — identifies OLT by source IP, maps to known OLT name from devices DB
- **Auto file naming** — stored as `OLTNAME_FILENAME_TIMESTAMP` for easy identification
- **TFTP Backups tab** — new dashboard tab showing all received backup files
- **File list** — OLT name, source IP, original filename, stored name, size, timestamp
- **Download button** — download any received backup file directly from dashboard
- **Delete button** — remove backup files from disk and database
- **Recent backups panel** — quick view of last 5 files received
- **Storage path config** — set backup directory from dashboard (admin only)
- **Stats cards** — total files, successful transfers, total storage used
- **TFTP port 69** — standard port, runs as Admin (same as SNMP/Syslog)
- `BACKUP_DIR` and `TFTP_DB` added to `noc_config.py`
- TFTP server added to launcher — 4 services now managed

### New in this build
- **OLT MAC Address Mapping** — map MAC → OLT hostname for multi-OLT behind same NAT IP
- **MAC extracted from Vsol filename** — `14a72b41db27_20260323.cfg` → `14:A7:2B:41:DB:27`
- **3-level OLT lookup** — MAC mapping table → syslog_devices by MAC → syslog_devices by IP → SNMP devices → fallback to IP
- **MAC column in TFTP files table** — shows extracted MAC for every received file
- **Filter by MAC** — search filter matches hostname, IP and MAC address
- **Alert template fixed** — old hardcoded `build_alert_email` replaced with template-based version
- **Alert engine** — emails now use the template configured from dashboard
- **`mac_mapping` table** — added to syslog.db, auto-created on startup in both `syslog_server.py` and `api.py`
- **Error visibility fix** — MAC mapping add errors now visible whether panel is collapsed or open

### OLT TFTP Setup
Configure your Vsol OLT TFTP target:
- Server IP: your SimpleNOC PC public/LAN IP
- Port: 69
- Mode: Upload / WRQ
- The dashboard will show each received file with OLT identity and timestamp

---

## v0.5.3 — Draggable Tabs & Backup/Restore
**Released:** 2026-03-22

### New Features
- **Draggable tabs** — drag any tab left/right to reorder, order saved in browser localStorage
- **Tab order persists** — survives page refresh via localStorage
- **Backup & Restore** — download full config as JSON file (email settings, alert rules, ping targets, users)
- **Restore from backup** — re-populate all config from backup file in one click, shows restore summary
- **Backup portable** — use backup file to configure a fresh SimpleNOC install instantly
- **Auto task cleanup** — launcher silently removes conflicting Task Scheduler entries on every startup
- **Setup cleanup** — installer removes Task Scheduler entries during fresh install

### Fixed
- **CMD prompt flashing** — ping engine was spawning visible `ping.exe` CMD windows every 10 seconds per target — fixed with `CREATE_NO_WINDOW` flag
- **webbrowser.open flashing** — replaced with hidden `subprocess.Popen` on Windows
- **Tab highlighting wrong after drag** — `switchTab` was using array index position instead of `data-tab` attribute — clicking Ping highlighted SNMP, clicking Alerts highlighted OLT Devices
- `remove_conflicting_tasks` NameError — function was referenced before being defined in launcher
- `buildRulesTable` font string escaping — rewritten with DOM methods to prevent Python patch corruption
- `onclick="switchTab(\'snmp\')"` — backslash-escaped quotes in HTML tab attributes broke JS entirely
- `deleteUser` / `renameSyslogDevice` / `renameDevice` buttons — triple-escaped inline onclick quotes replaced with `data-*` attributes
- `.replace(/\n/g` regex split across two lines during patching — fixed
- `ERR_CONTENT_LENGTH_MISMATCH` blank page — `send_from_directory` replaced with explicit `Response` read for reliable large file serving
- Desktop shortcut creation gracefully skips if Desktop path not found

---


## v0.5.2.1 — Remote Access Fix
**Released:** 2026-03-22

### Fixed
- Dashboard API URL now uses `window.location.host` dynamically
- Accessing from remote IP (e.g. `103.x.x.x:5000`) now works correctly
- Previously hardcoded `localhost:5000` caused API errors on remote access

---

## v0.5.2 — Alert Engine
**Released:** 2026-03-22

### New Features
- **Alert Engine** (`alert_engine.py`) — new module for email alerting
- **Email SMTP configuration** — supports Gmail and any SMTP server
- **Alert rules** — host match + text match = send email (same logic as Visual Syslog)
- **Alert log** — records every alert sent or failed with timestamp
- **Rule hit counters** — shows how many times each rule triggered
- **Last triggered time** — per rule
- **Enable/Disable rules** — without deleting them
- **Test email button** — verify SMTP config works
- **Diagnose button** — shows full SMTP config status, flags empty fields
- **Alerts tab** added to dashboard

### Fixed
- Alert API routes were registered after `if __name__` block — moved before it
- Diagnostic panel was disappearing after 4 seconds — now persistent
- Test email now shows detailed error messages instead of silent failure

---

## v0.5.1 — Stable Core Release
**Released:** 2026-03-21

### New Features
- **Central config** (`noc_config.py`) — all paths and ports in one file
- **Configurable ports** — change SNMP (default 162), Syslog (default 514), API (default 5000) in one place
- **Single launcher** (`launcher.pyw`) — starts all 3 services with one click
- **Hidden CMD windows** — services run silently using `CREATE_NO_WINDOW`
- **Proper quit** — closing launcher stops all services with confirmation dialog
- **Task Scheduler bypass** — `remove_tasks.bat` removes conflicting scheduled tasks
- **Windows installer** — `INSTALL.bat` + `setup.py` auto-detects Python, installs packages, copies files
- **Portable databases** — all DBs stored in `data\` folder relative to install directory
- **START_NOC.bat / STOP_NOC.bat** — command line service control

### Fixed
- Microsoft Store Python stub detection — installer now skips fake Python
- `ON CONFLICT` error in devices table — rebuilt with correct PRIMARY KEY
- `database is locked` — single writer thread with queue for all DB writes
- `setup.py` f-string `{}` SyntaxError — replaced generated launcher with file copy
- Installer copying files over themselves — skip if source == destination
- Version numbering standardized across all files

---

## v0.5 — Multi-User Login & Ping Monitor
**Released:** 2026-03-21

### New Features
- **Login system** — session-based authentication with username/password
- **User roles** — Admin (full access) and Viewer (read-only)
- **User management** — add, delete users; change passwords
- **Login page** (`login.html`) — styled NOC-themed login screen
- **Session expiry** — 12-hour sessions with auto-redirect to login
- **Ping Monitor tab** — continuous IP reachability checking
- **Latency tracking** — current, average (last 20), packet loss %
- **High latency warnings** — visual indicator when > 100ms
- **Latency history chart** — click any ping card to see history
- **Add/Remove/Rename** ping targets from dashboard
- **Ping auto-resume** — restarts monitoring on api.py restart
- **Password hashing** — PBKDF2-SHA256 with random salt (200,000 iterations)

### Fixed
- Dashboard unresponsive after login — `credentials: 'include'` added to all fetch calls
- 401 redirect loop — `apiFetch()` helper centralizes auth handling
- JS syntax errors from template literal patching — switched to DOM methods

---

## v0.4 — Syslog Server & OLT Events
**Released:** 2026-03-20

### New Features
- **Syslog server** (`syslog_server.py`) — listens on UDP 514
- **OLT identification** by hostname (from syslog `HOSTNAME` field)
- **Event detection** — uplink port up/down, user login/logout, ONU events
- **OLT Uplink & Login Events** tab — filtered view showing only OLT-level events
- **Event details** — expandable rows showing full message, time ago, user, IP, via (WEB/VTY)
- **Syslog OLT device cards** — online/offline status per OLT hostname
- **OLT filter dropdown** — view logs from a specific OLT
- **Severity mapping** — `<27>` = Major, `<28>` = Warning (Vsol specific)
- **ONU info extraction** — PON port, ONU ID, serial number from message
- **Event tag system** — `UPLINK_UP`, `UPLINK_DOWN`, `USER_LOGIN`, `USER_LOGOUT`, `LOGIN_FAILED`
- `fix_syslog_tags.py` — utility to re-tag existing DB records

### Fixed
- ONU events no longer shown in OLT Events tab (filtered at API level)
- Login via VTY correctly tagged as `USER_LOGIN` (not just web)
- `logged out` tagged as `USER_LOGOUT` before `logged in` pattern check
- All uplink ports monitored (regex matches any `Uplink-port X/X`)

---

## v0.3 — Dashboard & API
**Released:** 2026-03-20

### New Features
- **Web dashboard** (`snmp_dashboard.html`) — 4 tabs: SNMP Traps, Syslog, OLT Devices, Ping
- **Flask REST API** (`api.py`) — serves dashboard and all data endpoints
- **SNMP tab** — trap counts, bar chart per OLT, line chart over time, trap feed table
- **Syslog tab** — device cards, event chart, severity chart, event table, all syslog table
- **OLT Devices tab** — device cards with MAC, IP, status, rename
- **Auto-refresh** — every 10 seconds
- **OLT rename** — set friendly names for OLTs from dashboard
- **Chart optimization** — `animation: false`, `maxTicksLimit`, no `stepSize`
- **Dashboard served by Flask** — no CORS issues, works from `http://localhost:5000`

### Fixed
- `stepSize: 1` causing 16,000+ chart ticks — browser freeze resolved
- `file://` CORS blocking API calls — dashboard served via Flask
- `ON CONFLICT` error on devices table — auto-migration with PRIMARY KEY fix

---

## v0.2 — Multi-OLT & MAC Identification
**Released:** 2026-03-19

### New Features
- **MAC-based OLT identification** — uses `oltMacAddress` OID `1.3.6.1.4.1.37950.1.1.5.10.13.2.7.0`
- **Auto OLT ID generation** — `OLT-XXYYZZ` from last 3 MAC octets
- **Multi-OLT support** — single port 162, all OLTs auto-detected by MAC
- **Vsol MIB engine** (`vsol_mib.py`) — 300+ OIDs auto-translated
- **Full Vsol OID map** — scraped from `mibs.observium.org/mib/V1600G/`
- **Structured events table** — alarm type, name, severity, ONU ID, PON slot, description
- **MAC decoding** — raw bytes `\x14§+*\x01m` → `14:A7:2B:2A:01:6D` via latin-1 encoding
- **OLT heartbeat** — last seen timestamp, online/offline status
- **Offline detection** — mark offline after 2 minutes of no trap
- **WAL mode SQLite** — concurrent read/write without locking

### Fixed
- `database is locked` — single writer thread with queue
- MAC bytes decoding — `encode('latin-1')` preserves byte values correctly
- `ON CONFLICT` — devices table schema migration

---

## v0.1 — Initial SNMP Trap Receiver
**Released:** 2026-03-19

### Features
- **SNMP trap receiver** — listens on UDP port 162
- **pysnmp integration** — SNMPv1 and v2c support
- **SQLite storage** — traps and devices tables
- **Basic OID translation** — standard SNMP + Vsol enterprise OIDs
- **Source IP identification** — OLT identified by UDP source address
- **Console logging** — trap details printed to CMD window
- **Community string** — `public` (configurable)
- **Admin CMD required** — port 162 needs elevated privileges

---

## Known Issues / Future Work
- SNMP pull (port 161) — OLT ACL needs PC public IP for interface polling
- GE1/GE2 traffic graphs — planned for future version
- ONU status page — dedicated view per OLT showing all ONUs
- SMS alerts — planned alongside email
- Dark/light theme toggle — UI enhancement
- Data export — CSV/PDF report generation
- Dashboard mobile responsive improvements
## v0.5.5 â€” PostgreSQL Installer & Migration Hardening
**Updated:** 2026-04-02

### New Features
- **Unified setup launcher** â€” added `run.bat` as the main Windows entry point for install, PostgreSQL setup, PostgreSQL configuration, SQLite-to-PostgreSQL migration, and uninstall flows.
- **PostgreSQL auto-detection** â€” `setup_postgres.bat` now checks `PATH`, common `Program Files\PostgreSQL\*` locations, and versioned install folders before asking the user for a manual path.
- **Customer prerequisites guide** â€” added `README.md` with Python, PostgreSQL, firewall port, install, and migration prerequisites for fresh installs and upgrade scenarios.
- **Installer action support** â€” `setup.py` now supports `install`, `configure-postgres`, `migrate`, and `uninstall` actions so `run.bat` can drive the full lifecycle from one menu.

### Improved
- **Migration schema bootstrap** â€” `migrate_db.py` now creates the PostgreSQL schema before importing data, instead of assuming tables already exist.
- **Ping dashboard migration** â€” SQLite ping tables are now included in migration so the dashboard has its monitoring data after PostgreSQL cutover.
- **Migration rerun safety** â€” target PostgreSQL tables are truncated and identity sequences are resynchronized before and after import, making retry runs safer after partial failures.
- **Schema drift handling** â€” migration now imports only columns shared between SQLite and PostgreSQL and reports skipped legacy SQLite-only columns instead of crashing.
- **Dirty text cleanup** â€” migration strips embedded NUL characters from SQLite text rows before writing to PostgreSQL.
- **Result reporting** â€” install and migration scripts now return clearer success and failure states in the menu flow.

### Fixed
- **PostgreSQL auth mismatch** â€” default PostgreSQL app config now matches the initialized `adminsql` user instead of using the placeholder `postgres` credentials.
- **Manual PostgreSQL path prompt** â€” fixed delayed variable expansion in `setup_postgres.bat` so manually entered PostgreSQL `bin` paths are validated correctly.
- **Batch label errors** â€” removed fragile label-based migration flow in `run.bat` that could fail with `The system cannot find the batch label specified`.
- **False success after migration failure** â€” `setup.py` now exits with the correct status code for migration, preventing the menu from claiming success after Python errors.
- **Sequence sync on non-ID tables** â€” migration no longer tries to reset PostgreSQL sequences for tables that do not have an `id` column.

### Status
- **Version scope complete** â€” development changes for `v0.5.5` are complete.
- **Pending** â€” final production-machine validation is still pending before this version is considered fully signed off.

---
