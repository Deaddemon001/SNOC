<template>
  <div v-if="msg" class="smsg" :class="ok ? 'ok' : 'err'" :style="{ whiteSpace: pre ? 'pre' : 'normal', fontFamily: pre ? 'monospace' : 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }">
    <span v-if="loading" class="status-spinner"></span>
    <span>{{ msg }}</span>
  </div>
</template>

<script setup>
defineProps({
  msg: { type: String, default: '' },
  ok: { type: Boolean, default: false },
  pre: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})
</script>

