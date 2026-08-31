<template>
  <header>
    <div class="logo">
      <h1>SMART NOC</h1>
      <span>v{{ version }} &mdash; NETWORK OPERATIONS CENTER</span>
    </div>
    <div class="hright">
      <div class="live-pill"><span class="dot"></span>LIVE</div>
      <div class="upd">{{ lastUpdate }}</div>
      <button class="ubtn legacy-btn" title="Switch to Legacy UI" @click="switchToLegacy">&#9194; Legacy UI</button>
      <button class="rbtn" title="Refresh all data" @click="$emit('refresh')">&#8634; Refresh</button>
      <button class="ubtn" title="Settings" @click="$emit('open-settings')">&#9881; Settings</button>
      <div class="userinfo">
        <span class="uname">{{ auth.username }}</span>
        <span class="urole">{{ roleLabel(auth.role) }}</span>
        <button v-if="auth.isAdmin" class="ubtn" @click="goUsers">Users</button>
        <button class="ubtn" style="margin-right:6px" @click="theme.toggle()">
          {{ theme.mode === 'light' ? '&#9728; Light' : '&#9789; Dark' }}
        </button>
        <button class="lbtn" @click="doLogout">Logout</button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore, roleLabel } from '../../stores/auth'
import { useThemeStore } from '../../stores/theme'

defineEmits(['open-settings', 'refresh'])

const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()
const version = window.__APP_VERSION__ || '0.5.6.4'

const lastUpdate = ref('Connecting...')
let clockTimer = null

function tick() {
  const d = new Date()
  lastUpdate.value = 'Updated ' + d.toLocaleTimeString()
}

function goUsers() { router.push('/users') }
function doLogout() { auth.logout() }
function switchToLegacy() { window.location.href = '/?legacy=1' }

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)
})
onUnmounted(() => clearInterval(clockTimer))
</script>
