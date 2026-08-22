<template>
  <div class="modal-overlay show" @click.self="$emit('close')">
    <div class="modal-panel" style="max-width:1150px;max-height:92vh">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <h3>{{ name }} &mdash; ONU Data</h3>
        <button class="ubtn" @click="$emit('close')">Close</button>
      </div>
      <div class="pb2" style="margin-bottom:10px">{{ subtitle }}</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <div>
          <label class="flabel">DATE</label>
          <input v-model="selDate" type="date" class="finp" @change="onDateChange" />
        </div>
        <div>
          <label class="flabel">SNAPSHOT</label>
          <select v-model="selPollTime" class="finp" style="min-width:170px" @change="loadOnusForTime">
            <option value="">Latest</option>
            <option v-for="t in pollTimes" :key="t.poll_time" :value="t.poll_time">{{ fmtPoll(t.poll_time) }}</option>
          </select>
        </div>
        <div>
          <label class="flabel">PON</label>
          <select v-model="ponFilter" class="finp" style="min-width:150px">
            <option value="">All PON Ports ({{ onus.length }})</option>
            <option v-for="(cnt, p) in ponCounts" :key="p" :value="p">PON {{ p }} ({{ cnt }} ONUs)</option>
          </select>
        </div>
        <div>
          <label class="flabel">STATE</label>
          <select v-model="stateFilter" class="finp" style="min-width:110px">
            <option value="">All States</option>
            <option value="1">Online</option>
            <option value="0">Offline</option>
          </select>
        </div>
        <div>
          <label class="flabel">SEARCH</label>
          <input v-model="search" class="finp" placeholder="SN / model / index..." style="width:170px" />
        </div>
        <button class="rb" style="padding:8px 14px" @click="exportCsv">Export CSV</button>
      </div>

      <div class="srow" style="margin-bottom:12px">
        <div class="sc c"><div class="sl">Total</div><div class="sv">{{ statTotal }}</div></div>
        <div class="sc g"><div class="sl">Online</div><div class="sv">{{ statOnline }}</div></div>
        <div class="sc r"><div class="sl">Offline</div><div class="sv">{{ statOffline }}</div></div>
        <div class="sc y"><div class="sl">Dying Gasp</div><div class="sv">{{ statGasp }}</div></div>
        <div class="sc o"><div class="sl">Farthest</div><div class="sv" style="font-size:14px;padding-top:6px">{{ statFarthest }}</div></div>
      </div>

      <div class="tw" style="max-height:48vh;overflow-y:auto">
        <table>
          <thead>
            <tr>
              <th style="width:110px">Status</th><th>Index</th><th>PON</th><th>ONU ID</th><th>Serial No</th>
              <th>Model</th><th>Profile</th><th>Rx Power</th><th>Tx Power</th><th>Distance</th><th>Phase State</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredOnus.length"><td colspan="11"><div class="empty">{{ onus.length ? 'No ONU data matching filter.' : 'No ONU data - click Get ONU Info to poll this OLT.' }}</div></td></tr>
            <tr v-for="(o, i) in filteredOnus" :key="(o.serial_no || '') + i">
              <td style="white-space:nowrap">
                <span :style="{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: stColor(o), marginRight: '5px', verticalAlign: 'middle' }"></span>
                <span :style="{ fontSize: '11px', fontWeight: 700, color: stColor(o) }">{{ stText(o) }}</span>
              </td>
              <td style="font-family:'Share Tech Mono',monospace;color:var(--accent);font-size:12px">{{ o.onu_index || '-' }}</td>
              <td>PON {{ o.pon_port || '-' }}</td>
              <td>{{ o.onu_id || '-' }}</td>
              <td style="font-family:'Share Tech Mono',monospace;color:var(--accent2);font-size:11px">{{ o.serial_no || '-' }}</td>
              <td>{{ o.model || 'unknown' }}</td>
              <td class="mu">{{ o.profile || '-' }}</td>
              <td><span v-if="o.rx_power != null" :style="{ fontFamily: 'monospace', fontWeight: 700, color: rxColor(o.rx_power) }">{{ o.rx_power.toFixed(1) }} dBm</span><span v-else class="mu">-</span></td>
              <td><span v-if="o.tx_power != null" style="font-family:monospace">{{ o.tx_power.toFixed(1) }} dBm</span><span v-else class="mu">-</span></td>
              <td><span v-if="o.distance_m != null" style="font-family:monospace;color:var(--accent2)">{{ Number(o.distance_m).toLocaleString() }} m</span><span v-else class="mu">-</span></td>
              <td><span :style="{ fontSize: '10px', color: stColor(o) }">{{ o.phase_state || '-' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pb2" style="margin-top:8px">{{ footer }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '../../api'

const props = defineProps({
  ip: { type: String, required: true },
  name: { type: String, default: '' },
  onus: { type: Array, default: () => [] },
  pollTime: { type: String, default: null }
})
defineEmits(['close'])

const onus = ref([...props.onus])
const selDate = ref(props.pollTime ? props.pollTime.slice(0, 10) : '')
const selPollTime = ref(props.pollTime || '')
const pollTimes = ref([])
const ponFilter = ref('')
const stateFilter = ref('')
const search = ref('')

const ponCounts = computed(() => {
  const p = {}
  onus.value.forEach(o => { p[o.pon_port] = (p[o.pon_port] || 0) + 1 })
  return p
})

const filteredOnus = computed(() => {
  const s = search.value.toLowerCase().trim()
  return onus.value.filter(o => {
    if (ponFilter.value && String(o.pon_port) !== String(ponFilter.value)) return false
    if (stateFilter.value !== '' && String(Number(o.online)) !== stateFilter.value) return false
    if (s && !((o.serial_no || '').toLowerCase().includes(s) ||
               (o.model || '').toLowerCase().includes(s) ||
               (o.onu_index || '').toLowerCase().includes(s))) return false
    return true
  })
})

const subtitle = computed(() => {
  if (!onus.value.length) return 'No data - click "Get ONU Info" to poll this OLT'
  const pt = selPollTime.value || props.pollTime
  const when = pt ? new Date(pt).toLocaleString() : ''
  return `Last polled: ${when} - ${onus.value.length} ONUs`
})
const footer = computed(() =>
  onus.value.length ? `Poll time: ${selPollTime.value || props.pollTime || '-'} | OLT: ${onus.value[0].olt_name || props.ip}` : '')

const statTotal = computed(() => filteredOnus.value.length)
const statOnline = computed(() => filteredOnus.value.filter(o => o.online).length)
const statOffline = computed(() => filteredOnus.value.filter(o => !o.online && (o.phase_state || '').toLowerCase() !== 'dyinggasp').length)
const statGasp = computed(() => filteredOnus.value.filter(o => (o.phase_state || '').toLowerCase() === 'dyinggasp').length)
const statFarthest = computed(() => {
  const withDist = filteredOnus.value.filter(o => o.distance_m != null)
  if (!withDist.length) return '-'
  const far = withDist.reduce((a, b) => (a.distance_m || 0) > (b.distance_m || 0) ? a : b)
  return `${Number(far.distance_m).toLocaleString()} m (${far.serial_no || far.onu_index || '?'})`
})

function stColor(o) {
  if (o.online) return 'var(--accent3)'
  return (o.phase_state || '').toLowerCase() === 'dyinggasp' ? 'var(--warn)' : 'var(--danger)'
}
function stText(o) {
  if (o.online) return 'Online'
  const st = (o.phase_state || '').toLowerCase()
  return st === 'dyinggasp' ? 'Dying Gasp' : (o.phase_state || 'Offline')
}
function rxColor(v) {
  if (v == null) return 'var(--muted)'
  if (v >= -20) return 'var(--accent3)'
  if (v >= -25) return 'var(--warn)'
  return 'var(--danger)'
}
function fmtPoll(t) { try { return new Date(t).toLocaleString() } catch (_) { return t } }

async function loadPollTimes() {
  try {
    const dates = await apiFetch('/api/olt/poll_dates?ip=' + encodeURIComponent(props.ip) + '&limit=180')
    if (!dates || !dates.length) { pollTimes.value = []; return }
    if (!selDate.value) selDate.value = dates[0].poll_date
    try {
      const times = await apiFetch('/api/olt/poll_times?ip=' + encodeURIComponent(props.ip) + '&date=' + encodeURIComponent(selDate.value))
      pollTimes.value = Array.isArray(times) ? times : []
    } catch (_) { pollTimes.value = [] }
  } catch (_) { pollTimes.value = [] }
}

function onDateChange() {
  selPollTime.value = ''
  loadPollTimes().then(loadOnusForTime)
}

async function loadOnusForTime() {
  let url = '/api/olt/onus?ip=' + encodeURIComponent(props.ip)
  if (selPollTime.value) url += '&poll_time=' + encodeURIComponent(selPollTime.value)
  try {
    const rows = await apiFetch(url)
    onus.value = Array.isArray(rows) ? rows : []
  } catch (_) {}
}

function exportCsv() {
  if (!filteredOnus.value.length) return
  const headers = ['onu_index', 'pon_port', 'onu_id', 'serial_no', 'model', 'profile', 'rx_power', 'tx_power', 'distance_m', 'phase_state', 'online']
  const lines = [headers.join(',')]
  filteredOnus.value.forEach(o => {
    lines.push(headers.map(h => '"' + String(o[h] ?? '').replace(/"/g, '""') + '"').join(','))
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'onus_' + props.ip + '_' + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(() => {
  if (!props.onus.length) loadPollTimes().then(loadOnusForTime)
  else loadPollTimes()
})
</script>
