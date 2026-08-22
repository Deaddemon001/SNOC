import { defineStore } from 'pinia'
import { apiFetch, apiPost, setUnauthorizedHandler } from '../api'
import router from '../router'

export const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'syslog', label: 'Syslog' },
  { id: 'snmp', label: 'SNMP Trap(OLT Devices)' },
  { id: 'tftp', label: 'TFTP Backups' },
  { id: 'ping', label: 'Ping Monitor' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'olt', label: 'OLT Connect' },
  { id: 'uplink', label: 'UPLINK Traffic' },
  { id: 'logs', label: 'Logs' },
  { id: 'ont', label: 'ONT' },
  { id: 'users', label: 'Users' }
]

export const SETTINGS_TAB_OPTIONS = ALL_TABS.filter(t => t.id !== 'users' && t.id !== 'logs')

export function getDefaultTabsForRole(role) {
  if (role === 'admin') {
    return ['dashboard', 'syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'logs', 'ont', 'users']
  }
  return ['dashboard', 'syslog', 'snmp', 'tftp', 'ping', 'alerts', 'olt', 'uplink', 'ont']
}

export function roleLabel(role) {
  return role === 'admin' ? 'ADMIN' : 'READ-ONLY'
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    username: '',
    role: '',
    currentVisibleTabs: [],
    globalVisibleTabs: getDefaultTabsForRole('viewer'),
    loaded: false
  }),

  getters: {
    isAdmin: (s) => s.role === 'admin',
    visibleTabs(state) {
      if (state.role === 'admin') return getDefaultTabsForRole('admin')
      let tabs = Array.isArray(state.currentVisibleTabs) && state.currentVisibleTabs.length
        ? state.currentVisibleTabs
        : getDefaultTabsForRole(state.role || 'viewer')
      return tabs
    }
  },

  actions: {
    init() {
      setUnauthorizedHandler(() => {
        this.$reset()
        router.push('/login')
      })
    },

    async loadUserInfo() {
      try {
        const d = await apiFetch('/api/auth/me')
        this.username = d.username
        this.role = d.role
        this.globalVisibleTabs = Array.isArray(d.global_visible_tabs)
          ? d.global_visible_tabs.slice()
          : getDefaultTabsForRole('viewer')
        if (d.role === 'admin') {
          this.currentVisibleTabs = getDefaultTabsForRole('admin')
        } else {
          this.currentVisibleTabs = Array.isArray(d.effective_visible_tabs)
            ? d.effective_visible_tabs.slice()
            : getDefaultTabsForRole(d.role)
        }
        this.loaded = true
      } catch (_) { /* redirect handled by api layer */ }
    },

    async logout() {
      try { await apiPost('/api/auth/logout', {}) } catch (_) {}
      window.location.href = '/login'
    },

    applyGlobalTabs(tabs) {
      this.globalVisibleTabs = Array.isArray(tabs) ? tabs.slice() : []
      if (this.role !== 'admin') {
        this.currentVisibleTabs = this.currentVisibleTabs.filter(t =>
          this.globalVisibleTabs.includes(t)
        )
      }
    }
  }
})
