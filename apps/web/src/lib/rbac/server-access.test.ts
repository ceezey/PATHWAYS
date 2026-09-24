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
vi.mock('../env', () => ({
  webEnv: {
    NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api',
    NEXT_PUBLIC_SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co',
  },
}))
import { rolePermissions } from '../../../../api/src/modules/auth/authorization-policy'
import type { ApplicationProfile } from '../../features/auth/auth-access'
import { testAuthUserId, testSupabaseUrl } from '../../features/auth/auth-access.test-fixtures'
const developerAuthUserId = testAuthUserId
const developerSupabaseUrl = testSupabaseUrl
import { encodeWorkspaceContext } from '../../features/auth/workspace-access'
import {
  canonicalFeatures,
  filterWorkspaceTabs,
  getVerifiedRouteAccess,
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
      authorization: 'database-verified',
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
  it('keeps next-request revocation enforced after optimistic middleware admission', async () => {
    await requireServerRoute({ route: 'dashboard' })
    mock.fetch.mockResolvedValueOnce(new Response('', { status: 403 }))
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/unauthorized',
    )
    expect(mock.fetch).toHaveBeenCalledTimes(2)
  })
  it('routes actual aal1 to MFA rather than treating it as a service outage', async () => {
    mock.claims.mockResolvedValueOnce({ data: { claims: { ...claims, aal: 'aal1' } } })
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:/auth/mfa')
    expect(mock.fetch).not.toHaveBeenCalled()
  })
  it('does not turn an Auth provider outage into another login challenge', async () => {
    mock.claims.mockResolvedValueOnce({
      data: null,
      error: { status: 503, message: 'PRIVATE_PROVIDER_BODY' },
    })
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/auth/access-unavailable',
    )
    expect(mock.fetch).not.toHaveBeenCalled()
  })

  it('classifies a server-only route outage separately from successful browser/MFA checks', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mock.fetch.mockResolvedValue(new Response('SYNTHETIC_PRIVATE_PROVIDER_BODY', { status: 503 }))
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/auth/access-unavailable',
    )
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
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow('REDIRECT:/auth/mfa')
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
              : '/auth/access-unavailable'
        }`,
      )
    },
  )
  it('does not turn the unauthorized route into a redirect loop', async () => {
    mock.fetch.mockResolvedValue(new Response('', { status: 403 }))
    await expect(requireServerRoute({ route: 'unauthorized' })).rejects.toThrow(
      'REDIRECT:/auth/access-unavailable',
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
    await requireServerPage('beneficiary', {
      params: Promise.resolve({ beneficiaryId: id }),
      searchParams: Promise.resolve({ projectId: id }),
    })
    const beneficiarySelection = new URL(mock.fetch.mock.lastCall?.[0]).searchParams
    expect(beneficiarySelection.get('beneficiaryId')).toBe(id)
    expect(beneficiarySelection.get('projectId')).toBe(id)
    await requireServerPage('beneficiaryEdit', {
      params: Promise.resolve({ beneficiaryId: id }),
      searchParams: Promise.resolve({ projectId: id }),
    })
    const beneficiaryEditSelection = new URL(mock.fetch.mock.lastCall?.[0]).searchParams
    expect(beneficiaryEditSelection.get('route')).toBe('beneficiaryEdit')
    expect(beneficiaryEditSelection.get('beneficiaryId')).toBe(id)
    expect(beneficiaryEditSelection.get('projectId')).toBe(id)
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
    await expect(requireServerRoute({ route: 'dashboard' })).rejects.toThrow(
      'REDIRECT:/auth/access-unavailable',
    )
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
    expect(matchRoute(`/beneficiaries/${id}?projectId=${id}`)).toEqual({
      route: 'beneficiary',
      beneficiaryId: id,
      projectId: id,
    })
    expect(parseRouteSelection({ route: 'beneficiary', beneficiaryId: id, projectId: id })).toEqual(
      { route: 'beneficiary', beneficiaryId: id, projectId: id },
    )
    expect(
      parseRouteSelection({ route: 'beneficiaryEdit', beneficiaryId: id, projectId: id }),
    ).toEqual({ route: 'beneficiaryEdit', beneficiaryId: id, projectId: id })
    expect(matchRoute(`/beneficiaries/${id}?projectId=not-a-uuid`)).toBeNull()
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
  it('keeps direct editors aligned with their backend write permissions', () => {
    const projectEdit = { route: 'projectEdit', projectId: id } as const
    const beneficiaryEdit = { route: 'beneficiaryEdit', beneficiaryId: id } as const
    const principal = (role: keyof typeof rolePermissions) => ({
      roles: [role],
      permissions: rolePermissions[role],
      assignedProjectIds: [id],
    })

    expect(routeAllowed(principal('PROJECT_MANAGER'), projectEdit)).toBe(true)
    expect(routeAllowed(principal('PROGRAM_MANAGER'), projectEdit)).toBe(false)
    expect(routeAllowed(principal('MONITORING_AND_EVALUATION_OFFICER'), beneficiaryEdit)).toBe(true)
    expect(routeAllowed(principal('PROJECT_OFFICER'), beneficiaryEdit)).toBe(false)
  })
  it('requires the complete atomic chain for Extend Existing Form', () => {
    const extend = { route: 'imports', mode: 'extend' } as const
    const principal = (role: keyof typeof rolePermissions) => ({
      roles: [role],
      permissions: rolePermissions[role],
      assignedProjectIds: [id],
    })

    expect(routeAllowed(principal('MONITORING_AND_EVALUATION_OFFICER'), extend)).toBe(true)
    for (const role of ['SYSTEM_ADMINISTRATOR', 'PROJECT_MANAGER', 'PROJECT_OFFICER'] as const) {
      expect(routeAllowed(principal(role), extend)).toBe(false)
    }
  })
  it.each(['PROJECT_OFFICER', 'MONITORING_AND_EVALUATION_OFFICER'] as const)(
    'allows %s to open an assigned-project Beneficiary detail route',
    (role) => {
      const route = `/beneficiaries/${id}?projectId=${id}`
      const principal = {
        roles: [role],
        permissions: rolePermissions[role],
        assignedProjectIds: [id],
      }
      expect(getVerifiedRouteAccess(principal, route).allowed).toBe(true)
      expect(getVerifiedRouteAccess({ ...principal, assignedProjectIds: [] }, route).allowed).toBe(
        false,
      )
    },
  )
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
    expect(pages.length).toBeGreaterThanOrEqual(Object.keys(routePolicy).length)
    for (const file of pages) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source).toContain("export const dynamic = 'force-dynamic'")
      expect(source).toMatch(/await requireServerPage\('[A-Za-z]+', props\)/)
      const exitAt = Math.max(source.lastIndexOf('return '), source.lastIndexOf('redirect('))
      expect(source.indexOf('await requireServerPage')).toBeLessThan(exitAt)
    }
  })
  it('rejects non-loopback endpoints and aborted authority checks', async () => {
    await expect(
      requestRouteCheck('https://untrusted.example', 'fixture', profile, { route: 'dashboard' }),
    ).rejects.toMatchObject({ status: 503 })
    expect(mock.fetch).not.toHaveBeenCalled()
  })
})
