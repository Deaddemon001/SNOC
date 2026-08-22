<template>
  <main>
    <div class="panel" style="margin-top:12px">
      <div class="ph">
        <div class="pt">Uplink Traffic History</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px">
            <label class="flabel" style="margin:0;white-space:nowrap">OLT</label>
            <select v-model="selOltId" class="fsel" style="min-width:160px" @change="onOltChange">
              <option value="">- select OLT -</option>
              <option v-for="p in profiles" :key="p.id" :value="String(p.id)">{{ p.name || p.ip }}</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label class="flabel" style="margin:0;white-space:nowrap">Port</label>
            <select v-model="selPort" class="fsel" style="min-width:180px" @change="loadHistory">
              <option value="">- select port -</option>
              <option value="__saved__">Saved ports: {{ currentProfile?.uplink_ports || '-' }}</option>
              <option v-for="p in portOptions" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label class="flabel" style="margin:0;white-space:nowrap">Range</label>
            <select v-model="selRange" class="fsel" style="min-width:140px" @change="loadHistory">
              <option value="last5">Last 5</option>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
          <div class="pb2">{{ historyTitle }}</div>
        </div>
      </div>

      <div v-if="!selOltId" class="pb"><div class="empty" style="padding:24px">Select an OLT and Port to view traffic trends.</div></div>
      <div v-else-if="!samples.length" class="pb"><div class="empty" style="padding:24px">No uplink samples yet. Use OLT Connect &rarr; Uplink to fetch data.</div></div>
      <div v-else class="pb chart-box" style="height:320px">
        <Line :data="chartData" :options="chartOpts" />
      </div>

      <div v-if="latestCards.length" style="padding:0 18px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
        <div v-for="c in latestCards" :key="c.interface" style="background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:8px;padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--accent)">{{ c.interface }}</div>
            <span class="b" :class="c.link_status === 'up' ? 'bg' : 'br'">{{ (c.link_status || 'unknown').toUpperCase() }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div>RX rate:<br><strong style="color:var(--accent3)">{{ fmtRate(c.rx_rate_kbps ?? c.rx_kbps) }}</strong></div>
            <div>TX rate:<br><strong style="color:var(--accent2)">{{ fmtRate(c.tx_rate_kbps ?? c.tx_kbps) }}</strong></div>
            <div>RX total:<br><strong>{{ fmtBytes(c.rx_bytes ?? c.rx_total) }}</strong></div>
            <div>TX total:<br><strong>{{ fmtBytes(c.tx_bytes ?? c.tx_total) }}</strong></div>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:8px">@ {{ new Date(c.poll_time).toLocaleString() }}</div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { apiFetch } from '../../api'
import { usePolling } from '../../composables/usePolling'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const profiles = ref([])
const selOltId = ref('')
const selPort = ref('')
const selRange = ref('last5')
const samples = ref([])
const latestCards = ref([])

const currentProfile = computed(() => profiles.value.find(p => String(p.id) === selOltId.value))

const portOptions = computed(() => {
  const ports = []
  for (let i = 1; i <= 16; i++) ports.push('gigabitethernet 0/' + i)
  const saved = (currentProfile.value?.uplink_ports || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  saved.forEach(s => { if (!ports.includes(s)) ports.unshift(s) })
  return ports
})

const historyTitle = computed(() => {
  if (!selOltId.value) return 'Select OLT and Port to view trends'
  const p = currentProfile.value
  const iface = selPort.value && selPort.value !== '__saved__' ? ' - ' + selPort.value : ''
  const rangeLabel = { last5: 'last 5 samples', day: 'hourly (24h)', week: 'daily (7d)', month: 'daily (30d)' }[selRange.value]
  return (p ? (p.name || p.ip) : '') + iface + ' - ' + rangeLabel
})

function onOltChange() {
  selPort.value = ''
  latestCards.value = []
  samples.value = []
  loadLatest()
}

async function loadLatest() {
  if (!currentProfile.value) return
  try {
    const stats = await apiFetch('/api/olt/uplink_latest?ip=' + encodeURIComponent(currentProfile.value.ip))
    latestCards.value = Array.isArray(stats) ? stats.slice(0, 4) : []
  } catch (_) {}
}

async function loadHistory() {
  if (!currentProfile.value || !selPort.value) { samples.value = []; return }
  const ip = currentProfile.value.ip
  const iface = selPort.value !== '__saved__' ? selPort.value : ''
  let url
  if (['day', 'week', 'month'].includes(selRange.value)) {
    url = '/api/olt/uplink_aggregate?ip=' + encodeURIComponent(ip) + '&range=' + encodeURIComponent(selRange.value)
    if (iface) url += '&interface=' + encodeURIComponent(iface)
  } else {
    url = '/api/olt/uplink_stats?ip=' + encodeURIComponent(ip) + '&limit=5'
    if (iface) url += '&interface=' + encodeURIComponent(iface)
  }
  try {
    const rows = await apiFetch(url)
    samples.value = Array.isArray(rows) ? rows : []
  } catch (_) { samples.value = [] }
}

usePolling(() => { if (selOltId.value) { loadLatest(); if (selPort.value) loadHistory() } }, 30000)

function fmtRate(kbps) {
  if (kbps == null) return '-'
  const v = parseFloat(kbps)
  if (v >= 1000) return (v / 1000).toFixed(2) + ' Mbps'
  return v.toFixed(1) + ' Kbps'
}
function fmtBytes(b) {
  if (b == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = parseFloat(b), u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return v.toFixed(2) + ' ' + units[u]
}

const ct = () => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
})

const chartOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { labels: { color: ct().tick, font: { size: 10 } } } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true, title: { display: true, text: 'Kbps', color: ct().tick, font: { size: 10 } } }
  }
}))

const chartData = computed(() => {
  const rows = [...samples.value].reverse()
  return {
    labels: rows.map(r => new Date(r.poll_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    datasets: [
      { label: 'RX Kbps', data: rows.map(r => r.rx_rate_kbps ?? r.rx_kbps ?? null), borderColor: '#39ff14', backgroundColor: 'rgba(57,255,20,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
      { label: 'TX Kbps', data: rows.map(r => r.tx_rate_kbps ?? r.tx_kbps ?? null), borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.05)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true }
    ]
  }
})

async function init() {
  try {
    const p = await apiFetch('/api/olt/profiles')
    profiles.value = Array.isArray(p) ? p : []
  } catch (_) {}
}
init()

window.addEventListener('noc-uplink-updated', () => { if (selOltId.value) { loadLatest(); if (selPort.value) loadHistory() } })
</script>
