import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import { dashboardsClient } from './dashboards'

const authUserId = '79300000-0000-4000-8000-000000000001'
const organizationId = '79300000-0000-4000-8000-000000000002'
const userId = '79300000-0000-4000-8000-000000000003'
const projectId = '79300000-0000-4000-8000-000000000004'
const programId = '79300000-0000-4000-8000-000000000005'
const base = 'http://127.0.0.1:4000/api'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
const missing = { state: 'MISSING', value: null, reason: 'MISSING' }
const actionCounts = {
  contractVersion: 'dashboard.action-counts.v1',
  businessDate: '2026-10-04',
  pendingApprovals: 2,
  activeAlerts: { count: 1, capped: false },
  overdueActivities: { count: 3, mostOverdue: { code: 'ACT-1', daysLate: 4 } },
  forReview: null,
}
const roleOverview = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: null,
  myExtensions: null,
  extensionQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
}
const monitoring = {
  contractVersion: 'p06.v1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  businessTimeZone: 'Asia/Manila',
  generatedAt: '2026-10-01T00:00:00.000Z',
  refresh: 'READ_TIME_NO_CACHE',
  projects: [{ id: projectId, code: 'SYN-1', title: 'Fictional project' }],
  scopeProjectCount: 1,
  activities: [],
  milestones: [],
  participationRecords: cell('12'),
  attendingIndividuals: cell('8'),
  enrolledBeneficiaryRecords: missing,
  enrolledIndividuals: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
  indicators: [],
  indicatorNote: 'Fictional note.',
}
const saddd = {
  contractVersion: 'p06.v1',
  periodStart: null,
  periodEnd: null,
  businessTimeZone: 'Asia/Manila',
  generatedAt: '2026-10-01T00:00:00.000Z',
  refresh: 'READ_TIME_NO_CACHE',
  releaseState: 'RELEASED',
  population: 'DISTINCT_INDIVIDUALS_WITH_OVERLAPPING_ENROLLMENT',
  demographicBasis: 'CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT',
  privacy: {
    threshold: 5,
    complementarySuppression: true,
    policy: 'FIXED_CLOSED_PROJECT_PERIOD_V1',
    crossFilters: 'PROJECT_ONLY_NO_CROSS_FILTERS',
  },
  total: cell('9'),
  sex: [{ key: 'FEMALE', label: 'Female', metric: cell('6') }],
  age: [],
  disability: [],
  completeness: [],
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// The same cases run against the member still on pathwaysClient and against its copy in dashboardsClient.
const clients: readonly (readonly [string, typeof dashboardsClient])[] = [
  ['pathwaysClient', pathwaysClient],
  ['dashboardsClient', dashboardsClient],
]

describe.each(clients)('%s dashboard reads', (_name, client) => {
  it('reads the action counts from their route and parses them', async () => {
    fetcher.mockResolvedValueOnce(json(actionCounts))
    await expect(client.getDashboardActionCounts()).resolves.toEqual(actionCounts)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`${base}/dashboards/action-counts`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(init?.body).toBeUndefined()
  })

  it('reads the role overview from its route and parses it', async () => {
    fetcher.mockResolvedValueOnce(json(roleOverview))
    await expect(client.getRoleOverview()).resolves.toEqual(roleOverview)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/role-overview`)
  })

  it.each([
    ['action counts', (c: typeof client) => c.getDashboardActionCounts(), actionCounts],
    ['role overview', (c: typeof client) => c.getRoleOverview(), roleOverview],
    ['monitoring', (c: typeof client) => c.getMonitoringDashboard(), monitoring],
    ['SADDD', (c: typeof client) => c.getSadddDashboard({ projectId }), saddd],
  ])('rejects a %s response with an unknown key', async (_label, call, response) => {
    fetcher.mockResolvedValueOnce(json({ ...response, extra: 'x' }))
    await expect(call(client)).rejects.toThrow()
  })

  it.each([
    ['no query', undefined, ''],
    ['an empty query', {}, ''],
    ['a project', { projectId }, `?projectId=${projectId}`],
    [
      'a project and a period',
      { projectId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      `?projectId=${projectId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
    ],
    [
      'a program and a period',
      { programId, periodStart: '2026-09-01', periodEnd: '2026-09-30' },
      `?programId=${programId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
    ],
  ])('sends the monitoring read with %s', async (_label, query, search) => {
    fetcher.mockResolvedValueOnce(json(monitoring))
    await expect(client.getMonitoringDashboard(query)).resolves.toEqual(monitoring)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/monitoring${search}`)
  })

  it.each([
    ['a project and a program', { projectId, programId }],
    ['a period start without its end', { periodStart: '2026-09-01' }],
    ['a reversed period', { periodStart: '2026-09-30', periodEnd: '2026-09-01' }],
    ['a role selector', { role: 'Project Officer' }],
    ['a malformed project id', { projectId: 'not-a-uuid' }],
  ])('refuses a monitoring query with %s before any request', async (_label, query) => {
    await expect(client.getMonitoringDashboard(query as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the SADDD read for exactly one project', async () => {
    fetcher.mockResolvedValueOnce(json(saddd))
    await expect(client.getSadddDashboard({ projectId })).resolves.toEqual(saddd)
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/saddd?projectId=${projectId}`)
  })

  it('rejects an unapproved SADDD cross-filter before fetching', async () => {
    await expect(client.getSadddDashboard({ projectId, sex: 'FEMALE' } as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed when the current session disappears', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.getMonitoringDashboard()).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects dashboard reads without a session', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(client.getDashboard('Program Manager')).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('builds the role dashboard view model from the home read', async () => {
    fetcher.mockResolvedValueOnce(json(monitoring))
    await expect(client.getDashboard('Program Manager')).resolves.toEqual({
      role: 'Program Manager',
      greetingName: 'Program Manager',
      heading: 'Project monitoring overview',
      summary:
        '2026-09-01 to 2026-09-30; Asia/Manila. Current operational states; no automated success rating.',
      primaryAction: {
        id: 'monitoring',
        label: 'Open monitoring',
        kind: 'navigate',
        href: '/analytics',
      },
      metrics: [
        {
          id: 'projects',
          label: 'Authorized projects',
          value: '1',
          helperText: 'Server-derived current project scope.',
        },
        {
          id: 'participation',
          label: 'Participation records',
          value: '12',
          helperText: 'Committed records, not a count of people.',
        },
        {
          id: 'attending',
          label: 'Distinct attending individuals',
          value: '8',
          helperText: 'Present/completed attendance; deduplicated across projects.',
        },
        {
          id: 'enrolled',
          label: 'Enrolled individuals',
          value: 'Suppressed',
          helperText: 'Enrollment overlaps this period; privacy suppression applies.',
        },
      ],
      sections: [
        {
          id: 'projects',
          title: 'Authorized project workspaces',
          emptyText: 'No projects are currently in your authorized scope.',
          items: [
            {
              id: projectId,
              title: 'Fictional project',
              description: 'SYN-1',
              href: `/projects/${projectId}`,
            },
          ],
        },
      ],
    })
    expect(String(fetcher.mock.calls[0][0])).toBe(`${base}/dashboards/home`)
    fetcher.mockResolvedValueOnce(json({ ...monitoring, extra: 'x' }))
    await expect(client.getDashboard('Program Manager')).rejects.toThrow()
  })
})
