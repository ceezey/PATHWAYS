import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { analyticsInsightsClient } from './analytics-insights'

const authUserId = '79500000-0000-4000-8000-000000000001'
const organizationId = '79500000-0000-4000-8000-000000000002'
const userId = '79500000-0000-4000-8000-000000000003'
const projectId = '79500000-0000-4000-8000-000000000004'
const activityId = '79500000-0000-4000-8000-000000000005'
const base = 'http://127.0.0.1:4000/api/analytics/insights'
const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
const periodSearch = `&periodStart=${period.periodStart}&periodEnd=${period.periodEnd}`
const participation = {
  projectId,
  total: 12,
  totalSuppressed: false,
  byActivity: [{ activityId, activityName: 'Fictional activity', count: 12, suppressed: false }],
  byMonth: [{ month: '2026-09', count: 12, suppressed: false }],
  byAttendanceStatus: ['PRESENT', 'ABSENT', 'COMPLETED', 'NOT_COMPLETED', 'EXCUSED'].map(
    (status) => ({ status, count: null, suppressed: true }),
  ),
}
const trends = {
  projectId,
  indicators: [
    {
      indicatorId: activityId,
      name: 'Fictional indicator',
      unit: '%',
      target: 100,
      points: [{ periodStart: '2026-09-01', periodEnd: '2026-09-30', value: 40 }],
    },
  ],
}
const budget = {
  projectId,
  currencies: [
    { currency: 'PHP', planned: 1000, approved: 400, pending: 100, utilizationPercent: 40 },
  ],
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

type Call = (
  query: Parameters<typeof analyticsInsightsClient.budget>[0],
  signal?: AbortSignal,
) => unknown
const reads: readonly (readonly [string, Call, string, unknown])[] = [
  ['participation', analyticsInsightsClient.participation, 'participation', participation],
  ['indicatorTrends', analyticsInsightsClient.indicatorTrends, 'indicator-trends', trends],
  ['budget', analyticsInsightsClient.budget, 'budget', budget],
]

describe('analyticsInsightsClient', () => {
  it.each(reads)(
    '%s sends one project read and parses the response',
    async (_name, call, route, response) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call({ projectId }, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`${base}/${route}?projectId=${projectId}`)
      expect(init?.method ?? 'GET').toBe('GET')
      expect(init?.signal).toBe(controller.signal)
    },
  )

  it.each(reads)(
    '%s adds a complete period and lowercases the project id',
    async (_name, call, route, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await call({ projectId: projectId.toUpperCase(), ...period })
      expect(String(fetcher.mock.calls[0][0])).toBe(
        `${base}/${route}?projectId=${projectId}${periodSearch}`,
      )
    },
  )

  it.each(reads)(
    '%s rejects a response with an unknown key',
    async (_name, call, _route, response) => {
      fetcher.mockResolvedValueOnce(json({ ...(response as object), extra: 'x' }))
      await expect(call({ projectId })).rejects.toThrow()
    },
  )

  it.each(reads)('%s refuses an incomplete period before any request', async (_name, call) => {
    await expect(call({ projectId, periodStart: period.periodStart })).rejects.toThrow()
    await expect(call({ projectId: 'not-a-uuid' })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
