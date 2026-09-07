import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { developerAuthUserId } from '@/features/auth/auth-access'
import { localPasswordRecoveryOrigin } from '@/features/auth/password-recovery'
import {
  clearPasswordRecoveryIntent,
  consumePasswordRecoveryGrant,
  getRecoveryIdentityFromVerifiedClaims,
  inspectPasswordRecoveryGrant,
  isApprovedRecoveryRequest,
  issuePasswordRecoveryGrant,
  passwordRecoveryGrantCapacity,
  passwordRecoveryIntentCookie,
  passwordRecoveryIntentCookieOptions,
  passwordRecoveryIntentMaxAgeSeconds,
  recoveryAuthFetch,
  resetPasswordRecoveryGrantsForTesting,
  secureRecoveryResponse,
} from './recovery-server'

describe('password recovery server boundary', () => {
  beforeEach(() => resetPasswordRecoveryGrantsForTesting())

  it('accepts only verified PATHWAYS-dev recovery claims for the designated UUID', () => {
    const claims = {
      amr: [{ method: 'recovery', timestamp: 1 }],
      iss: 'https://pdqwsknbzkdtiwjjibqt.supabase.co/auth/v1',
      session_id: 'test-session-id',
      sub: developerAuthUserId,
    }
    expect(getRecoveryIdentityFromVerifiedClaims(claims, developerAuthUserId)).toEqual({
      sessionId: 'test-session-id',
      userId: developerAuthUserId,
    })
    expect(
      getRecoveryIdentityFromVerifiedClaims({ ...claims, amr: ['recovery'] }, developerAuthUserId),
    ).not.toBeNull()
    expect(
      getRecoveryIdentityFromVerifiedClaims(
        { ...claims, amr: [{ method: 'password' }] },
        developerAuthUserId,
      ),
    ).toBeNull()
    expect(
      getRecoveryIdentityFromVerifiedClaims(
        { ...claims, sub: 'another-user' },
        developerAuthUserId,
      ),
    ).toBeNull()
    expect(
      getRecoveryIdentityFromVerifiedClaims(
        { ...claims, iss: 'https://example.com/auth/v1' },
        developerAuthUserId,
      ),
    ).toBeNull()
  })

  it('issues an opaque, expiring, session-bound, single-use local grant', () => {
    const now = 1_000
    const grant = issuePasswordRecoveryGrant(developerAuthUserId, 'test-session-id', now)

    expect(grant).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(grant).not.toContain(developerAuthUserId)
    expect(grant).not.toContain('test-session-id')
    expect(inspectPasswordRecoveryGrant(grant, developerAuthUserId, 'test-session-id', now)).toBe(
      true,
    )
    expect(inspectPasswordRecoveryGrant(grant, developerAuthUserId, 'other-session', now)).toBe(
      false,
    )
    expect(consumePasswordRecoveryGrant(grant, developerAuthUserId, 'test-session-id', now)).toBe(
      true,
    )
    expect(consumePasswordRecoveryGrant(grant, developerAuthUserId, 'test-session-id', now)).toBe(
      false,
    )
  })

  it('rejects forged, expired, superseded, and over-capacity grants', () => {
    const now = 5_000
    const first = issuePasswordRecoveryGrant(developerAuthUserId, 'first-session', now)
    const newest = issuePasswordRecoveryGrant(developerAuthUserId, 'newest-session', now)
    expect(inspectPasswordRecoveryGrant(first, developerAuthUserId, 'first-session', now)).toBe(
      false,
    )
    expect(
      inspectPasswordRecoveryGrant('a'.repeat(43), developerAuthUserId, 'newest-session', now),
    ).toBe(false)
    expect(
      inspectPasswordRecoveryGrant(
        newest,
        developerAuthUserId,
        'newest-session',
        now + passwordRecoveryIntentMaxAgeSeconds * 1000,
      ),
    ).toBe(false)

    resetPasswordRecoveryGrantsForTesting()
    for (let index = 0; index < passwordRecoveryGrantCapacity; index += 1) {
      issuePasswordRecoveryGrant(`test-user-${index}`, `test-session-${index}`, now)
    }
    expect(() => issuePasswordRecoveryGrant('overflow-user', 'overflow-session', now)).toThrow()
    expect(() =>
      issuePasswordRecoveryGrant(
        'after-expiry-user',
        'after-expiry-session',
        now + passwordRecoveryIntentMaxAgeSeconds * 1000,
      ),
    ).not.toThrow()
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

  it('sets security headers and clears only the short-lived recovery marker', () => {
    const response = secureRecoveryResponse(NextResponse.json({ ok: false }))
    clearPasswordRecoveryIntent(response)
    const cookie = response.cookies.get(passwordRecoveryIntentCookie)

    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(cookie?.value).toBe('')
    expect(cookie?.httpOnly).toBe(passwordRecoveryIntentCookieOptions.httpOnly)
    expect(cookie?.path).toBe('/auth')
  })
})
