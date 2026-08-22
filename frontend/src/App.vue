<template>
  <router-view />
</template>

<script setup>
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'

const auth = useAuthStore()
const theme = useThemeStore()
auth.init()
theme.init()
</script>
