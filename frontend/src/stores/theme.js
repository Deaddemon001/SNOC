import { defineStore } from 'pinia'

const THEME_KEY = 'noc_theme'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'dark',
    listeners: []
  }),

  actions: {
    init() {
      try {
        const saved = localStorage.getItem(THEME_KEY)
        if (saved === 'light') this.mode = 'light'
      } catch (_) {}
      this.apply()
    },

    toggle() {
      this.mode = this.mode === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(THEME_KEY, this.mode) } catch (_) {}
      this.apply()
      this.listeners.forEach(fn => fn(this.chartTheme))
    },

    apply() {
      document.body.classList.toggle('light-mode', this.mode === 'light')
    },

    onChartThemeChange(fn) {
      this.listeners.push(fn)
    },

    get chartTheme() {
      if (this.mode === 'light') {
        return { tick: '#64748b', grid: '#e2e8f0', legend: '#0f172a' }
      }
      return { tick: '#7a9aad', grid: '#0f2a3f', legend: '#cde8f5' }
    }
  }
})
