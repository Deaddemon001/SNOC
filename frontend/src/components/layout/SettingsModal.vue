<template>
  <div class="modal-overlay show" @click.self="$emit('close')">
    <div class="modal-panel" style="max-width:640px">
      <h3>&#9881; Settings</h3>
      <div :class="msgClass" v-if="msg">{{ msg }}</div>

      <div v-if="auth.isAdmin" class="set-section">
        <h4>Data Retention (days)</h4>
        <div class="ret-grid">
          <div v-for="k in RETENTION_KEYS" :key="k.id" class="set-row">
            <label>{{ k.label }}</label>
            <input type="number" min="1" v-model.number="retention[k.id]" />
          </div>
        </div>
        <button class="rbtn save-btn" @click="saveRetention">Save Retention</button>
      </div>

      <div v-if="auth.isAdmin" class="set-section">
        <h4>Service Ports</h4>
        <div class="ret-grid">
          <div v-for="p in PORT_KEYS" :key="p.id" class="set-row">
            <label>{{ p.label }}</label>
            <input type="number" min="1" max="65535" v-model.number="ports[p.id]" />
          </div>
        </div>
        <div v-if="portMsg" class="smsg" :class="portOk ? 'ok' : 'err'">{{ portMsg }}</div>
        <button class="rbtn save-btn" @click="savePorts">Save Ports</button>
      </div>

      <div v-if="auth.isAdmin" class="set-section">
        <h4>Visible Tabs (global)</h4>
        <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Unchecking a tab hides it for non-admin users.</p>
        <div class="tab-checks">
          <label v-for="t in TAB_OPTIONS" :key="t.id" class="chk">
            <input type="checkbox" :value="t.id" v-model="selectedTabs" /> {{ t.label }}
          </label>
        </div>
        <button class="rbtn save-btn" @click="saveTabs">Save Tab Visibility</button>
      </div>

      <div class="set-section">
        <h4>Session Timeout</h4>
        <div class="set-row">
          <label>Auto-logout after inactivity</label>
          <select v-model.number="sessionTimeout" class="fsel" style="max-width:140px">
            <option v-for="m in [15, 30, 60, 120, 240, 480]" :key="m" :value="m">{{ m }} min</option>
          </select>
        </div>
        <div v-if="timeoutMsg" class="smsg" :class="timeoutOk ? 'ok' : 'err'">{{ timeoutMsg }}</div>
        <button class="rbtn save-btn" @click="saveTimeout">Save Timeout</button>
      </div>

      <div v-if="auth.isAdmin" class="set-section">
        <h4>Power Controls</h4>
        <p style="font-size:12px;color:var(--muted);margin-bottom:10px">Headless 24/7 management without terminal access.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="ubtn" @click="openRestart('all')">&#x21BB; Restart Smart NOC</button>
          <button class="lbtn" @click="openShutdown">&#x1F6D1; Shutdown Smart NOC</button>
        </div>
      </div>

      <div class="set-section">
        <h4>UI Version</h4>
        <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Switch to the classic vanilla-JS single-file dashboard.</p>
        <button class="ubtn" @click="switchToLegacy">&#9194; Switch to Legacy Version</button>
      </div>

      <div class="modal-actions">
        <button class="rbtn" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import { apiFetch, apiPost } from '../../api'
import { useAuthStore, SETTINGS_TAB_OPTIONS } from '../../stores/auth'

defineEmits(['close'])
const auth = useAuthStore()
const openRestart = inject('openRestart')
const openShutdown = inject('openShutdown')

const RETENTION_KEYS = [
  { id: 'trap_retention_days', label: 'SNMP traps' },
  { id: 'syslog_retention_days', label: 'Syslog events' },
  { id: 'ping_retention_days', label: 'Ping history' },
  { id: 'tftp_retention_days', label: 'TFTP backups' },
  { id: 'alert_log_retention_days', label: 'Alert log' },
  { id: 'olt_data_retention_days', label: 'OLT data' },
  { id: 'olt_session_retention_days', label: 'OLT sessions' }
]
const PORT_KEYS = [
  { id: 'api_port', label: 'API (HTTP)' },
  { id: 'https_port', label: 'API (HTTPS)' },
  { id: 'snmp_port', label: 'SNMP trap (UDP)' },
  { id: 'syslog_port', label: 'Syslog (UDP)' },
  { id: 'tftp_port', label: 'TFTP (UDP)' }
]
const TAB_OPTIONS = SETTINGS_TAB_OPTIONS

const retention = ref({})
const ports = ref({})
const selectedTabs = ref([])
const sessionTimeout = ref(30)
const msg = ref('')
const msgClass = ref('')
const portMsg = ref('')
const portOk = ref(false)
const timeoutMsg = ref('')
const timeoutOk = ref(false)

function flash(m, ok) {
  msg.value = m
  msgClass.value = ok ? 'ok' : 'err'
  setTimeout(() => { if (msg.value === m) msg.value = '' }, 4000)
}

async function saveRetention() {
  const body = {}
  for (const k of RETENTION_KEYS) {
    const v = parseInt(retention.value[k.id], 10)
    if (isNaN(v)) { flash('Invalid number: ' + k.id, false); return }
    body[k.id] = v
  }
  try {
    const d = await apiPost('/api/settings/retention', body)
    flash(d.success ? 'Saved.' : (d.error || 'Save failed'), !!d.success)
  } catch (e) { flash(e.message, false) }
}

async function savePorts() {
  const body = {}
  for (const p of PORT_KEYS) {
    const v = parseInt(ports.value[p.id], 10)
    if (isNaN(v) || v < 1 || v > 65535) { portMsg.value = 'Invalid port: ' + p.id; portOk.value = false; return }
    body[p.id] = v
  }
  try {
    const r = await apiPost('/api/settings/ports', body)
    portMsg.value = r.message || 'Ports saved. Restart required for full effect.'
    portOk.value = true
  } catch (e) { portMsg.value = e.message; portOk.value = false }
}

async function saveTabs() {
  try {
    const r = await apiPost('/api/settings/ui', { visible_tabs: selectedTabs.value })
    if (r.success !== false) {
      auth.applyGlobalTabs(selectedTabs.value)
      flash('Tab visibility saved.', true)
    } else flash(r.error || 'Save failed', false)
  } catch (e) { flash(e.message, false) }
}

async function saveTimeout() {
  try {
    const r = await apiPost('/api/settings/security', { session_timeout_minutes: sessionTimeout.value })
    timeoutMsg.value = r && r.success ? 'Session timeout saved.' : (r.error || 'Save failed')
    timeoutOk.value = !!(r && r.success)
  } catch (e) { timeoutMsg.value = e.message; timeoutOk.value = false }
}

function switchToLegacy() {
  window.location.href = '/?legacy=1'
}

onMounted(async () => {
  try {
    const m = await apiFetch('/api/settings/retention')
    RETENTION_KEYS.forEach(k => { if (m[k.id] !== undefined) retention.value[k.id] = m[k.id] })
  } catch (_) {}
  try {
    const p = await apiFetch('/api/settings/ports')
    PORT_KEYS.forEach(k => { if (p[k.id] !== undefined) ports.value[k.id] = p[k.id] })
  } catch (_) {}
  try {
    const d = await apiFetch('/api/settings/ui')
    selectedTabs.value = Array.isArray(d.visible_tabs) ? d.visible_tabs.slice() : []
  } catch (_) {}
  try {
    const s = await apiFetch('/api/settings/security')
    if (s.session_timeout_minutes) sessionTimeout.value = s.session_timeout_minutes
  } catch (_) {}
})
</script>

<style scoped>
.set-section { border-top: 1px solid var(--border); padding-top: 14px; margin-top: 14px; }
.set-section h4 { color: var(--accent); font-size: 13px; letter-spacing: 1px; margin-bottom: 10px; text-transform: uppercase; }
.ret-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
.set-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 13px; }
.set-row input[type="number"] { width: 90px; background: rgba(0,229,255,0.04); border: 1px solid var(--border); border-radius: 4px; color: var(--text); padding: 5px 8px; font-family: 'Share Tech Mono', monospace; }
.tab-checks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
.chk { font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
.save-btn { margin-top: 4px; }
.smsg { padding: 8px 10px; border-radius: 4px; font-size: 12px; margin: 8px 0; }
.smsg.ok { background: rgba(57,255,20,0.08); border: 1px solid rgba(57,255,20,0.3); color: var(--accent3); }
.smsg.err { background: rgba(255,45,85,0.08); border: 1px solid rgba(255,45,85,0.3); color: var(--danger); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
