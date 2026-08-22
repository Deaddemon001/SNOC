<template>
  <main>
    <div class="panel" style="margin-top:12px">
      <div class="ph"><div class="pt">ONT Lookup</div><div class="pb2">Search by ONT serial number (uses stored polled history)</div></div>
      <div class="pb" style="display:grid;gap:12px">
        <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
          <div style="display:grid;gap:4px;min-width:260px;flex:1">
            <label class="flabel" style="margin:0">ONT Serial Number</label>
            <input v-model="serial" class="finp" placeholder="e.g. VSOL12345678" @keydown.enter="doSearch" />
          </div>
          <button class="rb" style="padding:8px 16px;font-size:11px" @click="doSearch">Search</button>
          <button class="ubtn" style="padding:8px 16px;font-size:11px" @click="clear">Clear</button>
        </div>
        <StatusMessage :msg="msg" :ok="ok" />
        <div class="panel" style="margin:0">
          <div class="ph"><div class="pt">Optical Level (Rx Power)</div><div class="pb2">{{ chartMeta }}</div></div>
          <div class="pb chart-box" style="height:260px;padding:16px">
            <Line v-if="rows.length" :data="chartData" :options="chartOpts" />
            <div v-else class="empty" style="padding:40px">No data yet. Search for an ONT serial.</div>
          </div>
        </div>
        <div class="panel" style="margin:0">
          <div class="ph"><div class="pt">History</div><div class="pb2">{{ rows.length }} records</div></div>
          <div class="tw">
            <table>
              <thead><tr><th>Time</th><th>Status</th><th>Optical (dBm)</th><th>Distance (m)</th><th>Hostname</th></tr></thead>
              <tbody>
                <tr v-if="!rows.length"><td colspan="5"><div class="empty">No records.</div></td></tr>
                <tr v-for="(r, i) in rows.slice(0, 300)" :key="i">
                  <td style="font-size:11px">{{ new Date(r.poll_time).toLocaleString() }}</td>
                  <td><span class="b" :class="(r.state || '').toLowerCase() === 'working' ? 'bg' : 'br'">{{ r.state || '-' }}</span></td>
                  <td :style="{ color: rxColor(r.rx_power) }">{{ r.rx_power != null ? r.rx_power + ' dBm' : '-' }}</td>
                  <td>{{ r.distance ?? '-' }}</td>
                  <td>{{ r.olt_name || r.olt_ip || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import { apiFetch } from '../../api'
import StatusMessage from '../shared/StatusMessage.vue'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

const serial = ref('')
const rows = ref([])
const msg = ref('')
const ok = ref(false)
const chartMeta = ref('-')

async function doSearch() {
  const sn = serial.value.trim()
  if (!sn) { msg.value = 'Enter a serial number.'; ok.value = false; return }
  try {
    const data = await apiFetch('/api/onu/history?serial_no=' + encodeURIComponent(sn))
    rows.value = Array.isArray(data) ? [...data].reverse() : []
    if (!rows.value.length) { msg.value = 'No history found for "' + sn + '".'; ok.value = false }
    else { msg.value = rows.value.length + ' records found for ' + sn; ok.value = true }
    chartMeta.value = rows.value.length ? sn + ' - Rx trend' : '-'
  } catch (e) { msg.value = e.message; ok.value = false }
}

function clear() {
  serial.value = ''
  rows.value = []
  msg.value = ''
  chartMeta.value = '-'
}

function rxColor(rx) {
  if (rx == null) return 'var(--muted)'
  if (rx > -25) return 'var(--accent3)'
  if (rx > -28) return 'var(--warn)'
  return 'var(--danger)'
}

const ct = () => ({
  tick: document.body.classList.contains('light-mode') ? '#64748b' : '#7a9aad',
  grid: document.body.classList.contains('light-mode') ? '#e2e8f0' : '#0f2a3f'
})

const chartOpts = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: ct().grid }, ticks: { color: ct().tick, maxTicksLimit: 10, font: { size: 9, family: 'Share Tech Mono' } } },
    y: { grid: { color: ct().grid }, ticks: { color: ct().tick, font: { size: 9, family: 'Share Tech Mono' } } }
  }
}

const chartData = computed(() => ({
  labels: rows.value.map(r => new Date(r.poll_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
  datasets: [{
    label: 'Rx Power (dBm)',
    data: rows.value.map(r => r.rx_power),
    borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true
  }]
}))
</script>
