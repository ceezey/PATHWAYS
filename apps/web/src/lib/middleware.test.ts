import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  claims: vi.fn(),
  client: vi.fn(),
  session: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@supabase/ssr', () => ({ createServerClient: mock.client }))
vi.mock('@/lib/env', () => ({
  webEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co',
    NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api',
  },
  webSupabasePublishableKey: 'publishable-test-fixture',
}))

import { type ApplicationProfile, developerAuthUserId } from '@/features/auth/auth-access'
import { encodeWorkspaceContext } from '@/features/auth/workspace-access'
import { updateSession } from './middleware'

const validClaims = {
  sub: developerAuthUserId,
  iss: 'https://pdqwsknbzkdtiwjjibqt.supabase.co/auth/v1',
  aud: 'authenticated',
  is_anonymous: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mock.fetch)
  mock.client.mockImplementation((_url, _key, options) => {
    options.cookies.setAll([{ name: 'test-session', value: 'test-cookie', options: { path: '/' } }])
    return { auth: { getClaims: mock.claims, getSession: mock.session } }
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('workspace middleware server authority', () => {
  const profile: ApplicationProfile = {
    id: developerAuthUserId,
    aal: 'aal2' as const,
    userId: '40000000-0000-4000-8000-000000000004',
    organizationId: '30000000-0000-4000-8000-000000000003',
    fullName: 'Synthetic developer',
    roles: ['SYSTEM_ADMINISTRATOR' as const],
    permissions: ['projects.read'],
    assignedProjectIds: [],
  }
  const request = () =>
    new NextRequest('http://127.0.0.1:3000/workspace', {
      headers: {
        host: '127.0.0.1:3000',
        cookie: `pathways-context=${encodeWorkspaceContext(profile)}`,
      },
    })
  beforeEach(() => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, aal: 'aal2' } },
      error: null,
    })
    mock.session.mockResolvedValue({
      data: { session: { access_token: 'synthetic-bearer' } },
      error: null,
    })
    mock.fetch.mockResolvedValue(Response.json({ user: profile }))
  })
  it('permits rendering only after NestJS verifies the selected current profile', async () => {
    const response = await updateSession(request())
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mock.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/api/auth/me',
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    )
  })
  it('classifies a profile outage at the middleware boundary with no private contents', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mock.fetch.mockResolvedValue(new Response('SYNTHETIC_PRIVATE_PROVIDER_BODY', { status: 503 }))
    const response = await updateSession(request())
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/auth/mfa')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.cookies.get('pathways-context')?.value).toBe('')
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'MIDDLEWARE',
      stage: 'PROFILE',
      reason: 'HTTP_503',
    })
    expect(JSON.stringify(output.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_PROVIDER_BODY')
  })
  it('distinguishes a missing context from a middleware route API outage', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await updateSession(new NextRequest('http://127.0.0.1:3000/dashboard'))
    expect(output).toHaveBeenLastCalledWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'MIDDLEWARE',
      stage: 'CONTEXT',
      reason: 'CHECK_REJECTED',
    })
    output.mockClear()
    mock.fetch
      .mockResolvedValueOnce(Response.json({ user: profile }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    const response = await updateSession(
      new NextRequest('http://127.0.0.1:3000/dashboard', {
        headers: { cookie: `pathways-context=${encodeWorkspaceContext(profile)}` },
      }),
    )
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/auth/mfa')
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'MIDDLEWARE',
      stage: 'ROUTE_API',
      reason: 'HTTP_503',
    })
  })
  it('does not emit operational denial logs for public or successful MFA requests', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await updateSession(new NextRequest('http://127.0.0.1:3000/public/projects'))
    await updateSession(new NextRequest('http://127.0.0.1:3000/auth/mfa'))
    expect(output).not.toHaveBeenCalled()
  })
  it('revalidates a direct protected route independently of navigation and marks it private', async () => {
    const direct = () =>
      new NextRequest('http://127.0.0.1:3000/dashboard', {
        headers: {
          host: '127.0.0.1:3000',
          cookie: `pathways-context=${encodeWorkspaceContext(profile)}`,
        },
      })
    mock.fetch.mockResolvedValueOnce(Response.json({ user: profile })).mockResolvedValueOnce(
      Response.json({
        route: 'dashboard',
        presentation: 'prototype-only',
        beneficiaryAccess: 'records-or-none',
      }),
    )
    const response = await updateSession(direct())
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(new URL(mock.fetch.mock.calls[1][0]).pathname).toBe('/api/access/route-check')
    mock.fetch
      .mockResolvedValueOnce(Response.json({ user: profile }))
      .mockResolvedValueOnce(new Response('', { status: 403 }))
    const revoked = await updateSession(direct())
    expect(revoked.headers.get('location')).toBe('http://127.0.0.1:3000/unauthorized')
  })
  it.each([
    { permissions: [] },
    { organizationId: '50000000-0000-4000-8000-000000000005' },
    { userId: '50000000-0000-4000-8000-000000000005' },
  ])('rejects missing permissions or tampered context %#', async (override) => {
    mock.fetch.mockResolvedValue(Response.json({ user: { ...profile, ...override } }))
    expect((await updateSession(request())).headers.get('location')).toBe(
      'http://127.0.0.1:3000/auth/mfa',
    )
  })
  it.each([401, 403, 404, 500, 503])(
    'fails closed when the authority denies %i',
    async (status) => {
      mock.fetch.mockResolvedValue(new Response('', { status }))
      const response = await updateSession(request())
      expect(response.headers.get('location')).toBe(
        status === 401 ? 'http://127.0.0.1:3000/staff/login' : 'http://127.0.0.1:3000/auth/mfa',
      )
      expect(response.cookies.get('pathways-context')?.value).toBe('')
      expect(response.cookies.get('test-session')?.value).toBe('test-cookie')
    },
  )
  it('clears a stale selection when the authority revokes membership between page requests', async () => {
    expect((await updateSession(request())).headers.get('location')).toBeNull()
    mock.fetch.mockResolvedValue(new Response('', { status: 403 }))
    const denied = await updateSession(request())
    expect(denied.headers.get('location')).toBe('http://127.0.0.1:3000/auth/mfa')
    expect(denied.cookies.get('pathways-context')?.value).toBe('')
    expect(mock.fetch).toHaveBeenCalledTimes(2)
  })
  it.each([
    '/workspace',
    '/projects/50000000-0000-4000-8000-000000000005',
    '/beneficiaries/50000000-0000-4000-8000-000000000005',
  ])('keeps missing-context and unassigned business deep links closed: %s', async (path) => {
    const response = await updateSession(
      new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { host: '127.0.0.1:3000' } }),
    )
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/auth/mfa')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('does not request business authority for a testing identity or password-only session', async () => {
    for (const claims of [
      { ...validClaims, aal: 'aal1' },
      { ...validClaims, aal: 'aal2', sub: '55be171a-e6fd-496c-bcde-192dfbdc4223' },
    ]) {
      mock.claims.mockResolvedValue({ data: { claims }, error: null })
      expect((await updateSession(request())).headers.get('location')).toBe(
        'http://127.0.0.1:3000/auth/mfa',
      )
    }
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})

describe('supporting middleware MFA gate', () => {
  it('redirects password-only dashboard requests to MFA, preserving refreshed cookies', async () => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, aal: 'aal1' } },
      error: null,
    })
    const response = await updateSession(
      new NextRequest('http://localhost:3000/dashboard?ignored=1'),
    )
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/mfa')
    expect(response.cookies.get('test-session')?.value).toBe('test-cookie')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('lets aal1 reach enrollment without a redirect loop', async () => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, aal: 'aal1' } },
      error: null,
    })
    const response = await updateSession(new NextRequest('http://localhost:3000/auth/mfa'))
    expect(response.headers.get('location')).toBeNull()
  })

  it('keeps business server-rendered routes closed even with designated aal2', async () => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, aal: 'aal2' } },
      error: null,
    })
    const response = await updateSession(new NextRequest('http://localhost:3000/dashboard'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/mfa')
  })

  it('does not permit another aal2 account into business pages', async () => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, sub: 'other-test-user', aal: 'aal2' } },
      error: null,
    })
    const response = await updateSession(new NextRequest('http://localhost:3000/dashboard'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/auth/mfa')
  })

  it('fails closed on expired, invalid and unavailable authentication', async () => {
    for (const result of [
      { data: null, error: null },
      { data: { claims: {} }, error: { message: 'invalid' } },
    ]) {
      mock.claims.mockResolvedValueOnce(result)
      const response = await updateSession(new NextRequest('http://localhost:3000/dashboard'))
      expect(response.headers.get('location')).toBe('http://localhost:3000/staff/login')
    }
    mock.claims.mockRejectedValueOnce(new Error('offline-test'))
    expect(
      (await updateSession(new NextRequest('http://localhost:3000/dashboard'))).headers.get(
        'location',
      ),
    ).toBe('http://localhost:3000/staff/login')
  })

  it.each([
    { iss: 'https://example.com/auth/v1' },
    { aud: 'service_role' },
    { is_anonymous: true },
    { is_anonymous: undefined },
  ])('rejects wrong issuer/audience and anonymous claims before MFA setup', async (override) => {
    mock.claims.mockResolvedValue({
      data: { claims: { ...validClaims, aal: 'aal1', ...override } },
      error: null,
    })
    expect(
      (await updateSession(new NextRequest('http://localhost:3000/auth/mfa'))).headers.get(
        'location',
      ),
    ).toBe('http://localhost:3000/staff/login')
  })
})
