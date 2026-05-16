# SimpleNOC - Changelog

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
