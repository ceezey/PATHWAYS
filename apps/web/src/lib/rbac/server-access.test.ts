import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  claims: vi.fn(),
  session: vi.fn(),
  cookie: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mock.cookie }) }))
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`)
  },
}))
vi.mock('../server', () => ({
  createClient: async () => ({ auth: { getClaims: mock.claims, getSession: mock.session } }),
}))
vi.mock('../env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))
import { rolePermissions } from '../../../../api/src/modules/auth/authorization-policy'
import {
  type ApplicationProfile,
  developerAuthUserId,
  developerSupabaseUrl,
} from '../../features/auth/auth-access'
import { encodeWorkspaceContext } from '../../features/auth/workspace-access'
import {
  canonicalFeatures,
  filterWorkspaceTabs,
  matchRoute,
  parseRouteSelection,
  requestRouteCheck,
  routeAllowed,
  routePolicy,
  visibleFeatures,
} from './route-access'
import { requireServerPage, requireServerRoute } from './server-access'
const id = '10000000-0000-4000-8000-000000000001'
const profile: ApplicationProfile = {
  id: developerAuthUserId,
  userId: id,
  organizationId: id,
  fullName: 'Synthetic developer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['projects.read'],
  assignedProjectIds: [],
  aal: 'aal2',
}
const claims = {
  sub: developerAuthUserId,
  iss: `${developerSupabaseUrl}/auth/v1`,
  aud: 'authenticated',
  is_anonymous: false,
  aal: 'aal2',
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mock.fetch)
  mock.claims.mockResolvedValue({ data: { claims }, error: null })
  mock.session.mockResolvedValue({
    data: { session: { access_token: 'synthetic-bearer' } },
    error: null,
  })
  mock.cookie.mockReturnValue({ value: encodeWorkspaceContext(profile) })
  mock.fetch.mockImplementation(async (url) =>
    Response.json({
      route: new URL(url).searchParams.get('route'),
      presentation: 'prototype-only',
      beneficiaryAccess: 'records-or-none',
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe('request-scoped server page authority', () => {
  it('classifies a server-only route outage separately from successful browser/MFA checks', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mock.fetch.mockResolvedValue(new Response('SYNTHETIC_PRIVATE_PROVIDER_BODY', { status: 503 }))
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:/auth/mfa')
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'SERVER_PAGE',
      stage: 'ROUTE_API',
      reason: 'HTTP_503',
    })
    expect(JSON.stringify(output.mock.calls)).not.toContain('SYNTHETIC_PRIVATE_PROVIDER_BODY')
  })
  it('classifies missing SSR context without weakening the direct-route denial', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mock.cookie.mockReturnValue(undefined)
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/unauthorized',
    )
    expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
      boundary: 'SERVER_PAGE',
      stage: 'CONTEXT',
      reason: 'CHECK_REJECTED',
    })
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('does not emit a denial for successful server authorization', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await requireServerRoute({ route: 'dashboard' })
    expect(output).not.toHaveBeenCalled()
  })
  it('requires API authority on each render with private/no-store and no ambient cookies', async () => {
    await requireServerRoute({ route: 'dashboard' })
    await requireServerRoute({ route: 'dashboard' })
    expect(mock.claims).toHaveBeenCalledTimes(2)
    expect(mock.fetch).toHaveBeenCalledTimes(2)
    expect(mock.fetch.mock.lastCall?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: 'Bearer synthetic-bearer',
        'X-Pathways-User-Id': id,
        'X-Pathways-Organization-Id': id,
      },
    })
  })
  it.each([401, 403, 404, 500, 503])(
    'server denial %i cannot render a protected page',
    async (status) => {
      mock.fetch.mockResolvedValue(new Response('', { status }))
      await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
        `REDIRECT:${
          status === 401
            ? '/staff/login'
            : [403, 404].includes(status)
              ? '/unauthorized'
              : '/auth/mfa'
        }`,
      )
    },
  )
  it('does not turn the unauthorized route into a redirect loop', async () => {
    mock.fetch.mockResolvedValue(new Response('', { status: 403 }))
    await expect(requireServerRoute({ route: 'unauthorized' })).rejects.toThrow(
      'REDIRECT:/auth/mfa',
    )
  })
  it.each([{ sub: id }, { iss: 'untrusted' }, { aal: 'aal1' }, { is_anonymous: true }])(
    'rejects wrong verified claim %# before route authorization',
    async (override) => {
      mock.claims.mockResolvedValue({ data: { claims: { ...claims, ...override } } })
      await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:')
      expect(mock.fetch).not.toHaveBeenCalled()
    },
  )
  it('rejects a missing or cross-user context and invalid session', async () => {
    mock.cookie.mockReturnValue(undefined)
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:')
    mock.cookie.mockReturnValue({
      value: encodeWorkspaceContext({ ...profile, id } as unknown as ApplicationProfile),
    })
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:')
    mock.cookie.mockReturnValue({ value: encodeWorkspaceContext(profile) })
    mock.session.mockResolvedValue({ data: { session: null } })
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/staff/login',
    )
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('checks authoritative object scope on a deep link and keeps valid import modes', async () => {
    await requireServerPage('project', { params: Promise.resolve({ projectId: id }) })
    expect(new URL(mock.fetch.mock.lastCall?.[0]).searchParams.get('projectId')).toBe(id)
    await requireServerPage('imports', {
      searchParams: Promise.resolve({ mode: 'extend', _rsc: 'transport-only' }),
    })
    expect(new URL(mock.fetch.mock.lastCall?.[0]).searchParams.get('mode')).toBe('extend')
  })
  it.each([
    { next: '//untrusted.example' },
    { kind: ['project-summary', 'beneficiary-summary'] },
    { organizationId: id },
  ])('rejects malicious server query %#', async (query) => {
    await expect(
      requireServerPage('reportPreview', { searchParams: Promise.resolve(query) }),
    ).rejects.toThrow('REDIRECT:/unauthorized')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('fails closed on a malformed route-check reply without exposing provider contents', async () => {
    mock.fetch.mockResolvedValue(Response.json({ sensitive: 'do-not-show' }))
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:/auth/mfa')
  })
})
describe('finite route and feature contract', () => {
  it('filters project tabs using current grants, not the display-role ceiling', () => {
    const tabs = [
      { label: 'Activities', path: 'activities' },
      { label: 'Budget', path: 'budget' },
    ]
    const current = {
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read'],
      assignedProjectIds: [id],
    }
    expect(filterWorkspaceTabs(tabs, 'Project Manager', current, id)).toEqual([tabs[0]])
    expect(
      filterWorkspaceTabs(tabs, 'Project Manager', { ...current, permissions: [] }, id),
    ).toEqual([])
    expect(
      filterWorkspaceTabs(tabs, 'Project Manager', { ...current, assignedProjectIds: [] }, id),
    ).toEqual([])
  })
  it.each([
    '/unknown',
    '//evil.example',
    '/projects/%2e%2e',
    '/projects/not-a-uuid',
    '/dashboard?next=//evil.example',
    '/reports/preview?kind=project-summary&kind=beneficiary-summary',
    '/collection/import?mode=unknown',
    '/dashboard#fragment',
  ])('rejects unreviewed path %#', (value) => expect(matchRoute(value)).toBeNull())
  it('rejects surplus selection fields and canonicalizes valid identifiers', () => {
    expect(parseRouteSelection({ route: 'project', projectId: id, organizationId: id })).toBeNull()
    expect(parseRouteSelection({ route: 'project', projectId: id })).toEqual({
      route: 'project',
      projectId: id,
    })
  })
  it('requires active grants and current assignment, never a role string alone', () => {
    const principal = {
      roles: ['PROJECT_OFFICER'],
      permissions: ['projects.read'],
      assignedProjectIds: [id],
    }
    expect(routeAllowed(principal, { route: 'project', projectId: id })).toBe(true)
    expect(
      routeAllowed({ ...principal, assignedProjectIds: [] }, { route: 'project', projectId: id }),
    ).toBe(false)
    expect(routeAllowed({ ...principal, permissions: [] }, { route: 'dashboard' })).toBe(false)
    expect(
      routeAllowed(
        { ...principal, roles: ['SYSTEM_ADMINISTRATOR', 'PROJECT_OFFICER'] },
        { route: 'dashboard' },
      ),
    ).toBe(false)
  })
  it('keeps exactly eight core and five supporting features; aggregate roles never get identity links', () => {
    expect(canonicalFeatures.filter((f) => f.group === 'Core')).toHaveLength(8)
    expect(canonicalFeatures.filter((f) => f.group === 'Supporting')).toHaveLength(5)
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const) {
      const features = visibleFeatures({
        roles: [role],
        permissions: rolePermissions[role],
        assignedProjectIds: [],
      })
      expect(features.some((f) => f.href.startsWith('/beneficiaries'))).toBe(false)
      expect(features.some((f) => f.href === '/analytics')).toBe(true)
    }
  })
  it('gates every inventoried server page before invoking its loader and disables shared rendering caches', () => {
    const root = path.resolve(__dirname, '../../app/(dashboard)')
    const pages = readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (p) =>
          p.endsWith('page.tsx') &&
          !['imports', 'participants'].some((alias) => p.startsWith(alias)),
      )
    expect(pages).toHaveLength(Object.keys(routePolicy).length)
    for (const file of pages) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source).toContain("export const dynamic = 'force-dynamic'")
      expect(source).toMatch(/await requireServerPage\('[A-Za-z]+', props\)/)
      expect(source.indexOf('await requireServerPage')).toBeLessThan(source.lastIndexOf('return '))
    }
  })
  it('rejects non-loopback endpoints and aborted authority checks', async () => {
    await expect(
      requestRouteCheck('https://untrusted.example', 'fixture', profile, { route: 'dashboard' }),
    ).rejects.toMatchObject({ status: 503 })
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})
