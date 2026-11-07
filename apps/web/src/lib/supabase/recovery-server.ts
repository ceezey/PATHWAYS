import { type CookieOptions, createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

import { localPasswordRecoveryOrigin } from '@/lib/auth/password-recovery'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'

// supabase-js 2.118 returns this from exchangeCodeForSession for a resetPasswordForEmail flow.
export const recoveryRedirectType = 'recovery'
// A password may be set only this long after the recovery or invite link was opened.
export const passwordRecoveryWindowSeconds = 10 * 60

const configuredSupabaseUrl = (webEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')

interface PendingAuthResponse {
  cookies: Array<{ name: string; value: string; options: CookieOptions }>
  headers: Record<string, string>
}

export const createPendingAuthResponse = (): PendingAuthResponse => ({ cookies: [], headers: {} })

interface VerifiedRecoveryIdentity {
  sessionId: string
  userId: string
}

export const getRecoveryIdentityFromVerifiedClaims = (
  claims: unknown,
  expectedUserId: string,
  now = Date.now(),
): VerifiedRecoveryIdentity | null => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null
  const payload = claims as Record<string, unknown>
  const expectedIssuer = `${configuredSupabaseUrl}/auth/v1`
  if (
    payload.iss !== expectedIssuer ||
    payload.sub !== expectedUserId ||
    typeof payload.session_id !== 'string' ||
    !payload.session_id
  ) {
    return null
  }

  // An accepted invite proves inbox control the same way a recovery link does; Auth signs its time.
  const nowSeconds = now / 1000
  const isRecentRecovery = (entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const { method, timestamp } = entry as Record<string, unknown>
    return (
      (method === 'recovery' || method === 'invite') &&
      typeof timestamp === 'number' &&
      timestamp <= nowSeconds + 60 &&
      nowSeconds - timestamp < passwordRecoveryWindowSeconds
    )
  }
  if (!Array.isArray(payload.amr) || !payload.amr.some(isRecentRecovery)) return null

  return { sessionId: payload.session_id, userId: expectedUserId }
}

export const isApprovedRecoveryRequest = (request: NextRequest, requirePostOrigin = false) => {
  const approved = new URL(localPasswordRecoveryOrigin)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')
  if (
    request.nextUrl.protocol !== approved.protocol ||
    request.headers.get('host') !== approved.host ||
    (forwardedHost !== null && forwardedHost !== approved.host) ||
    (forwardedProtocol !== null && forwardedProtocol !== approved.protocol.slice(0, -1))
  ) {
    return false
  }
  if (!requirePostOrigin) return true

  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  return origin === localPasswordRecoveryOrigin && (!fetchSite || fetchSite === 'same-origin')
}

export const recoveryAuthFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch {
    // Auth JS logs rejected fetch objects before returning a retryable error. Converting a local
    // transport failure into a generic 503 keeps URLs, request objects, and credentials out of logs.
    return new Response(null, { status: 503, statusText: 'Service Unavailable' })
  }
}

export function createRecoveryRouteClient(request: NextRequest, pending: PendingAuthResponse) {
  if (!configuredSupabaseUrl || !webSupabasePublishableKey) {
    throw new Error('The approved PATHWAYS-dev Auth client is unavailable.')
  }

  return createServerClient(configuredSupabaseUrl, webSupabasePublishableKey, {
    global: { fetch: recoveryAuthFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        pending.cookies.push(...cookiesToSet)
        Object.assign(pending.headers, headers)
      },
    },
  })
}

export const applyPendingAuthCookies = (response: NextResponse, pending: PendingAuthResponse) => {
  for (const { name, value, options } of pending.cookies) {
    const sameSite =
      options.sameSite === true
        ? 'strict'
        : options.sameSite === false
          ? undefined
          : options.sameSite
    response.cookies.set(name, value, {
      domain: options.domain,
      expires: options.expires,
      httpOnly: options.httpOnly,
      maxAge: options.maxAge,
      path: options.path,
      sameSite,
      secure: options.secure,
    })
  }
  for (const [name, value] of Object.entries(pending.headers)) {
    response.headers.set(name, value)
  }
}

export const secureRecoveryResponse = <T extends NextResponse>(response: T): T => {
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}
