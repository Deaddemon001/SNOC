<template>
  <div class="modal-overlay show" @click.self="$emit('close')">
    <div class="modal-panel">
      <h3>&#x26A0;&#xFE0F; Confirm Restart</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Select what to restart. Restarting the API or the full stack will briefly interrupt the dashboard
        and an automatic reconnection countdown will start.
      </p>
      <div class="set-row">
        <label>Restart target</label>
        <select v-model="target" class="fsel" style="max-width:220px">
          <option value="all">Full stack (all services)</option>
          <option value="api">API server only</option>
          <option value="snmp">SNMP trap receiver</option>
          <option value="syslog">Syslog server</option>
          <option value="tftp">TFTP server</option>
          <option value="ping">Ping engine</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="rbtn" @click="$emit('close')">Cancel</button>
        <button class="lbtn" :disabled="busy" @click="doRestart">{{ busy ? 'Restarting...' : 'Restart Now' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'
import { apiPost } from '../../api'

const emit = defineEmits(['close', 'restarting'])
const props = defineProps({ target: { type: String, default: 'all' } })
const startReconnect = inject('startReconnect')

const target = ref(props.target)
const busy = ref(false)

async function doRestart() {
  busy.value = true
  const t = target.value
  try {
    const r = await apiPost('/api/system/restart', { target: t })
    if (r.success) {
      if (t === 'all' || t === 'api') {
        emit('restarting')
        startReconnect('Restarting Smart NOC...')
      } else {
        alert('Service restarted successfully: ' + (r.message || t))
        emit('close')
      }
    } else {
      alert('Restart failed: ' + (r.error || 'Unknown error'))
      busy.value = false
    }
  } catch (_) {
    if (t === 'all' || t === 'api') {
      emit('restarting')
      startReconnect('Restarting Smart NOC...')
    } else {
      alert('Restart request error')
      busy.value = false
    }
  }
}
</script>
