# Smart NOC v0.5.6.6 — Frontend Migration Analysis

Source basis: `README.md`, `CHANGELOG.md`, `software_architecture.md`, plus full code
reads of `dashboard.html` (7,810 lines), `login.html` (488 lines), and `api.py` (3,444 lines).

---

## 1. Core Application Functionalities (preserved 1:1 in Vue)

### Authentication & Access Control
| Feature | Legacy behavior | API |
|---|---|---|
| Login | username/password POST, session cookie | `/api/auth/login` |
| Current user | role + effective visible tabs on load | `/api/auth/me` |
| Logout | clears session, redirects | `/api/auth/logout` |
| Change password | old/new validation ≥6 chars | `/api/auth/change_password` |
| User CRUD | add/edit/delete with per-tab visibility, assigned OLTs, assigned ping targets | `/api/auth/users*` |
| Assignment targets | OLT list + ping targets available to assign | `/api/auth/available_targets` |
| Session timeout | selectable minutes, saved globally | `/api/settings/security` |

Roles: **admin** (full control) vs **viewer** (read-only; UI disables forms/buttons).
Tab visibility = intersection(global visible tabs setting, per-user tabs); admin always sees all.

### Tab System
11 tabs: Dashboard, Syslog, SNMP Trap(OLT Devices), TFTP Backups, Ping Monitor, Alerts,
OLT Connect, UPLINK Traffic, Logs, ONT, Users.
- Drag-and-drop reordering persisted at `localStorage['noc_tab_order']`
- Theme persisted at `localStorage['noc_theme']`
- Users tab: admin only (hidden otherwise)
- Unauthorized tab → "Access Restricted" panel / redirect

### Dashboard Health tab (`/api/system/health_detailed`, 5 s polling)
- Diagnostic banner: overall_status optimal/warning/critical, headline+verdict,
  host info (hostname, OS, Python version, cores), 1-click Restart/Shutdown/Health Check
- 5 KPI cards: App CPU vs System CPU, App RSS vs System RAM, Disk free vs App storage,
  Network RX/TX KB/s, uptime counter with PID and threads
- 4 charts (Chart.js): CPU/RAM trend line, System RAM doughnut, App storage doughnut,
  Network throughput line (30-sample rolling history)
- Services matrix: API/SNMP/Syslog/TFTP/PostgreSQL rows with status badge, PIDs, memory,
  CPU %, uptime, heartbeat; per-service restart (`/api/system/service_action`); Postgres marked "System DB"
- Inventory counts: traps, syslog msgs, ping targets, tftp backups, OLT profiles, alert rules

### Syslog tab (10 s polling)
- Device grid from `/api/syslog/devices`; OLT filter dropdown feeds query param
- Stats cards: total logs, login events, uplink events, last event tag/time
- Charts: Events by Type bar (`/api/syslog/summary`, top 8), Severity doughnut (`/api/syslog/severity`)
- Paginated event table `/api/syslog/events?limit=50&offset=N` with expandable raw-message row;
  client-side detail parsing (Uplink-port Up/Down regexes, user login/logout/failed)
- "All Syslog" table `/api/syslog`

### SNMP Traps tab (10 s polling)
- Stats: total traps (`/api/traps/summary`), online/offline device counts, last trap time/OLT
- Charts: Traps-per-OLT bar, Trap-volume line (last 60 grouped by minute)
- Device status grid `/api/devices` (name/MAC/IP/status/last seen)
- Recent traps table (top 50 of `/api/traps`); MAC→friendly-name map built from devices

### Ping Monitor tab (10 s polling)
- Stats: online/offline/high-latency(>100ms)/total from `/api/ping/targets`
- Add target form (admin only): IP, optional label, website link
- Table sorted offline-first: status dot, ping count, avg/min/current latency (color-coded),
  packet loss %, latency bar (scale = max(200ms, avg×3)), last seen, website open button,
  rename/delete actions (admin); row click loads history
- Latency history line chart `/api/ping/history/<ip>`

### TFTP Backups tab (10 s polling)
- Stats: files received/successful/total size/port (`/api/tftp/stats`)
- Settings panel: storage path + enabled toggle → `/api/tftp/config` (admin saves)
- Recent backups (last 5) summary cards
- MAC mapping collapsible panel: NAT scenarios, add/remove mapping
  (`/api/tftp/mac_mapping*`), table of mappings
- Files table with OLT dropdown + filename search + quick-filter badges; columns:
  id, date/time, OLT badge, source IP, filename, stored name, size, OK/FAIL status,
  download link (`/api/tftp/download/<id>`), delete (admin)

### Alerts tab (15 s polling)
- Stats: active rules, sent, failures, total rules (`/api/alerts/stats`)
- Email config: SMTP host/port/user/pass/from/TLS/enabled → `/api/alerts/email_config`;
  test send `/api/alerts/test_email`; diagnostics `/api/alerts/email_diag`
- Telegram config: bot token, chat id, enabled + test (`/api/alerts/telegram_config`, `/test_telegram`)
- Discord config: webhook URL, enabled + test (`/api/alerts/discord_config`, `/test_discord`)
- Rules CRUD (`/api/alerts/rules/*`): name, source_type syslog|ping, host_match,
  exclude_hosts, text_match (AND lines), to_email, notify_via (email/telegram/discord),
  toggle, edit modal, hits + last-hit tracking
- Alert log table (`/api/alerts/log`): time, rule, host, sent OK/FAIL, message
- Email template editor (`/api/alerts/template`) with {host},{message},{time} placeholders + reset

### OLT Connect tab (15 s polling)
- Stats: profile count, last poll, total/online/offline ONUs from latest session snapshot
- Profile form (admin): name, ip, model V1600G1/V1600G1B, conn auto|ssh|telnet,
  ssh/telnet ports, username, password, enable password, uplink ports
  → `/api/olt/profiles/add|update|delete`
- Registered OLTs table with actions: ONU poll (`/api/olt/poll_onu`),
  Uplink poll (`/api/olt/poll_uplink`), Edit, Delete
- Progress watcher polls `/api/olt/poll_progress?id=` every 1 s while running
- Job scheduler (admin): profile, type onu|uplink|full, mode repeat|once, start_at,
  interval 5–240 min → `/api/olt/jobs/add|toggle|delete`; jobs table with last run
- Poll History paginated (15/page) from `/api/olt/sessions`: time, OLT, duration,
  total/online/offline ONUs, method, success

### Uplink Traffic tab
- Selectors: OLT (from profiles), Port (saved ports + gigabitethernet 0/1..0/16), Range
  last5|day|week|month
- Data: `/api/olt/uplink_stats?limit=5` or `/api/olt/uplink_aggregate?range=…`
- Multi-series RX/TX Kbps line chart + latest-stat cards (link status, rates, totals)

### Logs tab
- File list `/api/logs/list`, tail selector 200/500/1000/2000, search filter
- Content viewer via `/api/logs/read?name=&tail=`

### ONT Lookup tab
- Serial search `/api/onu/history?serial_no=`
- Rx Power trend line chart + history table (time, status, dBm color-coded, distance, OLT)

### Power controls (global modals)
- Restart confirm modal with target select (all/api/snmp/syslog/tftp/ping)
  → `/api/system/restart`; non-api targets show success msg, api/all trigger reconnect flow
- Shutdown confirm → `/api/system/shutdown`
- Reconnect countdown modal: N-second countdown, progress bar, then health-polls
  `/api/health` every 1 s until OK → auto reload

### Settings modal (gear button)
Sections: retention days ×7, service ports ×5 (validation 1–65535),
global visible-tab checkboxes, session timeout select, power buttons.
Admin sections hidden/read-only for viewers.

## 2. Business Logic (client-side, ported)
- Latency color thresholds: <50 green, <100 amber, else red; loss >20% red, >5% amber
- Severity→badge map (emergency..warning red/amber, notice/info cyan)
- OLT badge color derived from last char code %4
- Trap volume grouping by HH:MM minute of last 60 traps
- Syslog stats derived from events page (login/uplink tag filters)
- Event detail parsing regexes (uplink-port state, login/logout/failed w/ source IP+via)
- Backup restore validation: JSON with `version` required, confirm dialog,
  decryption-failure hint message
- Password min length 6; port range 1–65535; job default start = now+5 min
- 10 s fetch timeout everywhere (AbortController); 401 → redirect `/login`
- Error bodies surface backend `error` strings verbatim

## 3. Third-Party Integrations
| Integration | Direction | Configured via |
|---|---|---|
| Discord webhooks | backend → Discord | Alerts tab config |
| Telegram Bot API | backend → Telegram | Alerts tab config |
| SMTP email | backend → mail server | Alerts tab config (+ template editor) |
| Chart.js 4.4.1 | frontend rendering | bundled (was CDN) |
| Google Fonts (Share Tech Mono, Rajdhani) | frontend assets | kept as CDN link |
| PostgreSQL | backend storage | settings (ports/retention) surfaced in UI |
| VSOL OLTs (SSH/Telnet) | backend polling | OLT Connect tab |

## 4. Endpoint Count Check
98 functional REST routes + page/static routes; all consumed endpoints are wired into
the Vue components listed above. No SSE/WebSocket exists — polling cadences preserved
(health 5 s, syslog/traps 10 s, alerts/olt 15 s, users 20 s, uplink 30 s).
