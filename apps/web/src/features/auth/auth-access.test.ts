import { describe, expect, it, vi } from 'vitest'

import {
  AuthAccessError,
  applicationContextSchema,
  developerAuthUserId,
  getLocalAuthEndpoint,
  getProfileRole,
  hasCurrentProfile,
  parseApplicationProfile,
  parseMfaStatus,
  requestAuthJson,
} from './auth-access'

const profile = {
  id: developerAuthUserId,
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  fullName: 'Test Developer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['test.read'],
  assignedProjectIds: [],
  aal: 'aal2',
}

describe('database-authoritative developer access', () => {
  it('accepts only the designated server-verified aal2 application profile', () => {
    const parsed = parseApplicationProfile({ user: profile })
    expect(getProfileRole(parsed)).toBe('System Administrator')
    expect(parsed.permissions).toEqual(['test.read'])
  })

  it.each([
    { aal: 'aal1' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    { roles: ['admin'] },
    { roles: ['UNKNOWN_ROLE'] },
    { roles: [] },
    { roles: ['SYSTEM_ADMINISTRATOR', 'PROJECT_OFFICER'] },
    { organizationId: '' },
    { userId: '' },
    { assignedProjectIds: ['not-a-uuid'] },
  ])('rejects an unsafe or incomplete profile (%j)', (override) => {
    expect(() => parseApplicationProfile({ user: { ...profile, ...override } })).toThrow()
  })

  it('cannot use app_metadata or user_metadata to supply roles or assignments', () => {
    expect(() =>
      parseApplicationProfile({
        user: {
          ...profile,
          roles: [],
          app_metadata: { roles: ['SYSTEM_ADMINISTRATOR'], assignedProjectIds: [profile.userId] },
          user_metadata: { role: 'SYSTEM_ADMINISTRATOR' },
        },
      }),
    ).toThrow()
  })

  it('rejects another identity and disabled enrollment status', () => {
    const status = {
      authUserId: developerAuthUserId,
      aal: 'aal1',
      enrollmentAllowed: true,
      applicationAccessEnabled: false,
    }
    expect(parseMfaStatus(status).applicationAccessEnabled).toBe(false)
    expect(() => parseMfaStatus({ ...status, authUserId: profile.userId })).toThrow()
    expect(() => parseMfaStatus({ ...status, enrollmentAllowed: false })).toThrow()
  })

  it('invalidates stale access after refresh, sign-out, or a different token', () => {
    expect(hasCurrentProfile('same-test-token', 'same-test-token')).toBe(true)
    expect(hasCurrentProfile('old-test-token', 'new-test-token')).toBe(false)
    expect(hasCurrentProfile('old-test-token', undefined)).toBe(false)
    expect(hasCurrentProfile(undefined, undefined)).toBe(false)
  })

  it('validates UUID context selectors rather than organization codes', () => {
    expect(
      applicationContextSchema.safeParse({ userId: profile.userId, organizationId: 'PLAN_PH' })
        .success,
    ).toBe(false)
  })
})

describe('private, local-only auth requests', () => {
  it.each([
    'https://example.com/api',
    'https://localhost.evil.example/api',
    'http://user:password@localhost:4000/api',
    'ftp://localhost/api',
    'http://localhost:4000/api?token=not-real',
    'http://localhost:4000/api#fragment',
  ])('rejects unsafe API configuration before sending a bearer token', async (base) => {
    const fetcher = vi.fn()
    await expect(
      requestAuthJson(base, '/auth/me', 'test-only-token', undefined, undefined, fetcher),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses a no-store GET without cookies, redirects, referrers or token URLs', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: profile }) })
    const controller = new AbortController()
    const context = { userId: profile.userId, organizationId: profile.organizationId }
    await requestAuthJson(
      'http://localhost:4000/api/',
      '/auth/me',
      'test-only-token',
      controller.signal,
      context,
      fetcher,
    )
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:4000/api/auth/me', {
      headers: {
        Authorization: 'Bearer test-only-token',
        'X-Pathways-User-Id': profile.userId,
        'X-Pathways-Organization-Id': profile.organizationId,
      },
      signal: expect.any(AbortSignal),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    expect(getLocalAuthEndpoint('http://127.0.0.1:4000/api', '/auth/mfa/status')).toBe(
      'http://127.0.0.1:4000/api/auth/mfa/status',
    )
    expect(getLocalAuthEndpoint('http://localhost:4000/api', '/auth/mfa/status')).toBe(
      'http://127.0.0.1:4000/api/auth/mfa/status',
    )
    expect(getLocalAuthEndpoint('http://[::1]:4000/api', '/auth/mfa/status')).toBe(
      'http://127.0.0.1:4000/api/auth/mfa/status',
    )
  })

  it('does not surface server error bodies or credentials', async () => {
    const json = vi.fn().mockResolvedValue({ message: 'test-secret-must-not-be-shown' })
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json })
    await expect(
      requestAuthJson(
        'http://localhost:4000/api',
        '/auth/me',
        'test-only-token',
        undefined,
        undefined,
        fetcher,
      ),
    ).rejects.toThrow('No protected access was granted')
    expect(json).not.toHaveBeenCalled()
  })

  it.each([401, 403, 500])('reports a safe failure for HTTP %s', async (status) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status })
    await expect(
      requestAuthJson(
        'http://127.0.0.1:4000/api',
        '/auth/me',
        'test-only-token',
        undefined,
        undefined,
        fetcher,
      ),
    ).rejects.toEqual(new AuthAccessError(status))
  })

  it('does not leak a network exception and permits cancelling a superseded request', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn().mockImplementation((_url, options) => {
      expect(options.signal.aborted).toBe(false)
      controller.abort()
      expect(options.signal.aborted).toBe(true)
      throw new Error('test-secret-must-not-be-shown')
    })
    await expect(
      requestAuthJson(
        'http://127.0.0.1:4000/api',
        '/auth/me',
        'test-only-token',
        controller.signal,
        undefined,
        fetcher,
      ),
    ).rejects.toEqual(new AuthAccessError('network'))
  })

  it('bounds a stalled access check and clears its deadline', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(new Error('private-timeout-detail')),
              { once: true },
            )
          }),
      )
      const outcome = requestAuthJson(
        'http://127.0.0.1:4000/api',
        '/auth/me',
        'test-only-token',
        undefined,
        undefined,
        fetcher,
      ).catch((error) => error)
      await vi.advanceTimersByTimeAsync(20_001)
      expect(await outcome).toEqual(new AuthAccessError('timeout'))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
