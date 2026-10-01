import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'

export type SignInOutcome =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'locked' }

// The API counts failures and applies the lockout; credentials go nowhere else.
export async function requestSignIn(email: string, password: string): Promise<SignInOutcome> {
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  const response = await fetch(`${base.toString().replace(/\/$/, '')}/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 429) return { kind: 'locked' }
  if (response.status === 400 || response.status === 401) return { kind: 'invalid' }
  if (!response.ok) throw new Error('SIGN_IN_UNAVAILABLE')
  const body: unknown = await response.json()
  const { accessToken, refreshToken } = (body ?? {}) as Record<string, unknown>
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new Error('SIGN_IN_UNAVAILABLE')
  }
  return { kind: 'session', accessToken, refreshToken }
}
