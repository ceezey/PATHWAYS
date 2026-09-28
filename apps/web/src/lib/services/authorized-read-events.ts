// Signals only: they carry no data. The API still authorizes every request.
export const AUTHORIZATION_DENIED_EVENT = 'pathways:authorization-denied'
export const WRITE_COMMITTED_EVENT = 'pathways:write-committed'

const announce = (name: string) => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(name))
  }
}

/** Any 401/403 response: cached authorized reads must not be reused. */
export const announceAuthorizationDenied = () => announce(AUTHORIZATION_DENIED_EVENT)

/** A successful write: cached authorized reads are stale for the next mount. */
export const announceWriteCommitted = () => announce(WRITE_COMMITTED_EVENT)
