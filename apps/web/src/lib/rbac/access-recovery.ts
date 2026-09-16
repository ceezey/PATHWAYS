/** Fixed, non-sensitive recovery destination. Never accept a caller-supplied redirect. */
export const ACCESS_UNAVAILABLE_PATH = '/auth/access-unavailable'

/** An Auth provider outage is not evidence that the user needs another login.
 * Inspect only own data properties, never private messages or response bodies.
 */
export function providerFailureStatus(error: unknown): 401 | 503 {
  if (!error || typeof error !== 'object') return 503
  const status = Object.getOwnPropertyDescriptor(error, 'status')?.value
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value
  if (status === 401 || status === 403) return 401
  if (
    typeof code === 'string' &&
    [
      'session_not_found',
      'refresh_token_not_found',
      'bad_jwt',
      'user_not_found',
      'user_banned',
    ].includes(code)
  )
    return 401
  return 503
}
