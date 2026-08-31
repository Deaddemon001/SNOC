import { useEffect, useRef } from 'react'

export function usePolling(fn: () => void | Promise<void>, intervalMs: number = 10000, immediate: boolean = true) {
  const savedFn = useRef(fn)

  useEffect(() => {
    savedFn.current = fn
  }, [fn])

  useEffect(() => {
    if (immediate) {
      savedFn.current()
    }
    const timer = setInterval(() => {
      savedFn.current()
    }, intervalMs)

    return () => clearInterval(timer)
  }, [intervalMs, immediate])
}
