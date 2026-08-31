const API = window.location.protocol + '//' + window.location.host

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function apiFetch<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)
  opts.signal = controller.signal
  opts.credentials = 'include'

  try {
    const r = await fetch(API + url, opts)
    clearTimeout(timeoutId)

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
    clearTimeout(timeoutId)
    throw err
  }
}

export function apiPost<T = any>(url: string, body: any): Promise<T> {
  return apiFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export { API }
