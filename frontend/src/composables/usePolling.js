import { onMounted, onUnmounted } from 'vue'

export function usePolling(fn, intervalMs, immediate = true) {
  let timer = null

  function start() {
    if (timer) return
    if (immediate) fn()
    timer = setInterval(fn, intervalMs)
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null }
  }

  onMounted(start)
  onUnmounted(stop)

  return { start, stop }
}
