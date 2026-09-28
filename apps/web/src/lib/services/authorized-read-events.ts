// Signals only: they carry no data. The API still authorizes every request.
export const AUTHORIZATION_DENIED_EVENT = 'pathways:authorization-denied'
export const WRITE_COMMITTED_EVENT = 'pathways:write-committed'

const announce = (event: Event) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(event)
  }
}

/**
 * Any 401/403 response: cached authorized reads must not be reused. `token` identifies
 * the one denial (the thrown error), so a listener that sees it again does not count it
 * twice.
 */
export const announceAuthorizationDenied = (token?: object) =>
  announce(
    typeof CustomEvent === 'function'
      ? new CustomEvent(AUTHORIZATION_DENIED_EVENT, { detail: token ?? null })
      : new Event(AUTHORIZATION_DENIED_EVENT),
  )

/** The denial token carried by an AUTHORIZATION_DENIED event, when there is one. */
export const authorizationDenialToken = (event: Event): object | null => {
  const detail = (event as CustomEvent<unknown>).detail
  return typeof detail === 'object' && detail !== null ? detail : null
}

/** A successful write: cached authorized reads are stale for the next mount. */
export const announceWriteCommitted = () => announce(new Event(WRITE_COMMITTED_EVENT))
