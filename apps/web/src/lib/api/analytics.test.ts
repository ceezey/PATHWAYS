import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { analyticsClient, descriptiveAnalyticsSearch, getAnalyticsExportPreview } from './analytics'

const authUserId = '79400000-0000-4000-8000-000000000001'
const organizationId = '79400000-0000-4000-8000-000000000002'
const userId = '79400000-0000-4000-8000-000000000003'
const projectId = '79400000-0000-4000-8000-000000000004'
const base = 'http://127.0.0.1:4000/api'
const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
const periodSearch = `&periodStart=${period.periodStart}&periodEnd=${period.periodEnd}`
const generatedAt = '2026-10-01T00:00:00.000Z'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null })
const group = (key: string, label: string) => ({
  key,
  label,
  pairs: cell('10'),
  meanPre: cell('50.0'),
  meanPost: cell('60.0'),
  meanChange: cell('10.0'),
  improved: cell('7'),
  same: cell('2'),
  declined: cell('1'),
})
const descriptive = {
  contractVersion: 'analytics.descriptive.v1',
  projectId,
  generatedAt,
  monitoringPeriod: { ...period, businessTimeZone: 'Asia/Manila' },
  sadddPeriod: { periodStart: null, periodEnd: null },
  sadddReleaseState: 'RELEASED',
  privacy: {
    threshold: 0,
    complementarySuppression: false,
    source: 'P06_SADDD_RELEASE',
    beneficiaryRows: false,
  },
  counts: [{ key: 'ACTIVITIES', label: 'Activities', metric: cell('4') }],
  distributions: [],
  indicatorSummaries: [],
}
const survey = {
  contractVersion: 'analytics.descriptive.survey.v1',
  projectId,
  generatedAt,
  period,
  excludedRecords: 1,
  overall: group('overall', 'All activities'),
  byActivity: [group('activity-a', 'Activity A')],
}
const timeline = {
  contractVersion: 'analytics.descriptive.timeline.v1',
  projectId,
  generatedAt,
  reportingDate: '2026-09-27',
  elapsedPercent: cell('40.0'),
  remainingDays: cell('30'),
  overdueDays: { state: 'ZERO', value: '0', reason: null },
  activityCompletionPercent: cell('50.0'),
  activityOverdueCount: { state: 'ZERO', value: '0', reason: null },
  milestoneOnTimePercent: { state: 'MISSING', value: null, reason: 'NO_COMPLETED_MILESTONES' },
}
const exportPreview = {
  title: 'Descriptive counts',
  columns: ['Measure', 'Count'],
  rows: [['Activities', '4']],
  totalRows: 1,
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

const client = { ...analyticsClient, descriptiveAnalyticsSearch, getAnalyticsExportPreview }

describe('analyticsClient analytics reads', () => {
  it.each([
    ['a project', { projectId }, `?projectId=${projectId}`],
    ['a project and a period', { projectId, ...period }, `?projectId=${projectId}${periodSearch}`],
    ['a view', { projectId, view: 'kpi' as const }, `?projectId=${projectId}&view=kpi`],
    [
      'a period and a view',
      { projectId, ...period, view: 'participation' as const },
      `?projectId=${projectId}${periodSearch}&view=participation`,
    ],
  ])('sends the descriptive read with %s', async (_label, query, search) => {
    fetcher.mockResolvedValueOnce(json(descriptive))
    await expect(client.getDescriptiveAnalytics(query)).resolves.toEqual(descriptive)
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(`${base}/analytics/descriptive${search}`)
    expect(init?.method ?? 'GET').toBe('GET')
    expect(client.descriptiveAnalyticsSearch(query)).toBe(search)
  })

  it('forces the survey view, whatever view the caller names', async () => {
    fetcher.mockResolvedValueOnce(json(survey))
    await expect(
      client.getSurveyAnalytics({ projectId, ...period, view: 'timeline' }),
    ).resolves.toEqual(survey)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive?projectId=${projectId}${periodSearch}&view=survey`,
    )
  })

  it('adds the timeline view to a project only query', async () => {
    fetcher.mockResolvedValueOnce(json(timeline))
    await expect(client.getTimelineAnalytics({ projectId })).resolves.toEqual(timeline)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive?projectId=${projectId}&view=timeline`,
    )
  })

  it('forces the timeline view, whatever view the caller names, and keeps the period', async () => {
    fetcher.mockResolvedValueOnce(json(timeline))
    await expect(
      client.getTimelineAnalytics({ projectId, ...period, view: 'survey' }),
    ).resolves.toEqual(timeline)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive?projectId=${projectId}${periodSearch}&view=timeline`,
    )
  })

  it.each([
    ['descriptive', (c: typeof client) => c.getDescriptiveAnalytics({ projectId }), descriptive],
    ['survey', (c: typeof client) => c.getSurveyAnalytics({ projectId, ...period }), survey],
    ['timeline', (c: typeof client) => c.getTimelineAnalytics({ projectId }), timeline],
  ])('rejects a %s response with an unknown key', async (_label, call, response) => {
    fetcher.mockResolvedValueOnce(json({ ...response, extra: 'x' }))
    await expect(call(client)).rejects.toThrow()
  })

  it.each([
    ['a period start without its end', { projectId, periodStart: period.periodStart }],
    ['a malformed project id', { projectId: 'not-a-uuid' }],
    ['a view outside the catalog', { projectId, view: 'other' }],
    ['an unknown key', { projectId, role: 'Project Officer' }],
  ])('refuses a query with %s before any request', async (_label, query) => {
    await expect(client.getDescriptiveAnalytics(query as never)).rejects.toThrow()
    expect(() => client.descriptiveAnalyticsSearch(query as never)).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reads the export preview from its route with the same query string', async () => {
    fetcher.mockResolvedValueOnce(json(exportPreview))
    await expect(client.getAnalyticsExportPreview({ projectId, ...period })).resolves.toEqual(
      exportPreview,
    )
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `${base}/analytics/descriptive/export/preview?projectId=${projectId}${periodSearch}`,
    )
  })

  it('drops an unknown key of the export preview and refuses a negative row total', async () => {
    fetcher.mockResolvedValueOnce(json({ ...exportPreview, extra: 'x' }))
    await expect(client.getAnalyticsExportPreview({ projectId })).resolves.toEqual(exportPreview)
    fetcher.mockResolvedValueOnce(json({ ...exportPreview, totalRows: -1 }))
    await expect(client.getAnalyticsExportPreview({ projectId })).rejects.toThrow()
  })
})
