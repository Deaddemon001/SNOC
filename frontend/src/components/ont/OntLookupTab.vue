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

        <div v-if="latest" class="srow" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:4px 0">
          <div class="sc" :class="isOnline(latest) ? 'g' : 'r'">
            <div class="sl">Latest Status</div>
            <div class="sv" style="font-size:18px;display:flex;align-items:center;gap:6px;padding-top:4px">
              <span :style="statusDotStyle(latest)"></span>
              {{ isOnline(latest) ? 'ONLINE' : 'OFFLINE' }}
            </div>
            <div class="ss">{{ latest.phase_state || (isOnline(latest) ? 'working' : 'offline') }}</div>
          </div>
          <div class="sc o">
            <div class="sl">Optical Distance</div>
            <div class="sv" style="font-size:16px;padding-top:6px">{{ formatDistance(latest.distance_m ?? latest.distance) }}</div>
            <div class="ss">last measurement</div>
          </div>
          <div class="sc c">
            <div class="sl">Optical Rx Power</div>
            <div class="sv" :style="{ color: rxColor(latest.rx_power), fontSize: '18px', paddingTop: '4px' }">
              {{ latest.rx_power != null ? Number(latest.rx_power).toFixed(2) + ' dBm' : '—' }}
            </div>
            <div class="ss">Rx sensitivity</div>
          </div>
          <div class="sc g">
            <div class="sl">OLT & Port</div>
            <div class="sv" style="font-size:14px;padding-top:6px">{{ latest.olt_name || latest.olt_ip || '—' }}</div>
            <div class="ss">{{ latest.pon_port ? 'PON ' + latest.pon_port : 'ONU #' + (latest.onu_id || '?') }}</div>
          </div>
        </div>

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
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Optical (Rx dBm)</th>
                  <th>Distance</th>
                  <th>OLT Name</th>
                  <th>OLT IP</th>
                  <th>PON Port</th>
                  <th>ONU ID</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!rows.length"><td colspan="8"><div class="empty">No records.</div></td></tr>
                <tr v-for="(r, i) in rows.slice(0, 300)" :key="i">
                  <td style="font-size:11px">{{ r.poll_time ? new Date(r.poll_time).toLocaleString() : '—' }}</td>
                  <td>
                    <span class="b" :class="statusBadgeClass(r)" style="display:inline-flex;align-items:center">
                      <span :style="statusDotStyle(r)"></span>
                      {{ statusText(r) }}
                    </span>
                  </td>
                  <td>
                    <span :style="{ color: rxColor(r.rx_power), fontFamily: 'monospace', fontWeight: 700 }">
                      {{ r.rx_power != null ? Number(r.rx_power).toFixed(2) + ' dBm' : '—' }}
                    </span>
                  </td>
                  <td>
                    <span style="font-family:monospace;color:var(--accent2)">
                      {{ formatDistance(r.distance_m ?? r.distance) }}
                    </span>
                  </td>
                  <td>{{ r.olt_name || '—' }}</td>
                  <td style="font-family:monospace;font-size:11px;color:var(--accent)">{{ r.olt_ip || '—' }}</td>
                  <td>{{ r.pon_port != null ? 'PON ' + r.pon_port : '—' }}</td>
                  <td>{{ r.onu_id ?? '—' }}</td>
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

const latest = computed(() => (rows.value.length ? rows.value[0] : null))

async function doSearch() {
  const sn = serial.value.trim()
  if (!sn) { msg.value = 'Enter a serial number.'; ok.value = false; return }
  try {
    const data = await apiFetch('/api/onu/history?serial_no=' + encodeURIComponent(sn))
    rows.value = Array.isArray(data) ? data : []
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

function isOnline(r) {
  if (!r) return false
  if (r.online === 1 || r.online === '1' || r.online === true) return true
  if (r.phase_state && r.phase_state.toLowerCase() === 'working') return true
  return false
}

function statusText(r) {
  if (!r) return '—'
  if (isOnline(r)) return 'ONLINE'
  if (r.phase_state && r.phase_state.toLowerCase() !== 'working') return `OFFLINE (${r.phase_state})`
  return 'OFFLINE'
}

function statusBadgeClass(r) {
  return isOnline(r) ? 'bg' : 'br'
}

function statusDotStyle(r) {
  const on = isOnline(r)
  return {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: on ? 'var(--accent3)' : 'var(--danger)',
    marginRight: '5px',
    boxShadow: on ? '0 0 6px rgba(57,255,20,0.6)' : '0 0 6px rgba(255,45,85,0.6)'
  }
}

function formatDistance(dist) {
  if (dist == null || dist === undefined || dist === '') return '—'
  const num = Number(dist)
  if (isNaN(num) || num < 0) return '—'
  if (num >= 1000) {
    const km = (num / 1000).toFixed(2)
    return `${num.toLocaleString()} m (${km} km)`
  }
  return `${num.toLocaleString()} m`
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

const chartData = computed(() => {
  const chronological = [...rows.value].reverse()
  return {
    labels: chronological.map(r => new Date(r.poll_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    datasets: [{
      label: 'Rx Power (dBm)',
      data: chronological.map(r => r.rx_power),
      borderColor: '#00e5ff', backgroundColor: 'rgba(0,229,255,0.06)', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true
    }]
  }
})
</script>

