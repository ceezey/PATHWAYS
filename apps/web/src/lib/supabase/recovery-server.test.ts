import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co' },
  webSupabasePublishableKey: 'publishable-test-fixture',
}))

import { testAuthUserId } from '@/lib/auth/auth-access.test-fixtures'
const developerAuthUserId = testAuthUserId
import { localPasswordRecoveryOrigin } from '@/lib/auth/password-recovery'
import {
  getRecoveryIdentityFromVerifiedClaims,
  isApprovedRecoveryRequest,
  passwordRecoveryWindowSeconds,
  recoveryAuthFetch,
  secureRecoveryResponse,
} from './recovery-server'

const now = 1_800_000_000_000
const nowSeconds = now / 1000

describe('password recovery server boundary', () => {
  it('accepts only verified PATHWAYS-dev recovery claims for the designated UUID', () => {
    const claims = {
      amr: [{ method: 'recovery', timestamp: nowSeconds }],
      iss: 'https://pdqwsknbzkdtiwjjibqt.supabase.co/auth/v1',
      session_id: 'test-session-id',
      sub: developerAuthUserId,
    }
    const identity = (value: unknown) =>
      getRecoveryIdentityFromVerifiedClaims(value, developerAuthUserId, now)
    expect(identity(claims)).toEqual({
      sessionId: 'test-session-id',
      userId: developerAuthUserId,
    })
    expect(
      identity({ ...claims, amr: [{ method: 'invite', timestamp: nowSeconds }] }),
    ).not.toBeNull()
    expect(identity({ ...claims, amr: [{ method: 'password', timestamp: nowSeconds }] })).toBeNull()
    expect(identity({ ...claims, sub: 'another-user' })).toBeNull()
    expect(identity({ ...claims, iss: 'https://example.com/auth/v1' })).toBeNull()
    expect(identity({ ...claims, session_id: '' })).toBeNull()
  })

  it('accepts a recovery sign-in only inside the recovery window', () => {
    const claims = {
      iss: 'https://pdqwsknbzkdtiwjjibqt.supabase.co/auth/v1',
      session_id: 'test-session-id',
      sub: developerAuthUserId,
    }
    const signedInAt = (timestamp: unknown) =>
      getRecoveryIdentityFromVerifiedClaims(
        { ...claims, amr: [{ method: 'recovery', timestamp }] },
        developerAuthUserId,
        now,
      )
    expect(signedInAt(nowSeconds - passwordRecoveryWindowSeconds + 1)).not.toBeNull()
    expect(signedInAt(nowSeconds - passwordRecoveryWindowSeconds - 1)).toBeNull()
    expect(signedInAt(nowSeconds + 3600)).toBeNull()
    expect(signedInAt(undefined)).toBeNull()
    expect(
      getRecoveryIdentityFromVerifiedClaims(
        { ...claims, amr: ['recovery'] },
        developerAuthUserId,
        now,
      ),
    ).toBeNull()
  })

  it('requires the exact request and POST origins', () => {
    const localGet = new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/callback`, {
      headers: { host: '127.0.0.1:3000' },
    })
    expect(isApprovedRecoveryRequest(localGet)).toBe(true)

    const localPost = new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/complete`, {
      headers: {
        host: '127.0.0.1:3000',
        origin: localPasswordRecoveryOrigin,
        'sec-fetch-site': 'same-origin',
      },
    })
    expect(isApprovedRecoveryRequest(localPost, true)).toBe(true)
    expect(
      isApprovedRecoveryRequest(
        new NextRequest('http://localhost:3000/auth/recovery/complete', {
          headers: { host: 'localhost:3000', origin: localPasswordRecoveryOrigin },
        }),
        true,
      ),
    ).toBe(false)
    expect(
      isApprovedRecoveryRequest(
        new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/complete`, {
          headers: {
            host: '127.0.0.1:3000',
            origin: 'https://example.com',
            'sec-fetch-site': 'cross-site',
          },
        }),
        true,
      ),
    ).toBe(false)
    expect(
      isApprovedRecoveryRequest(
        new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/complete`, {
          headers: {
            host: '127.0.0.1:3000',
            origin: localPasswordRecoveryOrigin,
            'sec-fetch-site': 'same-origin',
            'x-forwarded-host': 'example.com',
          },
        }),
        true,
      ),
    ).toBe(false)
  })

  it('converts rejected network requests into a generic retryable response', async () => {
    const originalFetch = globalThis.fetch
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('test-only-sensitive-fetch-detail'))
    try {
      const response = await recoveryAuthFetch('https://example.invalid/auth/v1/user')
      expect(response.status).toBe(503)
      expect(response.statusText).toBe('Service Unavailable')
      expect(await response.text()).toBe('')
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
      consoleError.mockRestore()
    }
  })

  it('sets security headers', () => {
    const response = secureRecoveryResponse(NextResponse.json({ ok: false }))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
