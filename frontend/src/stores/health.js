import { defineStore } from 'pinia'
import { apiFetch } from '../api'

export const useHealthStore = defineStore('health', {
  state: () => ({
    data: null,
    isRestarting: false,
    error: null
  }),

  actions: {
    async refresh() {
      if (this.isRestarting) return
      try {
        const d = await apiFetch('/api/system/health_detailed')
        this.data = d
        this.error = null
      } catch (e) {
        this.error = e.message
      }
    }
  }
})
