import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ claims: vi.fn(), client: vi.fn(), fetch: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient: mock.client }))
vi.mock('@/lib/env', () => ({
  webEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
    NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api',
  },
  webSupabasePublishableKey: 'synthetic-publishable-fixture',
}))
import type { ApplicationProfile } from '@/features/auth/auth-access'
import { encodeWorkspaceContext } from '@/features/auth/workspace-access'
import { updateSession } from './middleware'

const id = '10000000-0000-4000-8000-000000000001'
const claims = {
  sub: id,
  iss: 'https://fixture.supabase.co/auth/v1',
  aud: 'authenticated',
  is_anonymous: false,
  aal: 'aal2',
}
const profile = { id, userId: id, organizationId: id } as ApplicationProfile
const context = encodeWorkspaceContext(profile)
const request = (path = '/dashboard', cookie = context) =>
  new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers: { host: '127.0.0.1:3000', cookie: `pathways-context=${cookie}` },
  })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mock.fetch)
  mock.claims.mockResolvedValue({ data: { claims }, error: null })
  mock.client.mockImplementation((_url, _key, options) => {
    options.cookies.setAll([
      { name: 'test-session', value: 'refreshed-fixture', options: { path: '/' } },
    ])
    return { auth: { getClaims: mock.claims } }
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('optimistic middleware; server page/API remain the secure boundaries', () => {
  it.each([
    '/dashboard',
    '/workspace',
    `/projects/${id}`,
    '/analytics',
    '/auth/mfa',
    '/settings/profile',
    `/beneficiaries/${id}?projectId=${id}&returnTo=%2Fbeneficiaries%3Fq%3Dsample`,
    `/beneficiaries/${id}/edit?projectId=${id}`,
  ])(
    'admits structurally valid %s to the server gate without duplicate authority RPCs',
    async (path) => {
      const result = await updateSession(request(path))
      expect(result.headers.get('location')).toBeNull()
      expect(mock.fetch).not.toHaveBeenCalled()
      expect(mock.claims).toHaveBeenCalledTimes(1)
      expect(result.headers.get('cache-control')).toBe('private, no-store')
      expect(result.cookies.get('test-session')?.value).toBe('refreshed-fixture')
    },
  )
  it.each(['/', '/public/projects', '/auth/access-unavailable'])(
    'never starts internal discovery on %s',
    async (path) => {
      await updateSession(request(path))
      expect(mock.client).not.toHaveBeenCalled()
      expect(mock.fetch).not.toHaveBeenCalled()
    },
  )
  it('sends a real password-only session to MFA and preserves refreshed Auth cookies', async () => {
    mock.claims.mockResolvedValue({ data: { claims: { ...claims, aal: 'aal1' } } })
    const result = await updateSession(request())
    expect(result.headers.get('location')).toBe('http://127.0.0.1:3000/auth/mfa')
    expect(result.cookies.get('pathways-context')?.value).toBe('')
    expect(result.cookies.get('test-session')?.value).toBe('refreshed-fixture')
  })
  it('lets aal1 reach the actual MFA form without looping', async () => {
    mock.claims.mockResolvedValue({ data: { claims: { ...claims, aal: 'aal1' } } })
    expect((await updateSession(request('/auth/mfa'))).headers.get('location')).toBeNull()
  })
  it.each([
    '',
    'not-json',
    encodeWorkspaceContext({ ...profile, id: '20000000-0000-4000-8000-000000000002' }),
  ])(
    'routes missing/invalid/foreign selectors to bootstrap, not to protected data %#',
    async (cookie) => {
      const result = await updateSession(request('/dashboard', cookie))
      expect(result.headers.get('location')).toBe('http://127.0.0.1:3000/auth/mfa')
      expect(mock.fetch).not.toHaveBeenCalled()
    },
  )
  it.each([
    { iss: 'https://untrusted.invalid' },
    { aud: 'service_role' },
    { is_anonymous: true },
    { is_anonymous: undefined },
    { sub: 'not-a-uuid' },
  ])('rejects invalid verified-claim shape %#', async (override) => {
    mock.claims.mockResolvedValue({ data: { claims: { ...claims, ...override } } })
    expect((await updateSession(request())).headers.get('location')).toBe(
      'http://127.0.0.1:3000/staff/login',
    )
  })
  it('routes missing authentication to login', async () => {
    mock.claims.mockResolvedValue({ data: null, error: null })
    expect((await updateSession(request())).headers.get('location')).toBe(
      'http://127.0.0.1:3000/staff/login',
    )
  })
  it('keeps an Auth outage separate from credential rejection and preserves selectors', async () => {
    mock.claims.mockResolvedValue({
      data: null,
      error: { status: 503, message: 'PRIVATE_DO_NOT_RENDER' },
    })
    const result = await updateSession(request())
    expect(result.headers.get('location')).toBe('http://127.0.0.1:3000/auth/access-unavailable')
    expect(result.cookies.get('pathways-context')).toBeUndefined()
    expect(result.cookies.get('test-session')?.value).toBe('refreshed-fixture')
    expect(result.headers.get('referrer-policy')).toBe('no-referrer')
  })
  it('handles thrown network errors without disclosing messages or clearing context', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mock.claims.mockRejectedValue(new Error('PRIVATE_DO_NOT_RENDER'))
    const result = await updateSession(request())
    expect(result.headers.get('location')).toContain('/auth/access-unavailable')
    expect(result.cookies.get('pathways-context')).toBeUndefined()
    expect(JSON.stringify(output.mock.calls)).not.toContain('PRIVATE_DO_NOT_RENDER')
  })
  it('sends confirmed expired authentication to login, without retaining selectors', async () => {
    mock.claims.mockResolvedValue({ data: null, error: { status: 401 } })
    const result = await updateSession(request())
    expect(result.headers.get('location')).toContain('/staff/login')
    expect(result.cookies.get('pathways-context')?.value).toBe('')
  })
  it('does not follow a caller-supplied redirect target', async () => {
    const result = await updateSession(request('/dashboard?next=https://untrusted.invalid'))
    expect(result.headers.get('location')).toBe('http://127.0.0.1:3000/unauthorized')
    expect(result.cookies.get('pathways-context')).toBeUndefined()
  })
})
