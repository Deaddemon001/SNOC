# SimpleNOC — Changelog

---

## v0.5.5.3 — Pure PostgreSQL & Storage Optimization
**Release date:** 2026-04-14

### Added
- Enforcement of a 150MB storage limit for Syslog via automatic PostgreSQL table truncation.

### Changed
- **Complete removal of SQLite**: The application now runs exclusively on PostgreSQL, removing all legacy fallback logic and `.db` file dependencies.
- Updated all backend services (`syslog_server`, `trap_receiver`, `tftp_server`, `alert_engine`, `olt_connector`) to use PostgreSQL-native SQL syntax and connection handling.

---

## v0.5.5.2 — User Access, Alerting, Settings, Logs/ONT

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

## v0.5.5.1 — UI / Appearance
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

## v0.5.5 — OLT, ONU, Syslog, and TFTP Expansion
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

## v0.5.4 — TFTP Server and Dashboard Improvements
**Released:** 2026-03-23

### Major Work
- TFTP receive service.
- Backup inventory UI.
- Download/delete actions.
- Storage configuration support.
- Ping Monitor redesign.

---

## v0.5.3 — Draggable Tabs and Backup/Restore
**Released:** 2026-03-22

### Major Work
- Draggable dashboard tabs.
- Persistent tab order.
- Backup and restore workflow.
- Windows task cleanup improvements.

---

## v0.5.2.1 — Remote Access Fix
**Released:** 2026-03-22

### Fixed
- Dashboard API URL now uses `window.location.host` dynamically.
