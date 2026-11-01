// The one place that talks to the server. Every screen calls api.get / api.post / ...
// so error handling is written once.

export const MOCK = import.meta.env.VITE_MOCK === '1'

// Vite replaces import.meta.env.VITE_MOCK with a constant at build time, so in a normal build the
// mock branch is dead code and the mock files never reach the browser. The check is written inline
// (not via MOCK) wherever the mock is imported, because the bundler only folds a constant it can see
// in the same expression.
const doFetch = import.meta.env.VITE_MOCK === '1'
  ? async (...args) => (await import('./mock/server.js')).mockFetch(...args)
  : fetch

// What a screen catches. `reason` is only set for check-in refusals (see the table in API.md).
export class ApiError extends Error {
  constructor(status, message, reason, data) {
    super(message)
    this.status = status
    this.reason = reason
    this.data = data // the whole error body, for refusals that carry extra fields
  }
}

export async function api(method, path, body) {
  const res = await doFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null) // an error page that isn't JSON must not crash us
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong', data?.reason, data)
  return data
}

api.get = (path) => api('GET', path)
api.post = (path, body) => api('POST', path, body ?? {})
api.put = (path, body) => api('PUT', path, body)
api.delete = (path) => api('DELETE', path)
