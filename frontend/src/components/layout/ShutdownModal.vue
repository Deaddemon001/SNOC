<template>
  <div class="modal-overlay show" @click.self="$emit('close')">
    <div class="modal-panel">
      <h3>&#x1F6D1; Confirm Shutdown</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px">
        This will stop all Smart NOC services on this machine. The web dashboard will become
        unreachable until the application is started again from the server.
      </p>
      <div class="modal-actions">
        <button class="rbtn" @click="$emit('close')">Cancel</button>
        <button class="lbtn" :disabled="busy" @click="doShutdown">{{ busy ? 'Shutting down...' : 'Shutdown Now' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { apiPost } from '../../api'

const emit = defineEmits(['close', 'shutting-down'])
const busy = ref(false)

async function doShutdown() {
  if (!confirm('Shutdown Smart NOC now?')) return
  busy.value = true
  try {
    await apiPost('/api/system/shutdown', {})
  } catch (_) {}
  emit('shutting-down')
}
</script>
