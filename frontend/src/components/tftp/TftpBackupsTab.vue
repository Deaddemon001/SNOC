<template>
  <main>
    <div class="srow">
      <div class="sc g"><div class="sl">Files Received</div><div class="sv">{{ stats.total_files ?? '-' }}</div><div class="ss">all time</div></div>
      <div class="sc c"><div class="sl">Successful</div><div class="sv">{{ stats.ok_files ?? '-' }}</div><div class="ss">completed</div></div>
      <div class="sc o"><div class="sl">Total Size</div><div class="sv">{{ formatBytes(stats.total_size) }}</div><div class="ss">stored</div></div>
      <div class="sc r"><div class="sl">TFTP Port</div><div class="sv">{{ portLabel }}</div><div class="ss">UDP / needs Admin</div></div>
    </div>

    <div class="crow">
      <div class="panel">
        <div class="ph"><div class="pt">TFTP Settings</div><div class="pb2">Storage path configuration</div></div>
        <div class="pb" style="display:grid;gap:10px">
          <div>
            <label class="flabel">BACKUP STORAGE PATH</label>
            <input v-model="config.tftp_dir" class="finp" placeholder="C:\SmartNOC\backups" :disabled="!auth.isAdmin" />
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <label style="display:flex;align-items:center;gap:6px;font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted);cursor:pointer">
              <input type="checkbox" v-model="config.tftp_enabled" /> TFTP SERVER ENABLED
            </label>
          </div>
          <StatusMessage :msg="cfgMsg" :ok="cfgOk" />
          <button v-if="auth.isAdmin" class="rb" style="padding:9px" @click="saveConfig">Save Settings</button>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><div class="pt">Recent Backups</div><div class="pb2">Last 5 files received</div></div>
        <div class="pb" style="display:grid;gap:8px">
          <div v-if="!files.length" class="empty">No backups received yet.</div>
          <div v-for="f in files.slice(0, 5)" :key="f.id" style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,229,255,0.03);border:1px solid var(--border);border-radius:6px;padding:8px 12px">
            <div>
              <div style="color:var(--accent3);font-family:monospace;font-size:12px">{{ f.filename }}</div>
              <div style="font-size:10px;color:var(--muted)">{{ f.olt_name || f.source_ip }} &bull; {{ new Date(f.timestamp).toLocaleString() }}</div>
            </div>
            <span style="color:var(--accent2);font-size:11px">{{ formatBytes(f.file_size) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="ph" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;padding:14px 18px" @click="macOpen = !macOpen">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="pt">OLT MAC Address Mapping</div>
          <div class="pb2">Map MAC to OLT hostname for multi-OLT NAT scenarios</div>
        </div>
        <span style="color:var(--accent);font-size:14px;transition:transform 0.2s" :style="{ transform: macOpen ? 'rotate(180deg)' : 'none' }">&#9660;</span>
      </div>
      <div v-if="macOpen" style="padding:0 18px 16px">
        <div style="font-size:10px;color:var(--muted);font-family:monospace;background:rgba(0,0,0,0.2);padding:10px 12px;border-radius:4px;line-height:1.8;margin-top:8px">
          When multiple OLTs share the same public IP (behind NAT), use this mapping to identify each OLT by its MAC address from the backup filename.
        </div>
        <div v-if="auth.isAdmin" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label class="flabel">OLT MAC</label><input v-model="mapMac" class="finp" placeholder="aa:bb:cc:dd:ee:ff" style="width:170px" /></div>
          <div><label class="flabel">OLT HOSTNAME</label><input v-model="mapHost" class="finp" placeholder="OLT-01" style="width:150px" /></div>
          <div><label class="flabel">DESCRIPTION</label><input v-model="mapDesc" class="finp" placeholder="optional note" style="width:200px" /></div>
          <button class="rb" style="padding:8px 14px" @click="addMapping">+ Add Mapping</button>
        </div>
        <StatusMessage :msg="mapMsg" :ok="mapOk" />
        <div class="tw" style="margin-top:10px">
          <table>
            <thead><tr><th>MAC</th><th>Hostname</th><th>Description</th><th v-if="auth.isAdmin"></th></tr></thead>
            <tbody>
              <tr v-if="!mappings.length"><td :colspan="auth.isAdmin ? 4 : 3"><div class="empty">No mappings defined.</div></td></tr>
              <tr v-for="m in mappings" :key="m.olt_mac">
                <td style="font-family:monospace;font-size:11px">{{ m.olt_mac }}</td>
                <td>{{ m.olt_hostname }}</td>
                <td style="font-size:11px;color:var(--muted)">{{ m.description || '-' }}</td>
                <td v-if="auth.isAdmin"><button class="lbtn" style="padding:2px 8px;font-size:10px" @click="deleteMapping(m)">Remove</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="ph">
        <div class="pt">Backup Files</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select v-model="filterOlt" class="fsel" style="min-width:140px">
            <option value="">All OLTs</option>
            <option v-for="o in oltList" :key="o" :value="o">{{ o }}</option>
          </select>
          <input v-model="filterFile" class="finp" placeholder="filename..." style="width:160px" />
          <div class="pb2">{{ filteredFiles.length }} files</div>
        </div>
      </div>
      <div style="padding:8px 18px;display:flex;gap:6px;flex-wrap:wrap" v-if="oltList.length">
        <span style="font-size:10px;color:var(--muted);align-self:center">Quick filter:</span>
        <button v-for="o in oltList" :key="o" class="qbtn" @click="filterOlt = o; filterFile = ''">{{ o }} ({{ oltCounts[o] }})</button>
      </div>
      <div class="tw">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>OLT</th><th>Source IP</th><th>Filename</th><th>Stored As</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-if="!filteredFiles.length"><td colspan="9"><div class="empty">No backup files received yet.</div></td></tr>
            <tr v-for="f in filteredFiles" :key="f.id">
              <td class="mu">{{ f.id }}</td>
              <td><div class="mu" style="font-size:11px">{{ new Date(f.timestamp).toLocaleDateString() }}</div><div class="mu" style="font-size:11px">{{ new Date(f.timestamp).toLocaleTimeString() }}</div></td>
              <td><span class="b" :class="oltBadgeClass(f.olt_name || f.source_ip)">{{ f.olt_name || f.source_ip || '?' }}</span></td>
              <td><span class="mu" style="font-size:11px">{{ f.source_ip || '-' }}</span></td>
              <td><span style="color:var(--accent3);font-family:monospace;font-size:11px">{{ f.filename || '-' }}</span></td>
              <td><span style="color:var(--muted);font-size:10px">{{ f.stored_name || '-' }}</span></td>
              <td><span style="color:var(--accent2)">{{ formatBytes(f.file_size) }}</span></td>
              <td><span v-if="f.status === 'ok'" class="b bg">OK</span><span v-else class="b br">{{ f.status }}</span></td>
              <td style="white-space:nowrap">
                <a v-if="f.status === 'ok'" :href="'/api/tftp/download/' + f.id" class="ubtn" style="padding:2px 8px;font-size:10px;text-decoration:none">DL</a>
                <button v-if="auth.isAdmin" class="lbtn" style="padding:2px 8px;font-size:10px;margin-left:4px" @click="deleteFile(f)">Del</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed } from 'vue'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore } from '../../stores/auth'
import { usePolling } from '../../composables/usePolling'
import StatusMessage from '../shared/StatusMessage.vue'

const auth = useAuthStore()
const stats = ref({})
const config = ref({ tftp_dir: '', tftp_enabled: true })
const files = ref([])
const mappings = ref([])
const macOpen = ref(false)
const filterOlt = ref('')
const filterFile = ref('')
const mapMac = ref('')
const mapHost = ref('')
const mapDesc = ref('')
const cfgMsg = ref('')
const cfgOk = ref(false)
const mapMsg = ref('')
const mapOk = ref(false)

const portLabel = computed(() => config.value.tftp_port || 69)

const oltList = computed(() => {
  const olts = {}
  files.value.forEach(f => {
    const key = f.olt_name || f.source_ip || '-'
    olts[key] = (olts[key] || 0) + 1
  })
  return Object.keys(olts).sort()
})
const oltCounts = computed(() => {
  const olts = {}
  files.value.forEach(f => {
    const key = f.olt_name || f.source_ip || '-'
    olts[key] = (olts[key] || 0) + 1
  })
  return olts
})
const filteredFiles = computed(() => {
  const of_ = filterOlt.value.toLowerCase().trim()
  const ff = filterFile.value.toLowerCase().trim()
  return files.value.filter(f => {
    const oltMatch = !of_ || (f.olt_name || '').toLowerCase().includes(of_) || (f.source_ip || '').toLowerCase().includes(of_)
    const fileMatch = !ff || (f.filename || '').toLowerCase().includes(ff) || (f.stored_name || '').toLowerCase().includes(ff)
    return oltMatch && fileMatch
  })
})

async function load() {
  try { const s = await apiFetch('/api/tftp/stats'); stats.value = s || {} } catch (_) {}
  try { const fl = await apiFetch('/api/tftp/files'); files.value = Array.isArray(fl) ? fl : [] } catch (_) {}
}
usePolling(load, 10000)

async function loadConfig() {
  try {
    const d = await apiFetch('/api/tftp/config')
    if (d) config.value = { ...config.value, ...d }
  } catch (_) {}
  try { const m = await apiFetch('/api/tftp/mac_mapping'); mappings.value = Array.isArray(m) ? m : [] } catch (_) {}
}
loadConfig()

async function saveConfig() {
  try {
    const r = await apiPost('/api/tftp/config', config.value)
    cfgMsg.value = r.message || 'Settings saved.'
    cfgOk.value = r.success !== false
  } catch (e) { cfgMsg.value = e.message; cfgOk.value = false }
}

async function addMapping() {
  const mac = mapMac.value.trim()
  const host = mapHost.value.trim()
  if (!mac || !host) { mapMsg.value = 'MAC and hostname are required.'; mapOk.value = false; return }
  try {
    await apiPost('/api/tftp/mac_mapping/add', { olt_mac: mac, olt_hostname: host, description: mapDesc.value.trim() })
    mapMsg.value = 'Mapping added.'; mapOk.value = true
    mapMac.value = ''; mapHost.value = ''; mapDesc.value = ''
    const m = await apiFetch('/api/tftp/mac_mapping'); mappings.value = Array.isArray(m) ? m : []
  } catch (e) { mapMsg.value = e.message; mapOk.value = false }
}

async function deleteMapping(m) {
  if (!confirm('Remove mapping for ' + m.olt_mac + '?')) return
  try {
    await apiPost('/api/tftp/mac_mapping/delete', { olt_mac: m.olt_mac })
    const r = await apiFetch('/api/tftp/mac_mapping'); mappings.value = Array.isArray(r) ? r : []
  } catch (e) { alert(e.message) }
}

async function deleteFile(f) {
  if (!confirm('Delete backup record #' + f.id + '?')) return
  try { await apiPost('/api/tftp/delete/' + f.id, {}); load() } catch (e) { alert(e.message) }
}

function formatBytes(b) {
  if (!b && b !== 0) return '-'
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(2) + ' MB'
}
function oltBadgeClass(id) {
  const colors = ['bc', 'bo', 'bg', 'by']
  const i = id ? (id.charCodeAt(id.length - 1) % 4) : 0
  return colors[i]
}
</script>

<style scoped>
.qbtn { font-size: 10px; padding: 3px 10px; border: 1px solid var(--accent); color: var(--accent); background: transparent; border-radius: 12px; cursor: pointer; white-space: nowrap; }
.qbtn:hover { background: rgba(0,229,255,0.1); }
</style>
