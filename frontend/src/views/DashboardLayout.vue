<template>
  <div v-if="auth.loaded" class="app-shell">
    <AppHeader @open-settings="settingsOpen = true" @refresh="onRefresh" />
    <TabBar :tabs="orderedTabs" />
    <div class="tab-content">
      <router-view v-if="tabAllowed" :key="refreshKey" />
      <div v-else class="no-access">
        <div class="panel">
          <div class="ph"><div class="pt">Access Restricted</div></div>
          <div class="pb">You do not have permission to view this tab. Contact your administrator.</div>
        </div>
      </div>
    </div>

    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <RestartModal v-if="restartOpen" :target="restartTarget" @close="restartOpen = false" @restarting="onRestarting" />
    <ShutdownModal v-if="shutdownOpen" @close="shutdownOpen = false" @shutting-down="onShuttingDown" />
    <ReconnectModal v-if="reconnecting" :message="reconnectMsg" @done="reconnecting = false" />

    <div v-if="updateError" class="conn-err-banner">
      Connection lost &mdash; retrying... ({{ updateError }})
    </div>
  </div>
  <div v-else class="boot-loading">Connecting to Smart NOC...</div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore, ALL_TABS } from '../stores/auth'
import AppHeader from '../components/layout/AppHeader.vue'
import TabBar from '../components/layout/TabBar.vue'
import SettingsModal from '../components/layout/SettingsModal.vue'
import RestartModal from '../components/layout/RestartModal.vue'
import ShutdownModal from '../components/layout/ShutdownModal.vue'
import ReconnectModal from '../components/layout/ReconnectModal.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const settingsOpen = ref(false)
const restartOpen = ref(false)
const restartTarget = ref('all')
const shutdownOpen = ref(false)
const reconnecting = ref(false)
const reconnectMsg = ref('')
const updateError = ref('')
const refreshKey = ref(0)

function onRefresh() { refreshKey.value++ }

provide('openRestart', (target) => { restartTarget.value = target || 'all'; restartOpen.value = true })
provide('openShutdown', () => { shutdownOpen.value = true })
provide('startReconnect', (msg) => { reconnectMsg.value = msg || 'Restarting...'; reconnecting.value = true })

function onRestarting() { restartOpen.value = false }
function onShuttingDown() { shutdownOpen.value = false }

const TAB_ORDER_KEY = 'noc_tab_order'
const orderVersion = ref(0)
window.addEventListener('noc-tab-order-changed', () => { orderVersion.value++ })

const orderedTabs = computed(() => {
  void orderVersion.value
  let order
  try { order = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || 'null') } catch (_) { order = null }
  const allowed = auth.visibleTabs
  const list = ALL_TABS.filter(t => allowed.includes(t.id))
  if (!Array.isArray(order)) return list
  const known = order.filter(id => allowed.includes(id))
  const rest = list.map(t => t.id).filter(id => !known.includes(id))
  return [...known, ...rest].map(id => ALL_TABS.find(t => t.id === id))
})

const tabAllowed = computed(() => {
  if (!route.name || route.name === 'login') return true
  if (route.path === '/') return true
  return auth.visibleTabs.includes(route.name)
})

onMounted(async () => {
  await auth.loadUserInfo()
  if (!auth.loaded) return
  const current = route.name
  if (current && current !== 'dashboard' && !auth.visibleTabs.includes(current)) {
    router.replace('/dashboard')
  }
})
</script>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
.tab-content { flex: 1; }
.boot-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-family: 'Share Tech Mono', monospace;
  letter-spacing: 2px;
}
.no-access { margin-top: 12px; padding: 0 16px; }
.conn-err-banner {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: rgba(255,45,85,0.15);
  border-top: 1px solid var(--danger);
  color: var(--danger);
  text-align: center;
  padding: 6px;
  font-size: 12px;
  z-index: 5000;
}
</style>
