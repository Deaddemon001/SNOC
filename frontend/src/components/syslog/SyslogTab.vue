<template>
  <main>
    <div class="panel">
      <div class="ph">
        <div class="pt">Syslog OLT Devices</div>
        <div class="frow">
          <select v-model="oltFilter" class="fsel" @change="loadAll">
            <option value="">All OLTs</option>
            <option v-for="dv in devices" :key="dv.olt_hostname || dv.source_ip" :value="dv.olt_hostname || dv.source_ip">{{ dv.olt_hostname || dv.source_ip }}</option>
          </select>
          <div class="pb2">{{ devices.length }}</div>
        </div>
      </div>
      <div class="ogrid">
        <div v-if="!devices.length" class="empty">No syslog devices yet.</div>
        <div v-for="dv in devices" :key="(dv.olt_hostname || '') + (dv.source_ip || '')" class="odev" @click="oltFilter = dv.olt_hostname || dv.source_ip; loadAll()">
          <div class="on">{{ dv.olt_hostname || dv.source_ip }}</div>
          <div class="om">{{ dv.source_ip }}</div>
          <div class="oc"><span class="b bc">{{ dv.event_count || 0 }} events</span><span style="font-size:10px;color:var(--muted)">last: {{ shortTime(dv.last_seen) }}</span></div>
        </div>
      </div>
    </div>

    <div class="srow">
      <div class="sc c"><div class="sl">Total Logs</div><div class="sv">{{ allSyslog.length }}</div><div class="ss">all time</div></div>
      <div class="sc r"><div class="sl">Login Events</div><div class="sv">{{ authCount }}</div><div class="ss">user logins</div></div>
      <div class="sc o"><div class="sl">Uplink Events</div><div class="sv">{{ linkCount }}</div><div class="ss">port up/down</div></div>
      <div class="sc y"><div class="sl">Last Event</div><div class="sv" style="font-size:13px;padding-top:6px">{{ lastEventTime }}</div><div class="ss">{{ lastEventTag }}</div></div>
    </div>

    <div class="crow">
      <div class="panel">
        <div class="ph"><div class="pt">Events by Type</div><div class="pb2">{{ summary.length }} types</div></div>
        <div class="pb chart-box"><Bar :data="eventChartData" :options="barOpts" /></div>
      </div>
      <div class="panel">
        <div class="ph"><div class="pt">Severity Distribution</div><div class="pb2">{{ severity.length }} levels</div></div>
        <div class="pb chart-box"><Doughnut :data="sevChartData" :options="doughnutOpts" /></div>
      </div>
    </div>

    <div class="panel">
      <div class="ph">
        <div class="pt">OLT Uplink &amp; Login Events</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="pb2">{{ events.length }} events</div>
          <div class="pb2" style="opacity:0.85">Page {{ page + 1 }}</div>
          <button class="ubtn" style="padding:6px 10px;font-size:11px" :disabled="offset === 0" @click="prevPage">Prev</button>
          <button class="rb" style="padding:6px 10px;font-size:11px" :disabled="events.length < limit" @click="nextPage">Next</button>
        </div>
      </div>
      <div class="tw">
        <table>
          <thead>
            <tr><th>Date / Time</th><th>Age</th><th>OLT</th><th>Event</th><th>Details</th><th>User / Port</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-if="!events.length"><td colspan="7"><div class="empty">No events yet.</div></td></tr>
            <template v-for="e in events" :key="e.id">
              <tr style="cursor:pointer" @click="toggle(e.id)">
                <td><div class="mu" style="font-size:11px">{{ fmtDate(e.timestamp) }}</div><div class="mu" style="font-size:11px">{{ fmtTime(e.timestamp) }}</div></td>
                <td><span style="font-size:10px;color:var(--warn)">{{ timeAgo(e.timestamp) }}</span></td>
                <td><span class="b" :class="oltBadgeClass(e.olt_hostname)">{{ e.olt_hostname || e.source_ip || 'UNKNOWN' }}</span></td>
                <td><span class="b" :class="tagClass(e.event_tag)">{{ e.event_tag || '-' }}</span></td>
                <td style="font-size:12px">{{ parseDetails(e).details }}</td>
                <td style="color:var(--accent2);font-size:11px">{{ parseDetails(e).who }}</td>
                <td style="text-align:center;color:var(--muted)">&#9662;</td>
              </tr>
              <tr v-if="expanded === e.id">
                <td colspan="7" style="background:rgba(0,229,255,0.03)">
                  <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--accent);padding:6px 10px">{{ e.message }}</div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">All Syslog</div><div class="pb2">{{ allSyslog.length }}</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>OLT</th><th>Source IP</th><th>Severity</th><th>PON</th><th>ONU SN</th><th>Message</th></tr></thead>
          <tbody>
            <tr v-if="!allSyslog.length"><td colspan="8"><div class="empty">No syslog yet.</div></td></tr>
            <tr v-for="(s, i) in allSyslog.slice(0, 200)" :key="s.id || i">
              <td>{{ i + 1 }}</td>
              <td style="font-size:11px">{{ fmtDateTime(s.timestamp) }}</td>
              <td><span class="b" :class="oltBadgeClass(s.olt_hostname)">{{ s.olt_hostname || '-' }}</span></td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:11px">{{ s.source_ip || '-' }}</td>
              <td><span class="b" :class="sevClass(s.severity)">{{ s.severity || '-' }}</span></td>
              <td>{{ s.pon || '-' }}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:11px">{{ s.onu_serial || '-' }}</td>
              <td style="font-size:12px">{{ s.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Bar, Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js'
import { apiFetch } from '../../api'
import { usePolling } from '../../composables/usePolling'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const devices = ref([])
const summary = ref([])
const severity = ref([])
const events = ref([])
const allSyslog = ref([])
const oltFilter = ref('')
const offset = ref(0)
const limit = 50
const expanded = ref(null)

const authTags = ['USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED']
const linkTags = ['UPLINK_UP', 'UPLINK_DOWN']

const authCount = computed(() => events.value.filter(e => authTags.includes(e.event_tag)).length)
const linkCount = computed(() => events.value.filter(e => linkTags.includes(e.event_tag)).length)
const lastEventTime = computed(() => events.value.length ? fmtTime(events.value[0].timestamp) : '-')
const lastEventTag = computed(() => events.value.length ? (events.value[0].event_tag || 'GENERAL') : '-')

function q() { return oltFilter.value ? '?olt_hostname=' + encodeURIComponent(oltFilter.value) : '' }

async function loadAll() {
  const query = q()
  try {
    const [devs, summ, sev] = await Promise.all([
      apiFetch('/api/syslog/devices').catch(() => []),
      apiFetch('/api/syslog/summary').catch(() => []),
      apiFetch('/api/syslog/severity').catch(() => [])
    ])
    devices.value = devs || []
    summary.value = summ || []
    severity.value = sev || []
  } catch (_) {}
  try {
    const evts = await apiFetch('/api/syslog/events' + query + (query ? '&' : '?') + 'limit=' + limit + '&offset=' + offset.value)
    events.value = Array.isArray(evts) ? evts : []
  } catch (_) {}
  try {
    const sys = await apiFetch('/api/syslog' + query)
    allSyslog.value = Array.isArray(sys) ? sys : []
  } catch (_) {}
}

usePolling(loadAll, 10000)

function nextPage() { offset.value += limit; loadEventsOnly() }
function prevPage() { offset.value = Math.max(0, offset.value - limit); loadEventsOnly() }
async function loadEventsOnly() {
  try {
    const evts = await apiFetch('/api/syslog/events' + q() + (q() ? '&' : '?') + 'limit=' + limit + '&offset=' + offset.value)
    events.value = Array.isArray(evts) ? evts : []
  } catch (_) {}
}

function toggle(id) { expanded.value = expanded.value === id ? null : id }

function parseDetails(e) {
  const msg = e.message || ''
  let m = msg.match(/Uplink-port\s+([\d\/]+)\s+(Up|Down)/i)
  if (m) return { details: `Uplink-port ${m[1]} is ${m[2].toUpperCase()}`, who: 'Port ' + m[1] }
  m = msg.match(/User\s+(\S+)\s+logged\s+(in|out)\s+from\s+([\d.]+)(?:\s+on\s+(\S+))?/i)
  if (m) {
    const via = m[4] ? m[4].toUpperCase().replace(/\./g, '') : ''
    let details = m[2].toLowerCase() === 'in' ? 'Logged IN' : 'Logged OUT'
    if (via) details += ' via ' + via
    return { details, who: `${m[1]} from ${m[3]}` }
  }
  m = msg.match(/User\s+(\S+)\s+login\s+failed\s+from\s+([\d.]+)/i)
  if (m) return { details: 'Login FAILED', who: `${m[1]} from ${m[2]}` }
  return { details: msg.substring(0, 60), who: '' }
}

function fmtDate(ts) { return ts ? new Date(ts).toLocaleDateString() : '-' }
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : '-' }
function fmtDateTime(ts) { return ts ? new Date(ts).toLocaleString() : '-' }
function shortTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : '-' }

function timeAgo(ts) {
  if (!ts) return '-'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return s + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}

function oltBadgeClass(id) {
  const colors = ['bc', 'bo', 'bg', 'by']
  const i = id ? (id.charCodeAt(id.length - 1) % 4) : 0
  return colors[i]
}
function tagClass(t) {
  const map = { UPLINK_UP: 'bg', UPLINK_DOWN: 'br', USER_LOGIN: 'bc', USER_LOGOUT: 'bo', LOGIN_FAILED: 'br' }
  return map[t] || 'bx'
}
function sevClass(s) {
  const map = { emergency: 'br', alert: 'br', critical: 'br', error: 'br', major: 'br', warning: 'by', notice: 'bc', info: 'bc' }
  return map[(s || '').toLowerCase()] || 'bx'
}

const ct = () => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
})

const barOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
  }
}))
const doughnutOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { position: 'right', labels: { color: ct().tick, font: { size: 10 } } } }
}))

const eventChartData = computed(() => ({
  labels: summary.value.slice(0, 8).map(s => s.event_tag || 'GENERAL'),
  datasets: [{ data: summary.value.slice(0, 8).map(s => s.count), backgroundColor: '#00e5ff', borderRadius: 3 }]
}))

const SEV_COLORS = ['#ff2d55', '#ff6b35', '#ffd60a', '#00e5ff', '#39ff14', '#5c7d92']
const sevChartData = computed(() => ({
  labels: severity.value.map(s => s.severity),
  datasets: [{ data: severity.value.map(s => s.count), backgroundColor: SEV_COLORS, borderWidth: 0 }]
}))
</script>
