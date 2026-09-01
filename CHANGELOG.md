# Smart NOC - Changelog

---

## v0.6.0 - React 19 Frontend Suite, Studio Theme Engine, Pure PostgreSQL Telemetry & Production Stabilization
**Release date:** 2026-08-31 (Updated: 2026-09-01)

### Added
- **Modern React 19 + TypeScript + Watermelon UI Frontend (`frontend/`)**:
  - Full rewrite into a high-performance modern React 19 Single Page Application with TypeScript 5, Tailwind CSS 3.4, Lucide React icons, and Chart.js 4 (`react-chartjs-2`).
  - **Watermelon UI Design System ([ui.watermelon.sh](https://ui.watermelon.sh))**:
    - Cyber-dark studio palette (`#030712` / `slate-950`), translucent glassmorphism cards (`slate-900/80`), subtle slate borders (`#1e293b`), and glowing status accents (cyan `#00e5ff`, emerald `#10b981`, amber `#f59e0b`, rose `#f43f5e`).
    - Dynamic studio sidebar with route status pills, animated brand logo, user role badges (`ADMIN` / `READ-ONLY`), and direct session management.
    - Top studio navigation bar with live breadcrumbs, dark/light mode toggle, headless power controls, and a quick `⏮ Legacy UI` switcher (`/?legacy=1`).
- **Comprehensive Light & Dark Theme Engine**:
  - Class-based theme toggle applied at the root HTML element with persistent `localStorage` preference.
  - Complete `.light` CSS selector overrides across all navigation elements, modals, KPI metric cards, data tables, filter inputs, status badges, and chart legends for high-contrast visibility.
- **Enhanced ONU Modal & Live Telemetry Inspector (View ONUs)**:
  - **Summary Statistics Cards**: Dynamic KPI header calculating Total ONUs, Online count & online percentage, Offline count, Dying Gasp power outage count, Average & Minimum Rx Power (dBm), and Max Fiber Span distance.
  - **Dynamic PON Port Selector**: Automatic port discovery and count aggregation (e.g. `GPON 0/1 (14 ONUs)`, `GPON 0/2 (8 ONUs)`).
  - **Multi-Level Filtering**: Search filter by serial number, model, name, or ONU ID alongside Status dropdown filtering (`Online Only`, `Offline Only`, `Dying Gasp`).
  - **Direct CSV Export**: 1-click export of current filtered ONU snapshot data to formatted CSV.
- **Uplink Traffic Interface Telemetry & Bandwidth Curve Visualizer**:
  - **Multi-Interface Graphing**: Real-time and historical bandwidth curves with solid IN (Mbps) and dashed OUT (Mbps) series for all configured interfaces when "All Saved Ports" is selected.
  - **Live Peak & Low Metrics**: Real-time calculation of Peak IN, Peak OUT, Low IN, and Low OUT bandwidth metrics across aggregated timeframes (Last 5, Last 20, 24h, 7 Days, 30 Days).
  - **On-Demand Live Uplink Poll Trigger**: Dedicated "Poll Uplink Now" action to execute immediate hardware queries from the Uplink view.
- **Syslog Device Authorization & Real-Time Status Engine**:
  - Real-time device status calculation aligned with backend-authoritative status (`Receiving` for active streams, `Standby`, `Offline`).
  - Enforced syslog ingestion filtering and admin authorization controls (**Accept**, **Deny**, **Delete**, and inline **Rename**).
- **Precision MB & Kbps Telemetry on Health Dashboard**:
  - 5-way breakdown doughnut chart displaying exact Megabyte (MB) values for PostgreSQL Database, TFTP Backups, Data directory, Logs, and Free Disk Space.
  - 3-way breakdown doughnut chart in exact Megabytes (MB) for Smart NOC App RSS, Other Processes, and Free System Memory.
  - Network throughput explicitly measured and visualized in Kilobits per second (Kbps).
- **OLT Automatic Poll Scheduler Inline Editing**:
  - Added `@app.route('/api/olt/jobs/update')` endpoint supporting inline modification of poll type, schedule mode, start time, and interval.

### Changed & Fixed
- **OLT Long-Running Polling Timeout & Abort Controller Fix**:
  - Increased API client timeout from 12s to 180s (3 minutes) for all long-running SSH/Telnet polling operations (`/api/olt/poll_onu`, `/api/olt/poll_uplink`, `/api/olt/poll`, `/api/olt/test_connection`, `/api/olt/discover`, `/api/olt/raw_output`), backup archives, and service restarts.
  - Implemented proper `AbortSignal` chaining to prevent premature `"Request failed: signal is aborted without reason"` errors.
- **Syslog Receiving Status Parity**:
  - Resolved status mismatch where timezone offsets on raw timestamps caused active receiving devices to display as "Offline". Status is now derived directly from backend registration (`status === 'receiving' || status === 'online'`).
- **Uplink Traffic Chart Data Binding & Canvas Lifecycle**:
  - Fixed Chart.js dataset mapping to properly bind `in_mbps` / `out_mbps` / `in_bps` / `out_bps` API response fields.
  - Implemented reactive `useMemo` hooks and unique chart instance keys (`chartKey`) to ensure flawless canvas re-rendering across OLT, Port, and Range selector changes without context collisions.
- **Session Cookie & CORS Cross-Compatibility**:
  - Configured `SESSION_COOKIE_SECURE = False` and `SESSION_COOKIE_SAMESITE = 'Lax'` with explicit CORS origin headers so session authentication works seamlessly across both HTTP (port 5000 / Vite port 3000) and HTTPS (port 5443).
- **Pure PostgreSQL Storage Engine**:
  - Standardized all modules (SNMP Traps, Syslog, TFTP, Ping Monitor, OLT/ONU Telemetry, Auth, and Alerts) on PostgreSQL backend.
- **Legacy & Modern UI Dual Support**:
  - Classic single-file dashboard (`dashboard.html`) remains 100% functional and directly accessible via `/?legacy=1`.
- **Codebase Clean-Up**:
  - Removed all obsolete Vue components, Vue router/stores, and temporary test fixtures while maintaining clean zero-warning builds.

---

## v0.5.6.6 - React 19 + TypeScript + Watermelon UI Frontend Redesign, Syslog Access Control & Precision Health Telemetry

### Added
- **Modern React 19 + TypeScript + Tailwind CSS Single-Page Application (`frontend/`)**:
  - Re-architected frontend into a high-performance modern React 19 SPA with TypeScript, Tailwind CSS 3.4, Lucide icons, and Chart.js 4 (`react-chartjs-2`).
  - **Watermelon UI Design System ([ui.watermelon.sh](https://ui.watermelon.sh))**:
    - Cyber-dark studio palette (`#030712` / `slate-950`), translucent cards with subtle borders (`#1e293b` / `slate-800`), glassmorphism backdrop blur, and glowing neon accents (cyan `#00e5ff`, emerald `#10b981`, amber `#f59e0b`, rose `#f43f5e`).
    - Collapsible studio sidebar with route status pills, animated brand logo, user role badges (`ADMIN` / `READ-ONLY`), and direct session management.
    - Top studio navigation bar with live breadcrumbs, dark/light mode toggle, headless power controls, and a quick `⏮ Legacy UI` switcher (`/?legacy=1`).
- **Syslog Device Authorization & Real-Time Status Engine**:
  - **Device Status Calculation**: Real-time status based on last received timestamp (<60s Receiving, 1–5m Standby, >5m Offline).
  - **Access Control & Ingestion Enforcing**: New syslog devices default to pending authorization. Admin actions to **Accept**, **Deny**, **Delete**, and inline **Rename** devices.
  - Filter dropdowns dynamically filter only authorized devices to prevent unauthorized log flooding.
- **Precision MB & Kbps Telemetry on Health Dashboard**:
  - **Storage & Database Distribution**: 5-way breakdown doughnut chart displaying exact Megabyte (MB) values for PostgreSQL Database, TFTP Backups, Data directory, Logs, and Free Disk Space.
  - **System Memory Allocation**: 3-way breakdown doughnut chart in exact Megabytes (MB) for Smart NOC App RSS, Other Processes, and Free System Memory.
  - **Network Throughput**: Explicitly measured and visualized in Kilobits per second (Kbps) across all charts and stat cards.
- **OLT Automatic Poll Scheduler Inline Editing**:
  - Added `@app.route('/api/olt/jobs/update')` endpoint supporting inline modification of poll type, schedule mode, start time, and interval without recreating jobs.
- **Self-Healing SSL/TLS Validation**:
  - Enhanced `gen_cert.py` to validate certificate and private key consistency on startup, self-healing broken certificate chains automatically.

### Changed
- **Zero Backend Breaking Changes**: Preserved 100% of existing REST APIs, session cookies, database schemas, and background daemons.
- **Instant Legacy UI Switcher**: Classic single-file dashboard (`dashboard.html`) remains accessible anytime via `/?legacy=1` or top bar `⏮ Legacy UI` button.


---

## v0.5.6.4 - System Health Dashboard, 24x7 Power Controls, Discord Alerts & App Rebranding
**Release date:** 2026-06-22

### Added
- **Application Rebranding to Smart NOC**:
  - Rebranded the platform from **SimpleNOC / SNOC** to **Smart NOC** across all UI headers, logo assets, login templates, daemons, service wrappers, and documentation.
- **System Health & Diagnostics Dashboard**:
  - Introduced a primary **Dashboard** tab with a continuous diagnostic engine analyzing database connectivity, process liveness, port changes, memory thresholds, and continuous uptime milestones.
  - Added an automated "Does it need a restart?" verdict banner with actionable 1-click targeted recovery prompts.
  - 5 Real-Time KPI stat cards: App vs System CPU %, Smart NOC Process RSS vs System RAM Total, Free Disk Space vs App Storage breakdown, Live Network I/O throughput (RX/TX KB/s), and 24/7 continuous uptime counter with active PID and threads.
  - 4 Interactive Chart.js graphs & pie charts: CPU & RAM historical trend line chart, system RAM allocation doughnut chart, application storage distribution doughnut chart, and real-time network throughput line chart.
  - Background Services Status Matrix monitoring API, SNMP, Syslog, TFTP, and PostgreSQL processes with real-time status badges, PIDs, memory usage, CPU load, uptime, heartbeats, and per-service restart triggers.
- **In-App Power Controls (Restart & Shutdown)**:
  - Added `POST /api/system/restart`, `POST /api/system/shutdown`, and `POST /api/system/service_action` endpoints.
  - Added in-app **Restart Smart NOC** and **Shutdown Smart NOC** controls in both the Dashboard hero banner and Settings modal for headless 24/7 server management without terminal access.
  - Integrated a 6-second auto-reconnection countdown banner with health polling during application restarts.
- **Visual Alert Status Indicators (Color-Coded for Easy Understanding)**:
  - When alerts are dispatched across Discord, Telegram, Email, and other notification apps, incidents are instantly color-coded for fast recognition:
    - 🔴 **Red Indication**: Sent for **DOWN / OFFLINE / CRITICAL** states (loss of signal, unreachable targets, host down, link down, uplink down, PON port down) with red status dots, red badges, and `#dc3545` color-coded Discord sidebar embeds.
    - 🟢 **Green Indication**: Sent for **UP / ONLINE / RESTORED** states (service recovery, host reachable, link restored, ping restored, PON port up) with green status dots, green badges, and `#28a745` color-coded Discord sidebar embeds.
    - 🟡 **Yellow Indication**: Sent for **WARNING / DEGRADED** states (high latency, config changes, user logins/logouts).
- **Discord Rich Embeds**: Discord webhook notifications render structured embeds with color-coded sidebars (Red for DOWN, Green for UP), formatted field tables, and timestamp footers.
- **Multipart HTML Email Alerts**: Email alerts deliver responsive HTML templates with prominent color-coded status badges (Red for DOWN, Green for UP), structured details tables, and message highlight boxes alongside plain-text fallbacks.
- **Telegram HTML Formatting**: Telegram notifications send formatted bold headers with unicode visual status dots (🔴 for DOWN, 🟢 for UP).
- **Discord Integration**: Added Discord webhooks as a notification channel for Alert Rules. Users can broadcast syslog and ping monitor alerts to Email, Telegram, and Discord simultaneously.
- **Syslog Device Registration**: Added allow, deny, and delete actions for registered Syslog devices. Unregistered or denied devices will have their syslog messages ignored to prevent log flooding.

### Changed & Fixed
- **Whole-Word Regex Status Detection & Tag Stripping**:
  - Replaced naive substring checking in `alert_engine.py` with regex word boundaries (`\bup\b`, `\bdown\b`).
  - Added automated stripping of compound tags (`Updown`, `Up/Down`, `PORT_UPDOWN`) prior to status analysis, eliminating false-positive RED DOWN indicators on PON port UP syslog messages.
- **Direct Multi-Channel Alert Dispatch**:
  - Removed user assignment and binding lookup constraints from the alert engine (`alert_engine.py`). All triggered syslog events and ping state changes are now delivered directly to configured notification channels (**Discord**, **Email**, and **Telegram**) according to rule configuration.
  - Eliminated duplicate function declarations and runtime resolution dependencies that previously hindered notification dispatch.
  - Enhanced error handling in `syslog_server.py` to explicitly log alert evaluation exceptions to the console (`[SYSLOG ALERT ERROR]`) rather than silently suppressing errors.
  - Replaced Windows-unsupported unicode arrow characters with ASCII indicators (`->`) to eliminate `cp1252` charmap encoding crashes during console logging.
- **Admin Tab Visibility Guarantee**: Admin accounts now always retain full, permanent access to all 11 product tabs (`dashboard`, `syslog`, `snmp`, `tftp`, `ping`, `alerts`, `olt`, `uplink`, `logs`, `ont`, `users`) regardless of global user restrictions in Settings.
- **Tab Visibility Resilience**: Fixed tab persistence and panel switching to prevent active dashboard views from being hidden on initialization.
- **Centralized Version Alignment**: Synchronized all scripts, batch files, SQL initializers, and documentation to version `v0.5.6.4`.

---

## v0.5.6.3 - Self-Healing & UI Resilience
**Release date:** 2026-05-16

### Added
- **Auto-Restart System**: The Launcher now monitors API responsiveness. If the API hangs for more than 30 seconds, it is automatically restarted to ensure maximum uptime.
- **Service Heartbeats**: All background services now log a "Healthy" heartbeat every 5 minutes for easier troubleshooting and uptime tracking.
- **Log Analysis Utility**: Added `check_downtime.py` to allow administrators to audit logs for historical gaps and service interruptions.

### Changed
- **Dashboard Fault Tolerance**: Implemented a 10-second timeout on all API calls in the dashboard.
- **Resilient UI Loading**: Dashboard components now load independently. A slow query in one module (e.g. Syslog) will no longer prevent other modules (Traps, Ping, etc.) from updating.
- **Optimized Monitoring**: Increased launcher polling interval to 5 seconds to reduce background overhead.

### Fixed
- **Trap Receiver Stability**: Fixed a missing import in the SNMP Trap Receiver that caused service crashes upon receiving certain Vsol trap types.

---

## v0.5.6.2 - Reliability & Performance Hotfix
**Release date:** 2026-05-12

### Added
- **Database Indexing**: Implemented high-performance indexes on `timestamp` columns for `syslog`, `traps`, `events`, and `alert_log` tables to accelerate dashboard queries and background cleanup tasks.

### Changed
- **Threaded API Server**: Enabled multi-threading in the Flask/Werkzeug backend to prevent slow database operations or long-running requests from blocking the dashboard UI.
- **Improved Retention Stability**: Optimized the hourly retention worker to utilize new indexes, reducing table locking time and preventing dashboard hangs on high-volume systems.

### Fixed
- **SQL Syntax Error**: Resolved a PostgreSQL compatibility issue in the Syslog severity report (`GROUP BY` clause fix).

---

## v0.5.6.1 - Backup System Optimization & Stability
**Release date:** 2026-05-08

### Changed
- **Optimized Backup System**: Redesigned the backup engine to focus on operational configuration (settings, profiles, alert rules, users, ping targets).
- **Historical Data Exclusion**: High-volume historical data (syslog, traps, ping results) is now excluded from full backups to prevent memory-related application crashes and ensure stability.
- **Improved UI Clarity**: Updated the dashboard's Backup & Restore section with clearer descriptions regarding what is included in the backup snapshots.
- **Code Cleanup**: Removed redundant frontend backup/restore functions and unified the workflow for better reliability.

### Fixed
- Added missing `telegram_config` to the configuration backup set.
- Resolved application crashes during backup generation for systems with large event histories.

---

## v0.5.6.0 - Version Centralization, Ping Website Launch, OLT Profile Editing
**Release date:** 2026-04-28

### Added
- Website URL field for Ping Monitor targets.
- Launch button in Ping Monitor to open the configured website in a new browser tab.
- Edit action for existing OLT profiles so passwords, ports, and connection settings can be updated without recreating the profile.

### Changed
- Centralized the application version into a shared `APP_VERSION` setting used by `api.py`, `launcher.pyw`, `setup.py`, and the served dashboard/login pages.
- Backup metadata version now follows the centralized app version automatically.
- Dashboard and login HTML version labels are now injected by the API at render time.

### Fixed
- OLT profile updates now preserve the existing stored password and enable password if those fields are left blank during edit.

---

## v0.5.5.3 - Pure PostgreSQL & Storage Optimization
**Release date:** 2026-04-14

### Added
- Enforcement of a 150MB storage limit for Syslog via automatic PostgreSQL table truncation.

### Changed
- **Complete removal of SQLite**: The application now runs exclusively on PostgreSQL, removing all legacy fallback logic and `.db` file dependencies.
- Updated all backend services (`syslog_server`, `trap_receiver`, `tftp_server`, `alert_engine`, `olt_connector`) to use PostgreSQL-native SQL syntax and connection handling.

---

## v0.5.5.2 - User Access, Alerting, Settings, Logs/ONT

### Added
- User creation and editing from the **Users** tab.
- Role selection during user creation: **Admin** or **Read-only**.
- Per-user visible tab selection.
- Global tab enable/disable controls under **Settings > Admin Users**.
- **Logs** tab for viewing local service logs.
- **ONT** lookup tab for serial-based ONT history review.
- **Telegram** alert configuration and testing.
- Alert rule source type support for both **Syslog** and **Ping Monitor Offline** events.
- Alert rule support for **exclude hosts / IPs**.
- Ping monitor offline alert delivery when a monitored IP transitions to `offline`.
- Session timeout control in Settings.

### Changed
- Effective tab access now respects both globally enabled tabs and per-user assigned tabs.
- Users tab now correctly shows admin-only panels such as **Add New User**.
- Read-only users now see the Ping Monitor in view-only mode and cannot add, rename, or remove shared ping targets.
- Read-only users now see only the **Session timeout** section in Settings.
- Launcher and dashboard metadata aligned to `v0.5.5.2`.

### Fixed
- Fixed missing **Add New User** panel caused by incorrect Users tab element targeting in the dashboard.
- Fixed read-only users being able to modify ping targets shared across all users.
- Fixed inconsistent `v0.5.5.1` strings still present in some runtime UI and tooling surfaces.

### Upcoming
- Android app to display ONT details.
- Limit users to specific OLT profiles so they cannot view ONU information from other OLTs.

---

## v0.5.5.1 - UI / Appearance
**Pre-release:** 2026-04-04

### Added
- Settings modal for retention visibility and management.
- Stronger light/dark theme handling.
- Better dashboard refresh behavior for active tabs.

### Fixed / Improved
- TFTP startup crash caused by indentation issues.
- Settings retrieval/API behavior cleanup.
- Contrast, readability, and chart text improvements.

---

## v0.5.5 - OLT, ONU, Syslog, and TFTP Expansion
**Released:** 2026-03-25 to 2026-03-28

### Major Work
- OLT Connect profile management.
- SSH/Telnet OLT polling.
- ONU inventory/history collection.
- Uplink traffic monitoring.
- Syslog state tracking and event views.
- TFTP backup receiver and dashboard inventory.
- MAC-to-OLT mapping for NAT/multi-OLT scenarios.
- Alert template support.

---

## v0.5.4 - TFTP Server and Dashboard Improvements
**Released:** 2026-03-23

### Major Work
- TFTP receive service.
- Backup inventory UI.
- Download/delete actions.
- Storage configuration support.
- Ping Monitor redesign.

---

## v0.5.3 - Draggable Tabs and Backup/Restore
**Released:** 2026-03-22

### Major Work
- Draggable dashboard tabs.
- Persistent tab order.
- Backup and restore workflow.
- Windows task cleanup improvements.

---

## v0.5.2.1 - Remote Access Fix
**Released:** 2026-03-22

### Fixed
- Dashboard API URL now uses `window.location.host` dynamically.
