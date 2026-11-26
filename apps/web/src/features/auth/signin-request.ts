import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { webEnv } from '@/lib/env'

type SignInOutcome =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'captcha' }
  // rateLimited is the per-minute request limit, not the 15 minute failure lockout.
  | { kind: 'locked'; retryAfterSeconds: number; rateLimited?: true }

const maxLockSeconds = 900

// Formats remaining lock seconds as m:ss.
export const formatLockRemaining = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// Falls back to the full lock window when the body value is missing or invalid.
const parseRetryAfter = (body: Record<string, unknown> | null) => {
  const value = body?.retryAfterSeconds
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return maxLockSeconds
  return Math.min(maxLockSeconds, Math.ceil(value))
}

// The API counts failures and applies the lockout; credentials go nowhere else.
export async function requestSignIn(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<SignInOutcome> {
  const base = approvedApiBaseUrl(webEnv.NEXT_PUBLIC_API_BASE_URL, webEnv.NEXT_PUBLIC_API_BASE_URL)
  const response = await fetch(`${base.toString().replace(/\/$/, '')}/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(captchaToken ? { captchaToken } : {}) }),
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 429) {
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
    return {
      kind: 'locked',
      retryAfterSeconds: parseRetryAfter(body),
      ...(body?.code === 'RATE_LIMITED' ? { rateLimited: true as const } : {}),
    }
  }
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null)
    // A refused security check is not a wrong password, so the form says which it was.
    if ((body as Record<string, unknown> | null)?.code === 'CAPTCHA_FAILED')
      return { kind: 'captcha' }
    return { kind: 'invalid' }
  }
  if (response.status === 401) return { kind: 'invalid' }
  if (!response.ok) throw new Error('SIGN_IN_UNAVAILABLE')
  const body: unknown = await response.json()
  const { accessToken, refreshToken } = (body ?? {}) as Record<string, unknown>
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new Error('SIGN_IN_UNAVAILABLE')
  }
  return { kind: 'session', accessToken, refreshToken }
}
