<template>
  <main>
    <div class="srow">
      <div class="sc g"><div class="sl">Online</div><div class="sv">{{ online }}</div><div class="ss">reachable</div></div>
      <div class="sc r"><div class="sl">Offline</div><div class="sv">{{ offline }}</div><div class="ss">unreachable</div></div>
      <div class="sc y"><div class="sl">High Latency</div><div class="sv">{{ highLat }}</div><div class="ss">&gt;100ms</div></div>
      <div class="sc c"><div class="sl">Total Targets</div><div class="sv">{{ targets.length }}</div><div class="ss">monitored</div></div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">Add IP Target</div></div>
      <div style="padding:14px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
        <div><label class="flabel">IP ADDRESS</label><input v-model="newIp" class="finp" style="width:180px" placeholder="e.g. 192.168.1.1" :disabled="!auth.isAdmin" /></div>
        <div><label class="flabel">LABEL (optional)</label><input v-model="newName" class="finp" style="width:180px" placeholder="e.g. Core Router" :disabled="!auth.isAdmin" /></div>
        <div><label class="flabel">WEBSITE</label><input v-model="newWebsite" class="finp" style="width:240px" placeholder="e.g. https://192.168.1.1" :disabled="!auth.isAdmin" /></div>
        <button class="rb" style="padding:8px 20px;font-size:13px" :disabled="!auth.isAdmin" @click="addTarget">{{ auth.isAdmin ? '+ ADD' : 'VIEW ONLY' }}</button>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">IP Monitor</div><div class="pb2">{{ targets.length }} targets</div></div>
      <div style="padding:0;overflow-x:auto">
        <table class="ping-table">
          <thead>
            <tr>
              <th style="width:90px;text-align:left">Status</th>
              <th style="width:50px;text-align:center">Count</th>
              <th style="width:150px">IP Address</th>
              <th>Name</th>
              <th style="width:65px;text-align:right">Avg</th>
              <th style="width:65px;text-align:right">Min</th>
              <th style="width:65px;text-align:right">Cur</th>
              <th style="width:55px;text-align:right">PL%</th>
              <th style="width:150px">Latency</th>
              <th style="width:110px">Last Seen</th>
              <th style="width:110px;text-align:center">Website</th>
              <th v-if="auth.isAdmin" style="width:110px;text-align:center">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!targets.length"><td :colspan="auth.isAdmin ? 12 : 11"><div class="empty">No targets added yet. Add an IP above.</div></td></tr>
            <tr v-for="t in sortedTargets" :key="t.ip" :class="{ selected: selectedIp === t.ip }" style="cursor:pointer" @click="showHistory(t)">
              <td style="text-align:center;white-space:nowrap">
                <span class="ping-dot" :class="t.status || 'unknown'" style="margin-right:5px;vertical-align:middle"></span>
                <span :style="{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: statusColor(t.status) }">{{ statusText(t.status) }}</span>
              </td>
              <td style="text-align:center;color:var(--muted);font-size:11px">{{ t.ping_count || '-' }}</td>
              <td style="font-family:'Share Tech Mono',monospace;font-size:12px">{{ t.ip }}</td>
              <td>{{ t.name || t.ip }}</td>
              <td style="text-align:right" :style="{ color: latColor(t.avg_latency) }">{{ latStr(t.avg_latency) }}</td>
              <td style="text-align:right;color:var(--accent3)">{{ latStr(t.min_latency) }}</td>
              <td style="text-align:right" :style="{ color: latColor(t.latency_ms) }">{{ latStr(t.latency_ms) }}</td>
              <td style="text-align:right" :style="{ color: lossColor(t.loss_pct) }">{{ lossStr(t.loss_pct) }}</td>
              <td>
                <div class="lat-bar-wrap">
                  <div class="lat-bar" :style="{ width: latBarPct(t) + '%', background: latColor(t.latency_ms) }"></div>
                </div>
              </td>
              <td style="font-size:10px;color:var(--muted)">{{ t.last_seen ? new Date(t.last_seen).toLocaleString() : '-' }}</td>
              <td style="text-align:center">
                <a v-if="t.website" :href="normalizeUrl(t.website)" target="_blank" rel="noopener" class="ubtn" style="padding:2px 8px;font-size:10px" @click.stop>Open</a>
                <span v-else style="color:var(--muted);font-size:10px">-</span>
              </td>
              <td v-if="auth.isAdmin" style="text-align:center;white-space:nowrap">
                <button class="ubtn" style="padding:2px 8px;font-size:10px;margin-right:4px" @click.stop="renameTarget(t)">Rename</button>
                <button class="lbtn" style="padding:2px 8px;font-size:10px" @click.stop="removeTarget(t)">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">Latency History</div><div class="pb2">{{ histLabel }}</div></div>
      <div class="pb chart-box" style="max-height:220px"><Line :data="histData" :options="histOpts" /></div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const auth = useAuthStore()
const targets = ref([])
const newIp = ref('')
const newName = ref('')
const newWebsite = ref('')
const selectedIp = ref('')
const histLabel = ref('click a target row')
const histRows = ref([])

const sortedTargets = computed(() => {
  return [...targets.value].sort((a, b) => {
    if (a.status === 'offline' && b.status !== 'offline') return -1
    if (b.status === 'offline' && a.status !== 'offline') return 1
    return (a.name || a.ip).localeCompare(b.name || b.ip)
  })
})
const online = computed(() => targets.value.filter(t => t.status === 'online').length)
const offline = computed(() => targets.value.filter(t => t.status === 'offline').length)
const highLat = computed(() => targets.value.filter(t => t.latency_ms && t.latency_ms > 100).length)

async function load() {
  try { targets.value = await apiFetch('/api/ping/targets') } catch (_) {}
}
usePolling(load, 10000)

async function addTarget() {
  const ip = newIp.value.trim()
  if (!ip) { alert('Enter an IP address'); return }
  try {
    await apiPost('/api/ping/add', { ip, name: newName.value.trim(), website: newWebsite.value.trim() })
    newIp.value = ''; newName.value = ''; newWebsite.value = ''
    load()
  } catch (e) { alert(e.message) }
}

async function removeTarget(t) {
  if (!confirm('Remove ' + (t.name || t.ip) + ' from monitoring?')) return
  try { await apiPost('/api/ping/remove', { ip: t.ip }); load() } catch (e) { alert(e.message) }
}

async function renameTarget(t) {
  const newNameVal = prompt('New label for ' + t.ip, t.name && t.name !== t.ip ? t.name : '')
  if (newNameVal === null) return
  const newWebsiteVal = prompt('New website URL for ' + t.ip + ' (blank to clear)', t.website || '')
  if (newWebsiteVal === null) return
  try {
    await apiPost('/api/ping/rename', { ip: t.ip, name: (newNameVal || '').trim(), website: (newWebsiteVal || '').trim() })
    load()
  } catch (e) { alert(e.message) }
}

async function showHistory(t) {
  selectedIp.value = t.ip
  histLabel.value = (t.name || t.ip) + ' (' + t.ip + ')'
  try {
    const rows = await apiFetch('/api/ping/history/' + encodeURIComponent(t.ip))
    histRows.value = [...rows].reverse()
  } catch (_) { histRows.value = [] }
}

function statusColor(s) { return s === 'online' ? 'var(--accent3)' : s === 'offline' ? 'var(--danger)' : 'var(--warn)' }
function statusText(s) { return s === 'online' ? 'Online' : s === 'offline' ? 'Offline' : 'Unknown' }
function latColor(ms) { if (!ms) return 'var(--muted)'; if (ms < 50) return 'var(--accent3)'; if (ms < 100) return 'var(--warn)'; return 'var(--danger)' }
function latStr(ms) { return ms ? parseFloat(ms).toFixed(1) + ' ms' : '-' }
function lossColor(l) { const v = parseFloat(l) || 0; return v > 20 ? 'var(--danger)' : v > 5 ? 'var(--warn)' : 'var(--accent3)' }
function lossStr(l) { const v = parseFloat(l) || 0; return v.toFixed(1) + '%' }
function latBarPct(t) {
  const maxLat = Math.max(200, (t.avg_latency || t.latency_ms || 50) * 3)
  return Math.min(100, ((t.latency_ms || 0) / maxLat) * 100)
}
function normalizeUrl(u) { const v = (u || '').trim(); if (!v) return ''; return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : 'http://' + v }

const ct = () => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
})

const histOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
  }
}))

const histData = computed(() => ({
  labels: histRows.value.map(r => new Date(r.timestamp).toLocaleTimeString()),
  datasets: [{
    data: histRows.value.map(r => r.latency_ms),
    borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.06)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true
  }]
}))
</script>

<style scoped>
.lat-bar-wrap { height: 6px; background: rgba(0,229,255,0.06); border-radius: 3px; overflow: hidden; }
.lat-bar { height: 100%; border-radius: 3px; transition: width .3s ease; }
tr.selected td { background: rgba(0,229,255,0.05); }
</style>
