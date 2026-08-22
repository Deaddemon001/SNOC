<template>
  <span class="b" :class="badgeClass">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  severity: { type: String, default: '' },
  text: { type: String, default: '' }
})

const SEV_MAP = {
  emergency: 'br', alert: 'br', critical: 'br', error: 'br', major: 'br',
  warning: 'by', notice: 'bc', info: 'bc'
}

const badgeClass = computed(() => {
  if (props.severity) return SEV_MAP[(props.severity || '').toLowerCase()] || 'bx'
  return props.text || 'bx'
})
</script>
