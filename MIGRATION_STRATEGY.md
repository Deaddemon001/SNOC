# Smart NOC Vue.js Migration Strategy
**From:** Vanilla JS Single-File SPA (dashboard.html, 7810 lines)
**To:** Vue 3 + Vite + Pinia + Vue Router

---

## 1. Current State Analysis

### Frontend Architecture (Legacy)
- **Single monolithic file:** `dashboard.html` (7810 lines) + `login.html` (488 lines)
- **No build system:** Vanilla JS served directly by Flask via `render_versioned_html()`
- **Dependencies:** Chart.js 4.4.1 (CDN), Google Fonts (Share Tech Mono, Rajdhani)
- **State:** 10+ global vars, 80+ functions, 10+ Chart.js instances
- **Polling:** health 5s, SNMP/syslog 10s, ping 10s (3 `setInterval` loops)
- **Tab system:** HTML5 drag-and-drop, persisted to `localStorage('noc_tab_order')`
- **Theme:** light/dark toggle via `localStorage('noc_theme')`, CSS variables
- **Auth:** Flask session cookies, 401 redirect to `/login`

### Backend API Surface — 98 Endpoints
Auth(5), System(4), Logs(2), Traps/Devices(6), Syslog(9), Ping(5), Alerts(14),
TFTP(7+2), Backup(2), OLT(14), Uplink(3), ONU(6). No SSE/WebSocket anywhere.

### 11 Tabs + 6 Modals + Key Features
See `MIGRATION_ANALYSIS.md` for complete per-tab, per-function inventory.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Vue 3 Composition API | Modern, reactive, component-based |
| Build | Vite | Fast dev + optimized production output |
| Routing | Vue Router 4 | URL-based tab navigation, lazy loading |
| State | Pinia | Official Vue state manager, type-safe |
| Charts | Chart.js 4 + vue-chartjs | Same library, proper Vue integration |
| Styling | Scoped CSS + CSS variables | Preserve cyberpunk theme, dark/light |
| Deployment | `frontend/dist/` served by Flask | Zero backend changes for static serving |

---

## 3. Project Structure

```
frontend/
  index.html
  vite.config.js
  package.json
  src/
    main.js
    App.vue
    api.js                     # apiFetch/apiPost with 10s timeout, 401 handling
    stores/
      auth.js                  # Session, role, visible tabs, global tabs
      theme.js                 # Light/dark + chart theme colors
      health.js                # Dashboard health data, metrics history
    composables/
      usePolling.js            # Interval management with cleanup
      useChartTheme.js         # Chart.js dynamic theme
    router/
      index.js                 # Route per tab (lazy loaded)
    components/
      layout/
        AppHeader.vue
        TabBar.vue
        SettingsModal.vue
        RestartModal.vue
        ShutdownModal.vue
        ReconnectModal.vue
      dashboard/
        DiagnosticsBanner.vue
        KpiCards.vue
        ChartsGrid.vue
        ServicesMatrix.vue
        InventoryCounts.vue
      syslog/SyslogTab.vue
      snmp/SnmpTrapsTab.vue
      ping/PingMonitorTab.vue
      tftp/TftpBackupsTab.vue
      olt/
        OltConnectTab.vue
        OnuModal.vue
      uplink/UplinkTrafficTab.vue
      alerts/
        AlertsTab.vue
        EditAlertModal.vue
      users/UsersTab.vue
      logs/LogsTab.vue
      ont/OntLookupTab.vue
      shared/
        StatusBadge.vue
        DataTable.vue
        StatusMessage.vue
```

---

## 4. Migration Phases

### Phase 1: Infrastructure (this commit)
- Scaffold Vite project with Vue 3, Pinia, Vue Router
- Implement `api.js` (identical behavior to legacy apiFetch/apiPost)
- Implement Pinia stores (auth, theme, health)
- Implement App.vue shell with tab routing
- Implement TabBar with drag-and-drop persistence
- Implement all 6 modals (Settings, Restart, Shutdown, Reconnect, Onu, EditAlert)

### Phase 2: Core Tabs
- Dashboard Health (KPIs, charts, services matrix, inventory counts)
- Syslog (device grid, event pagination, charts, all-syslog)
- SNMP Traps (stats, charts, device grid, table)
- Ping Monitor (targets, latency bars, history chart)

### Phase 3: Operations Tabs
- TFTP Backups (config, files, MAC mapping)
- OLT Connect (profiles, jobs, sessions, uplink cards, ONU modal)
- Uplink Traffic (history chart)

### Phase 4: Configuration Tabs
- Alerts (Email/Telegram/Discord config, rules, log, template)
- Users (CRUD, backup/restore, password change)
- Logs (file viewer)
- ONT Lookup (serial search, Rx chart)

### Phase 5: Backend Integration
- Update `api.py` to serve `frontend/dist/` as the new dashboard
- Keep `dashboard.html` as `dashboard-legacy.html` accessible via `?legacy=1`
- Verify version injection mechanism works with Vue

---

## 5. Regression Prevention Plan

### 5.1 Feature-Parity Checklist
Every feature in the legacy dashboard maps to a Vue component. The 80+ original
functions map to composable methods, store actions, or component methods.

### 5.2 API Contract Preservation
- Zero backend changes required (Phase 5 is optional integration)
- Same endpoints, same payloads, same response shapes
- Same session cookie auth mechanism

### 5.3 Polling Behavior
- Legacy: 3 global `setInterval` loops regardless of active tab
- New: Same polling cadences (5s health, 10s syslog/traps, 10s ping)
- Improvement: Pause polling when tab is hidden (requestAnimationFrame)

### 5.4 Theme Continuity
- Same CSS variable names (--bg, --panel, --accent, --text, etc.)
- Same `localStorage('noc_theme')` key for cross-version compatibility
- Same Chart.js theme colors for dark and light modes

### 5.5 Tab Visibility / RBAC
- Admin always sees all 11 tabs
- Viewer sees only assigned tabs from `effective_visible_tabs`
- `globalVisibleTabs` from `/api/settings/ui` gates per-user permissions
- Users tab only visible to admin

### 5.6 Known Behavioral Differences (Improvements)
- Vue Router provides URL-based tab navigation (e.g., `/olt`)
- Better code splitting (each tab lazy loaded on first visit)
- Reactive state eliminates manual DOM manipulation bugs
- Scoped CSS prevents style leakage between components
