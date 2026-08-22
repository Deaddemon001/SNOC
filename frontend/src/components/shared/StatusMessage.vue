<template>
  <div v-if="msg" class="smsg" :class="ok ? 'ok' : 'err'" :style="{ whiteSpace: pre ? 'pre' : 'normal', fontFamily: pre ? 'monospace' : 'inherit' }">{{ msg }}</div>
</template>

<script setup>
defineProps({
  msg: { type: String, default: '' },
  ok: { type: Boolean, default: false },
  pre: { type: Boolean, default: false }
})
</script>
