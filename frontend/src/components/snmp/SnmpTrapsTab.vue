<template>
  <main>
    <div class="srow">
      <div class="sc c"><div class="sl">Total Traps</div><div class="sv">{{ totalTraps }}</div><div class="ss">all time</div></div>
      <div class="sc g"><div class="sl">Online OLTs</div><div class="sv">{{ onlineCount }}</div><div class="ss">active now</div></div>
      <div class="sc r"><div class="sl">Offline OLTs</div><div class="sv">{{ offlineCount }}</div><div class="ss">no trap 2+ min</div></div>
      <div class="sc o"><div class="sl">Last Trap</div><div class="sv" style="font-size:14px;padding-top:4px">{{ lastTrapTime }}</div><div class="ss">{{ lastTrapOlt }}</div></div>
    </div>

    <div class="crow">
      <div class="panel">
        <div class="ph"><div class="pt">Traps Per OLT</div><div class="pb2">{{ summary.length }} OLTs</div></div>
        <div class="pb chart-box"><Bar :data="barData" :options="barOpts" /></div>
      </div>
      <div class="panel">
        <div class="ph"><div class="pt">Trap Volume</div><div class="pb2">{{ traps.length }} records</div></div>
        <div class="pb chart-box"><Line :data="lineData" :options="lineOpts" /></div>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">OLT Device Status</div><div class="pb2">{{ devices.length }} devices</div></div>
      <div class="ogrid">
        <div v-if="!devices.length" class="empty">No OLTs seen yet.</div>
        <div v-for="dv in devices" :key="dv.olt_mac" class="oc" :class="dv.status">
          <div class="otop">
            <div>
              <div class="oname">{{ deviceName(dv) }}</div>
              <div style="margin-top:3px"><span class="b" :class="oltBadgeClass(dv.olt_id)">{{ dv.olt_id || 'UNKNOWN' }}</span></div>
            </div>
            <div class="pill" :class="dv.status">{{ dv.status || 'unknown' }}</div>
          </div>
          <div class="om">MAC: <span>{{ dv.olt_mac || '-' }}</span></div>
          <div class="om">IP: <span>{{ dv.source_ip || '-' }}</span></div>
          <div class="om">Last seen: <span>{{ dv.last_seen ? new Date(dv.last_seen).toLocaleString() : 'Never' }}</span></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="ph"><div class="pt">Recent Traps</div><div class="pb2">{{ traps.length }} records</div></div>
      <div class="tw">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>OLT</th><th>Source IP</th><th>OID</th><th>Value</th></tr></thead>
          <tbody>
            <tr v-if="!traps.length"><td colspan="6"><div class="empty">No traps yet.</div></td></tr>
            <tr v-for="t in traps.slice(0, 50)" :key="t.id">
              <td class="mu">{{ t.id }}</td>
              <td class="mu">{{ new Date(t.timestamp).toLocaleTimeString() }}</td>
              <td><span class="b" :class="oltBadgeClass(nameMap[t.olt_mac] || t.olt_id)">{{ nameMap[t.olt_mac] || t.olt_id || '?' }}</span></td>
              <td><span class="b bc">{{ t.source_ip }}</span></td>
              <td style="color:var(--accent3)">{{ t.oid_name || t.oid }}</td>
              <td class="mu">{{ (t.value || '').substring(0, 40) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import { apiFetch } from '../../api'
import { usePolling } from '../../composables/usePolling'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip)

const traps = ref([])
const summary = ref([])
const devices = ref([])
const nameMap = ref({})

const totalTraps = computed(() => summary.value.reduce((a, s) => a + s.count, 0).toLocaleString())
const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)
const offlineCount = computed(() => devices.value.filter(d => d.status === 'offline').length)
const lastTrapTime = computed(() => traps.value.length ? new Date(traps.value[0].timestamp).toLocaleTimeString() : '-')
const lastTrapOlt = computed(() => traps.value.length ? (nameMap.value[traps.value[0].olt_mac] || traps.value[0].olt_id || traps.value[0].source_ip || '-') : '-')

function deviceName(dv) { return (dv.name && dv.name !== dv.olt_id) ? dv.name : dv.olt_id }

async function load() {
  try {
    const [t, s, dv] = await Promise.all([
      apiFetch('/api/traps').catch(() => []),
      apiFetch('/api/traps/summary').catch(() => []),
      apiFetch('/api/devices').catch(() => [])
    ])
    traps.value = Array.isArray(t) ? t : []
    summary.value = Array.isArray(s) ? s : []
    devices.value = Array.isArray(dv) ? dv : []
    const nm = {}
    devices.value.forEach(d => { nm[d.olt_mac] = (d.name && d.name !== d.olt_id) ? d.name : d.olt_id })
    nameMap.value = nm
  } catch (_) {}
}

usePolling(load, 10000)

function oltBadgeClass(id) {
  const colors = ['bc', 'bo', 'bg', 'by']
  const i = id ? (id.charCodeAt(id.length - 1) % 4) : 0
  return colors[i]
}

const ct = () => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
})

const barOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
  }
}))
const lineOpts = computed(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } }, beginAtZero: true }
  }
}))

const barData = computed(() => ({
  labels: summary.value.map(s => nameMap.value[s.olt_mac] || s.olt_id || s.olt_mac),
  datasets: [{ data: summary.value.map(s => s.count), backgroundColor: '#00e5ff', borderRadius: 3 }]
}))

const lineData = computed(() => {
  const grouped = {}
  traps.value.slice(0, 60).reverse().forEach(t => {
    const min = (t.timestamp || '').substring(11, 16)
    grouped[min] = (grouped[min] || 0) + 1
  })
  return {
    labels: Object.keys(grouped),
    datasets: [{ data: Object.values(grouped), borderColor: '#ff6b35', backgroundColor: 'rgba(255,107,53,0.08)', borderWidth: 2, pointRadius: 2, tension: 0.35, fill: true }]
  }
})
</script>
