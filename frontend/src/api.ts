const API = window.location.protocol + '//' + window.location.host

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}


export interface ApiFetchOptions extends RequestInit {
  timeout?: number
}

export async function apiFetch<T = any>(url: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { timeout, signal: externalSignal, ...fetchOpts } = opts
  const controller = new AbortController()

  // Default timeout: 30s for standard requests, 180s (3 min) for long-running OLT polling, backups, and actions
  const isLongRunning =
    url.includes('/api/olt/poll') ||
    url.includes('/api/olt/raw_output') ||
    url.includes('/api/olt/discover') ||
    url.includes('/api/olt/test_connection') ||
    url.includes('/api/backup/') ||
    url.includes('/api/system/service_action')

  const effectiveTimeout = timeout !== undefined ? timeout : (isLongRunning ? 180000 : 30000)

  let timeoutId: any = null
  if (effectiveTimeout > 0) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, effectiveTimeout)
  }

  // Chain external signal if supplied
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  fetchOpts.signal = controller.signal
  fetchOpts.credentials = 'include'

  try {
    const r = await fetch(API + url, fetchOpts)
    if (timeoutId) clearTimeout(timeoutId)

    if (r.status === 401) {
      let errMsg = 'Invalid username or password'
      try {
        const errJson = await r.json()
        if (errJson && errJson.error) errMsg = errJson.error
      } catch (_) {}
      if (url !== '/api/auth/login' && onUnauthorized) {
        onUnauthorized()
      }
      const errObj = new Error(errMsg) as Error & { backendError?: string }
      errObj.backendError = errMsg
      throw errObj
    }

    if (!r.ok) {
      let errMsg = 'HTTP ' + r.status + ' on ' + url
      try {
        const errJson = await r.json()
        if (errJson && errJson.error) errMsg = errJson.error
      } catch (_) { /* not json */ }
      const errObj = new Error(errMsg) as Error & { backendError?: string }
      errObj.backendError = errMsg
      throw errObj
    }
    return r.json()
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId)
    throw err
  }
}

export function apiPost<T = any>(url: string, body: any, opts: ApiFetchOptions = {}): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...opts
  })
}

export { API }

