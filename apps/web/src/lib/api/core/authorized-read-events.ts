// Signals only: they carry no data. The API still authorizes every request.
export const AUTHORIZATION_DENIED_EVENT = 'pathways:authorization-denied'
export const WRITE_COMMITTED_EVENT = 'pathways:write-committed'
/** The API ended this session (revoked, idle, expired or over the device limit); the browser signs out. */
export const SESSION_ENDED_EVENT = 'pathways:session-ended'
export const SESSION_ENDED_CODE = 'SESSION_ENDED'

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

export const announceSessionEnded = () => announce(new Event(SESSION_ENDED_EVENT))

/** A successful write: cached authorized reads are stale for the next mount. */
export const announceWriteCommitted = () => announce(new Event(WRITE_COMMITTED_EVENT))
