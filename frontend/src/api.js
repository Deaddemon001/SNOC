const API = window.location.protocol + '//' + window.location.host

let onUnauthorized = null
export function setUnauthorizedHandler(fn) { onUnauthorized = fn }

export async function apiFetch(url, opts = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  opts.signal = controller.signal
  opts.credentials = 'include'

  try {
    const r = await fetch(API + url, opts)
    clearTimeout(timeoutId)
    if (r.status === 401) {
      if (onUnauthorized) onUnauthorized()
      throw new Error('401')
    }
    if (!r.ok) {
      let errMsg = 'HTTP ' + r.status + ' on ' + url
      try {
        const errJson = await r.json()
        if (errJson && errJson.error) errMsg = errJson.error
      } catch (_) { /* not json */ }
      const errObj = new Error(errMsg)
      errObj.backendError = errMsg
      throw errObj
    }
    return r.json()
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

export function apiPost(url, body) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

export { API }
