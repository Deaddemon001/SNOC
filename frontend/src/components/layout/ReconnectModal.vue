<template>
  <div class="modal-overlay show">
    <div class="modal-panel" style="text-align:center;max-width:420px">
      <h3>{{ done ? '&#x2705; Back Online' : '&#x21BB; Restarting Smart NOC' }}</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">{{ message }}</p>
      <div class="cd">{{ countdown > 0 ? countdown + 's' : 'Reconnecting...' }}</div>
      <div class="bar-wrap"><div class="bar" :style="{ width: barPct + '%' }"></div></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({ message: { type: String, default: '' } })
const emit = defineEmits(['done'])

const totalSec = 6
const remaining = ref(totalSec)
const done = ref(false)
let timer = null

const barPct = computed(() => Math.max(0, (remaining.value / totalSec) * 100))

onMounted(() => {
  timer = setInterval(async () => {
    remaining.value--
    if (remaining.value <= 0) {
      try {
        const r = await fetch(window.location.origin + '/api/health', { method: 'GET', cache: 'no-store' })
        if (r.ok) {
          clearInterval(timer)
          done.value = true
          setTimeout(() => window.location.reload(), 500)
        }
      } catch (_) { /* still starting up */ }
    }
  }, 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.cd {
  font-family: 'Share Tech Mono', monospace;
  font-size: 34px;
  color: var(--accent);
  margin: 10px 0 14px;
}
.bar-wrap {
  height: 6px;
  background: rgba(0,229,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}
.bar {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 1s linear;
}
</style>
