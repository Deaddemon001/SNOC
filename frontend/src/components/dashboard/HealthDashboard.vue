<template>
  <main>
    <!-- Diagnostic Hero Banner -->
    <div class="dash-diag-banner" :class="statusClass">
      <div class="dash-diag-left">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span class="dash-diag-badge" :class="statusClass">{{ statusText }}</span>
            <span style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted)">{{ hostInfo }}</span>
          </div>
          <div class="dash-diag-title">System &amp; Application Status Overview</div>
          <div class="dash-diag-desc"><strong>{{ diag.headline }}</strong> &mdash; {{ diag.verdict || 'Analyzing Smart NOC background services, processes, and database connectivity...' }}</div>
        </div>
      </div>
      <div class="dash-diag-actions">
        <button v-if="auth.isAdmin" class="btn-power-restart" @click="openRestart('all')">&#8635; Restart Smart NOC</button>
        <button v-if="auth.isAdmin" class="btn-power-shutdown" @click="openShutdown">&#9211; Shutdown</button>
        <button class="rbtn" @click="refresh(true)">&#9764; Health Check</button>
      </div>
    </div>

    <!-- 5 KPI Cards -->
    <div class="dash-kpis-5">
      <div class="dash-kpi-card">
        <div class="dash-kpi-head"><span class="dash-kpi-lbl">CPU Processing Power</span><span class="dash-kpi-icon">&#9889;</span></div>
        <div class="dash-kpi-val">{{ kpi.appCpu.toFixed(1) }}%</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" :style="{ width: kpiBarCpu + '%', background: 'var(--accent)' }"></div></div>
        <div class="dash-kpi-sub"><span>App CPU Load</span><span>System: {{ kpi.sysCpu.toFixed(1) }}%</span></div>
      </div>
      <div class="dash-kpi-card">
        <div class="dash-kpi-head"><span class="dash-kpi-lbl">Memory Usage</span><span class="dash-kpi-icon">&#128506;</span></div>
        <div class="dash-kpi-val">{{ kpi.appRamMb.toFixed(0) }} MB</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" :style="{ width: kpiBarRam + '%', background: 'var(--warn)' }"></div></div>
        <div class="dash-kpi-sub"><span>App RSS</span><span>System: {{ kpi.sysRamPct.toFixed(1) }}% of {{ fmtGb(kpi.sysRamTotalMb) }}</span></div>
      </div>
      <div class="dash-kpi-card">
        <div class="dash-kpi-head"><span class="dash-kpi-lbl">Disk &amp; Storage</span><span class="dash-kpi-icon">&#128190;</span></div>
        <div class="dash-kpi-val">{{ kpi.diskFreeGb.toFixed(1) }} GB free</div>
        <div class="kpi-bar"><div class="kpi-bar-fill" :style="{ width: Math.min(100, Math.max(2, kpi.diskFreePct)) + '%', background: 'var(--accent3)' }"></div></div>
        <div class="dash-kpi-sub"><span>{{ kpi.diskFreePct.toFixed(0) }}% drive free</span><span>App: {{ fmtMb(kpi.appStorageMb) }}</span></div>
      </div>
      <div class="dash-kpi-card">
        <div class="dash-kpi-head"><span class="dash-kpi-lbl">Network I/O</span><span class="dash-kpi-icon">&#127760;</span></div>
        <div class="dash-kpi-val">{{ netTotal }} KB/s</div>
        <div class="kpi-bar"><div class="net-split"><span :style="{ flex: netInFlex }"></span><span :style="{ flex: netOutFlex }"></span></div></div>
        <div class="dash-kpi-sub"><span>RX {{ kpi.netIn.toFixed(1) }}</span><span>TX {{ kpi.netOut.toFixed(1) }} KB/s</span></div>
      </div>
      <div class="dash-kpi-card">
        <div class="dash-kpi-head"><span class="dash-kpi-lbl">24/7 Uptime</span><span class="dash-kpi-icon">&#9201;</span></div>
        <div class="dash-kpi-val" style="font-size:20px">{{ kpi.uptimeFmt }}</div>
        <div class="dash-kpi-sub"><span>PID {{ kpi.pid }}</span><span>{{ kpi.threads }} threads</span></div>
      </div>
    </div>

    <!-- 4 Charts -->
    <div class="dash-charts-grid">
      <div class="panel chart-panel">
        <div class="ph"><div class="pt">CPU &amp; RAM Trend</div></div>
        <div class="chart-box"><Line :data="trendData" :options="lineOpts" /></div>
      </div>
      <div class="panel chart-panel">
        <div class="ph"><div class="pt">System RAM Allocation</div></div>
        <div class="chart-box"><Doughnut :data="ramDoughnutData" :options="doughnutOpts" /></div>
      </div>
      <div class="panel chart-panel">
        <div class="ph"><div class="pt">App Storage Distribution</div></div>
        <div class="chart-box"><Doughnut :data="storageDoughnutData" :options="doughnutOpts" /></div>
      </div>
      <div class="panel chart-panel">
        <div class="ph"><div class="pt">Network Throughput</div></div>
        <div class="chart-box"><Line :data="netData" :options="lineOpts" /></div>
      </div>
    </div>

    <!-- Services Matrix -->
    <div class="panel" style="margin-bottom:16px">
      <div class="ph">
        <div class="pt">Background Services &amp; Processes Matrix</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="pb2" :style="{ color: servicesSummaryColor }">{{ servicesSummary }}</div>
          <button class="ubtn" style="padding:3px 10px;font-size:11px" @click="refresh(true)">&#8634; Refresh</button>
        </div>
      </div>
      <div class="tw">
        <table>
          <thead>
            <tr>
              <th style="width:220px">Service / Component</th>
              <th style="width:160px">Script &amp; Protocol</th>
              <th style="width:140px">Port(s)</th>
              <th style="width:110px">Status</th>
              <th style="width:80px">PID</th>
              <th style="width:90px;text-align:right">Memory</th>
              <th style="width:80px;text-align:right">CPU %</th>
              <th style="width:110px">Uptime</th>
              <th>Heartbeat (5m)</th>
              <th v-if="auth.isAdmin" style="width:110px;text-align:center">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!services.length"><td :colspan="auth.isAdmin ? 10 : 9"><div class="empty">Loading services status...</div></td></tr>
            <tr v-for="s in services" :key="s.key">
              <td>{{ s.name }}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:11px">{{ s.script }}</td>
              <td>{{ s.ports }}</td>
              <td><span class="b" :class="s.running ? 'bg' : 'br'" style="font-size:10px">{{ s.running ? 'HEALTHY' : 'STOPPED' }}</span></td>
              <td>{{ s.pids }}</td>
              <td style="text-align:right">{{ s.mem }}</td>
              <td style="text-align:right">{{ s.cpu }}</td>
              <td>{{ s.uptime }}</td>
              <td>{{ s.heartbeat }}</td>
              <td v-if="auth.isAdmin" style="text-align:center">
                <span v-if="s.key === 'postgres'" style="font-size:10px;color:var(--muted)">System DB</span>
                <button v-else class="btn-service-restart" @click="restartService(s.key)">&#8635;</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inventory Counts -->
    <div class="srow">
      <div class="sc c"><div class="sl">Traps Ingested</div><div class="sv">{{ counts.traps }}</div><div class="ss">SNMP receiver</div></div>
      <div class="sc g"><div class="sl">Syslog Messages</div><div class="sv">{{ counts.syslog }}</div><div class="ss">device events</div></div>
      <div class="sc y"><div class="sl">Monitored Sites</div><div class="sv">{{ counts.ping_targets }}</div><div class="ss">ping targets</div></div>
      <div class="sc o"><div class="sl">TFTP Backups</div><div class="sv">{{ counts.tftp }}</div><div class="ss">stored backups</div></div>
      <div class="sc p"><div class="sl">OLT Profiles</div><div class="sv">{{ counts.olt }}</div><div class="ss">configured OLTs</div></div>
      <div class="sc r"><div class="sl">Alert Rules</div><div class="sv">{{ counts.alerts }}</div><div class="ss">active rules</div></div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { Line, Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'
import { inject } from 'vue'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

const auth = useAuthStore()
const openRestart = inject('openRestart')
const openShutdown = inject('openShutdown')

const d = ref(null)
const history = reactive({ labels: [], cpu: [], ram: [], netIn: [], netOut: [] })
const MAX_POINTS = 30

const statusClass = computed(() => {
  const s = (d.value?.overall_status || 'optimal').toLowerCase()
  return s === 'optimal' ? 'optimal' : s === 'warning' ? 'warning' : 'critical'
})
const statusText = computed(() =>
  ({ optimal: '\u{1F7E2} OPTIMAL HEALTH', warning: '\u{1F7E1} ATTENTION REQUIRED', critical: '\u{1F534} ACTION REQUIRED' }[statusClass.value] || '\u{1F7E2} OPTIMAL HEALTH'))

const hostInfo = computed(() => {
  const sys = d.value?.system
  if (!sys) return 'Checking system...'
  return `Host: ${sys.hostname || 'Local'} (${sys.os || 'Windows'}) \u2022 Python ${d.value?.process?.python_version || '3.x'} \u2022 ${sys.cpu_count || 4} Cores`
})

const diag = computed(() => d.value?.diagnostic || {})

const kpi = computed(() => ({
  appCpu: d.value?.process?.cpu_percent ?? 0,
  sysCpu: d.value?.system?.cpu_percent ?? 0,
  appRamMb: d.value?.process?.memory_rss_mb ?? 0,
  sysRamPct: d.value?.system?.memory_percent ?? 0,
  sysRamUsedMb: d.value?.system?.memory_used_mb ?? 0,
  sysRamTotalMb: d.value?.system?.memory_total_mb ?? 1,
  diskFreeGb: d.value?.disk?.drive_free_gb ?? 0,
  diskFreePct: d.value?.disk?.drive_percent_free ?? 0,
  appStorageMb: d.value?.disk?.app_total_mb ?? 0,
  netIn: d.value?.network?.net_in_rate_kb ?? 0,
  netOut: d.value?.network?.net_out_rate_kb ?? 0,
  uptimeFmt: d.value?.uptime?.formatted || '0m',
  pid: d.value?.process?.pid || '-',
  threads: d.value?.process?.threads_count || 0
}))

const kpiBarCpu = computed(() => Math.min(100, Math.max(2, kpi.value.appCpu)))
const kpiBarRam = computed(() => {
  const pct = kpi.value.sysRamTotalMb > 0 ? (kpi.value.appRamMb / kpi.value.sysRamTotalMb) * 100 : 0
  return Math.min(100, Math.max(2, pct))
})
const netTotal = computed(() => (kpi.value.netIn + kpi.value.netOut).toFixed(1))
const netInFlex = computed(() => Math.max(1, kpi.value.netIn))
const netOutFlex = computed(() => Math.max(1, kpi.value.netOut))

function fmtGb(mb) { return (mb / 1024).toFixed(1) + ' GB' }
function fmtMb(mb) { return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB' }

const services = computed(() => {
  const svcs = d.value?.services
  if (!svcs) return []
  return Object.keys(svcs).map(key => {
    const s = svcs[key]
    return {
      key,
      name: s.display_name || key.toUpperCase(),
      script: s.script || '-',
      ports: s.ports || '-',
      running: !!s.running,
      pids: (s.pids && s.pids.length) ? s.pids.join(', ') : '-',
      mem: (s.memory_rss_mb && s.memory_rss_mb > 0) ? s.memory_rss_mb.toFixed(1) + ' MB' : '-',
      cpu: (s.cpu_percent !== undefined && s.running) ? s.cpu_percent.toFixed(1) + '%' : '-',
      uptime: s.uptime_formatted || (s.running ? 'Active' : '-'),
      heartbeat: s.last_heartbeat_ago || '-'
    }
  })
})

const activeCount = computed(() => services.value.filter(s => s.running).length)
const servicesSummary = computed(() => `${activeCount.value} of ${services.value.length} Services Active`)
const servicesSummaryColor = computed(() =>
  activeCount.value === services.value.length && services.value.length > 0 ? 'var(--accent3)' : 'var(--warn)')

const counts = computed(() => {
  const c = d.value?.counts || {}
  const f = v => (v !== undefined && v !== null) ? Number(v).toLocaleString() : '-'
  return {
    traps: f(c.traps), syslog: f(c.syslog), ping_targets: f(c.ping_targets),
    tftp: f(c.tftp), olt: f(c.olt), alerts: f(c.alert_rules)
  }
})

async function refresh(manual = false) {
  try {
    const nd = await apiFetch('/api/system/health_detailed')
    d.value = nd
    const t = new Date().toLocaleTimeString()
    history.labels.push(t)
    history.cpu.push(kpi.value.appCpu)
    history.ram.push(kpi.value.appRamMb)
    history.netIn.push(kpi.value.netIn)
    history.netOut.push(kpi.value.netOut)
    for (const k of ['labels', 'cpu', 'ram', 'netIn', 'netOut']) {
      if (history[k].length > MAX_POINTS) history[k].shift()
    }
  } catch (_) { /* keep last good data */ }
}

usePolling(() => refresh(false), 5000)

async function restartService(svc) {
  if (!confirm(`Restart service "${svc.toUpperCase()}"?`)) return
  try {
    await apiPost('/api/system/service_action', { action: 'restart', service: svc })
    refresh(true)
  } catch (e) { alert('Restart failed: ' + e.message) }
}

const ct = computed(() => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
}))

const lineOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { labels: { color: ct.value.tick, font: { size: 10 } } } },
  scales: {
    x: { grid: { color: ct.value.grid }, ticks: { color: ct.value.tick, maxTicksLimit: 8, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct.value.grid }, ticks: { color: ct.value.tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
  }
}))

const doughnutOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false, cutout: '62%',
  plugins: { legend: { position: 'right', labels: { color: ct.value.tick, font: { size: 10 } } } }
}))

const trendData = computed(() => ({
  labels: [...history.labels],
  datasets: [
    { label: 'App CPU %', data: [...history.cpu], borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
    { label: 'App RAM MB', data: [...history.ram], borderColor: '#ffd60a', backgroundColor: 'rgba(255,214,10,0.05)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true }
  ]
}))

const netData = computed(() => ({
  labels: [...history.labels],
  datasets: [
    { label: 'RX KB/s', data: [...history.netIn], borderColor: '#39ff14', backgroundColor: 'rgba(57,255,20,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
    { label: 'TX KB/s', data: [...history.netOut], borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true }
  ]
}))

const ramDoughnutData = computed(() => {
  const total = kpi.value.sysRamTotalMb
  const used = kpi.value.sysRamUsedMb
  return {
    labels: ['Used', 'Free'],
    datasets: [{ data: [used, Math.max(0, total - used)], backgroundColor: ['#00e5ff', '#12324a'], borderWidth: 0 }]
  }
})

const storageDoughnutData = computed(() => {
  const st = d.value?.disk?.storage_breakdown
  if (st && typeof st === 'object') {
    const entries = Object.entries(st)
    if (entries.length) {
      return {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: ['#00e5ff', '#ff6b35', '#39ff14', '#ffd60a', '#5c7d92', '#ff2d55'], borderWidth: 0 }]
      }
    }
  }
  return { labels: ['App Data'], datasets: [{ data: [kpi.value.appStorageMb || 1], backgroundColor: ['#00e5ff'], borderWidth: 0 }] }
})
</script>

<style scoped>
main { padding: 12px 16px; }
.chart-panel { min-height: 260px; display: flex; flex-direction: column; }
.chart-box { flex: 1; position: relative; min-height: 200px; padding: 8px; }
.dash-charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 16px; }
.kpi-bar { height: 5px; background: rgba(0,229,255,0.08); border-radius: 3px; overflow: hidden; margin: 8px 0 6px; }
.kpi-bar-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
.net-split { display: flex; height: 5px; border-radius: 3px; overflow: hidden; gap: 2px; }
.net-split span:first-child { background: var(--accent3); }
.net-split span:last-child { background: var(--accent2); }
.btn-service-restart { background: rgba(0,229,255,0.08); border: 1px solid var(--border); color: var(--accent); border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 11px; }
.btn-service-restart:hover { border-color: var(--accent); }
</style>
