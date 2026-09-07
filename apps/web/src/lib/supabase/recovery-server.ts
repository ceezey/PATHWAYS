import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { type CookieOptions, createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

import { developerSupabaseUrl } from '@/features/auth/auth-access'
import { localPasswordRecoveryOrigin } from '@/features/auth/password-recovery'
import { webEnv, webSupabasePublishableKey } from '@/lib/env'

export const passwordRecoveryIntentCookie = 'pathways-local-password-recovery'
export const passwordRecoveryIntentMaxAgeSeconds = 10 * 60
export const passwordRecoveryGrantCapacity = 8

interface LocalPasswordRecoveryGrant {
  expiresAt: number
  sessionIdHash: string
  userId: string
}

type RecoveryGrantGlobal = typeof globalThis & {
  __PATHWAYS_LOCAL_PASSWORD_RECOVERY_GRANTS_V1__?: Map<string, LocalPasswordRecoveryGrant>
}

const grantGlobal = globalThis as RecoveryGrantGlobal
const recoveryGrantPattern = /^[A-Za-z0-9_-]{43}$/

const getRecoveryGrantStore = () => {
  grantGlobal.__PATHWAYS_LOCAL_PASSWORD_RECOVERY_GRANTS_V1__ ??= new Map()
  return grantGlobal.__PATHWAYS_LOCAL_PASSWORD_RECOVERY_GRANTS_V1__
}

const hashRecoveryValue = (purpose: string, value: string) =>
  createHash('sha256')
    .update('PATHWAYS local password recovery v2\0')
    .update(purpose)
    .update('\0')
    .update(value)
    .digest('base64url')

const safeHashMatch = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const pruneRecoveryGrants = (now: number) => {
  const grants = getRecoveryGrantStore()
  for (const [key, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(key)
  }
  return grants
}

const getRecoveryGrant = (grantValue: string | undefined, now: number) => {
  if (!grantValue || !recoveryGrantPattern.test(grantValue)) return null
  const key = hashRecoveryValue('grant', grantValue)
  const grant = pruneRecoveryGrants(now).get(key)
  return grant ? { grant, key } : null
}

export interface PendingAuthResponse {
  cookies: Array<{ name: string; value: string; options: CookieOptions }>
  headers: Record<string, string>
}

export const createPendingAuthResponse = (): PendingAuthResponse => ({ cookies: [], headers: {} })

export const passwordRecoveryIntentCookieOptions = {
  httpOnly: true,
  maxAge: passwordRecoveryIntentMaxAgeSeconds,
  path: '/auth',
  // The callback begins as a top-level navigation from the Supabase email link. Lax permits
  // that redirect while still withholding the cookie from cross-site subrequests and POSTs.
  sameSite: 'lax' as const,
  secure: false,
}

export const issuePasswordRecoveryGrant = (userId: string, sessionId: string, now = Date.now()) => {
  const grants = pruneRecoveryGrants(now)

  // Only the newest verified callback for the designated local account remains usable.
  for (const [key, grant] of grants) {
    if (grant.userId === userId) grants.delete(key)
  }
  if (grants.size >= passwordRecoveryGrantCapacity) {
    throw new Error('The local password recovery grant store is full.')
  }

  let value = randomBytes(32).toString('base64url')
  let key = hashRecoveryValue('grant', value)
  while (grants.has(key)) {
    value = randomBytes(32).toString('base64url')
    key = hashRecoveryValue('grant', value)
  }

  grants.set(key, {
    expiresAt: now + passwordRecoveryIntentMaxAgeSeconds * 1000,
    sessionIdHash: hashRecoveryValue('session', sessionId),
    userId,
  })
  return value
}

export const inspectPasswordRecoveryGrant = (
  grantValue: string | undefined,
  userId: string,
  sessionId: string,
  now = Date.now(),
) => {
  const entry = getRecoveryGrant(grantValue, now)
  return Boolean(
    entry &&
      entry.grant.userId === userId &&
      safeHashMatch(entry.grant.sessionIdHash, hashRecoveryValue('session', sessionId)),
  )
}

export const consumePasswordRecoveryGrant = (
  grantValue: string | undefined,
  userId: string,
  sessionId: string,
  now = Date.now(),
) => {
  const entry = getRecoveryGrant(grantValue, now)
  if (
    !entry ||
    entry.grant.userId !== userId ||
    !safeHashMatch(entry.grant.sessionIdHash, hashRecoveryValue('session', sessionId))
  ) {
    return false
  }

  // Delete synchronously before the caller awaits the password update. This makes the grant
  // single-use even when two submissions arrive together or the provider result is uncertain.
  getRecoveryGrantStore().delete(entry.key)
  return true
}

export const resetPasswordRecoveryGrantsForTesting = () => getRecoveryGrantStore().clear()

export interface VerifiedRecoveryIdentity {
  sessionId: string
  userId: string
}

export const getRecoveryIdentityFromVerifiedClaims = (
  claims: unknown,
  expectedUserId: string,
): VerifiedRecoveryIdentity | null => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null
  const payload = claims as Record<string, unknown>
  const expectedIssuer = `${developerSupabaseUrl}/auth/v1`
  if (
    payload.iss !== expectedIssuer ||
    payload.sub !== expectedUserId ||
    typeof payload.session_id !== 'string' ||
    !payload.session_id
  ) {
    return null
  }

  const hasRecoveryMethod =
    Array.isArray(payload.amr) &&
    payload.amr.some(
      (entry) =>
        entry === 'recovery' ||
        (Boolean(entry) &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).method === 'recovery'),
    )
  if (!hasRecoveryMethod) return null

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
  if (webEnv.NEXT_PUBLIC_SUPABASE_URL !== developerSupabaseUrl || !webSupabasePublishableKey) {
    throw new Error('The approved PATHWAYS-dev Auth client is unavailable.')
  }

  return createServerClient(developerSupabaseUrl, webSupabasePublishableKey, {
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

export const clearPasswordRecoveryIntent = (response: NextResponse) => {
  response.cookies.set(passwordRecoveryIntentCookie, '', {
    ...passwordRecoveryIntentCookieOptions,
    maxAge: 0,
  })
}
