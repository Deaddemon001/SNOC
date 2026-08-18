# SimpleNOC - Changelog

---

## v0.5.6.4 - System Health Dashboard, 24x7 Power Controls & Discord Alerts
**Release date:** 2026-06-22

### Added
- **System Health & Diagnostics Dashboard**:
  - Introduced a primary **Dashboard** tab with a continuous diagnostic engine analyzing database connectivity, process liveness, port changes, memory thresholds, and continuous uptime milestones.
  - Added an automated "Does it need a restart?" verdict banner with actionable 1-click targeted recovery prompts.
  - 5 Real-Time KPI stat cards: App vs System CPU %, SimpleNOC Process RSS vs System RAM Total, Free Disk Space vs App Storage breakdown, Live Network I/O throughput (RX/TX KB/s), and 24/7 continuous uptime counter with active PID and threads.
  - 4 Interactive Chart.js graphs & pie charts: CPU & RAM historical trend line chart, system RAM allocation doughnut chart, application storage distribution doughnut chart, and real-time network throughput line chart.
  - Background Services Status Matrix monitoring API, SNMP, Syslog, TFTP, and PostgreSQL processes with real-time status badges, PIDs, memory usage, CPU load, uptime, heartbeats, and per-service restart triggers.
- **In-App Power Controls (Restart & Shutdown)**:
  - Added `POST /api/system/restart`, `POST /api/system/shutdown`, and `POST /api/system/service_action` endpoints.
  - Added in-app **Restart SimpleNOC** and **Shutdown SimpleNOC** controls in both the Dashboard hero banner and Settings modal for headless 24/7 server management without terminal access.
  - Integrated a 6-second auto-reconnection countdown banner with health polling during application restarts.
- **Visual Alert Status Indicators (Color-Coded for Easy Understanding)**:
  - When alerts are dispatched across Discord, Telegram, Email, and other notification apps, incidents are instantly color-coded for fast recognition:
    - 🔴 **Red Indication**: Sent for **DOWN / OFFLINE / CRITICAL** states (loss of signal, unreachable targets, host down, link down, uplink down) with red status dots, red badges, and `#dc3545` color-coded Discord sidebar embeds.
    - 🟢 **Green Indication**: Sent for **UP / ONLINE / RESTORED** states (service recovery, host reachable, link restored, ping restored) with green status dots, green badges, and `#28a745` color-coded Discord sidebar embeds.
    - 🟡 **Yellow Indication**: Sent for **WARNING / DEGRADED** states (high latency, config changes, user logins/logouts).
- **Discord Rich Embeds**: Discord webhook notifications render structured embeds with color-coded sidebars (Red for DOWN, Green for UP), formatted field tables, and timestamp footers.
- **Multipart HTML Email Alerts**: Email alerts deliver responsive HTML templates with prominent color-coded status badges (Red for DOWN, Green for UP), structured details tables, and message highlight boxes alongside plain-text fallbacks.
- **Telegram HTML Formatting**: Telegram notifications send formatted bold headers with unicode visual status dots (🔴 for DOWN, 🟢 for UP).
- **Discord Integration**: Added Discord webhooks as a notification channel for Alert Rules. Users can broadcast syslog and ping monitor alerts to Email, Telegram, and Discord simultaneously.
- **Syslog Device Registration**: Added allow, deny, and delete actions for registered Syslog devices. Unregistered or denied devices will have their syslog messages ignored to prevent log flooding.

### Changed
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
