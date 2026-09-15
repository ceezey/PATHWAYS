import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))
import { pathwaysClient } from './pathways-client'

const id = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const context = {
  contractVersion: 'p06.v1',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  businessTimeZone: 'Asia/Manila',
  generatedAt: '2026-09-15T00:00:00Z',
  refresh: 'READ_TIME_NO_CACHE',
}
const missing = { state: 'MISSING', value: null, reason: 'RELEASE_POLICY_REVIEW_REQUIRED' }
const dashboard = {
  ...context,
  projects: [{ id: projectId, code: 'P06_A', title: 'Synthetic project' }],
  scopeProjectCount: 1,
  activities: [],
  milestones: [],
  indicators: [],
  indicatorNote: 'No indicator matches the exact period.',
  participationRecords: missing,
  attendingIndividuals: missing,
  enrolledBeneficiaryRecords: missing,
  enrolledIndividuals: missing,
}
const saddd = {
  ...context,
  population: 'DISTINCT_INDIVIDUALS_WITH_OVERLAPPING_ENROLLMENT',
  demographicBasis: 'CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT',
  privacy: {
    threshold: 5,
    complementarySuppression: true,
    policy: 'G4_CALCULATION_RELEASE_PENDING',
    crossFilters: 'UNAVAILABLE_PENDING_POLICY',
  },
  total: missing,
  sex: [],
  age: [],
  disability: [],
  completeness: [],
}
const fetcher = vi.fn()
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('P06 client calls actual authorized APIs', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId: id, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id } } },
      error: null,
    })
    vi.stubGlobal('fetch', fetcher)
  })
  afterEach(() => vi.unstubAllGlobals())
  it('uses a current token and no-store monitoring request with explicit period filters', async () => {
    fetcher.mockResolvedValue(response(dashboard))
    const result = await pathwaysClient.getMonitoringDashboard({
      projectId,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
    })
    expect(result.attendingIndividuals.value).toBeNull()
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/dashboards/monitoring?projectId=${projectId}`),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: expect.objectContaining({ Authorization: 'Bearer synthetic-token' }),
      }),
    )
    expect(String(fetcher.mock.calls[0][0])).not.toContain('role=')
  })
  it('uses aggregate-only SADDD and never asks for raw Beneficiary records', async () => {
    fetcher.mockResolvedValue(response(saddd))
    const result = await pathwaysClient.getSadddDashboard({ projectId })
    expect(result.total.value).toBeNull()
    expect(fetcher.mock.calls.every((call) => String(call[0]).includes('/dashboards/saddd'))).toBe(
      true,
    )
    expect(result).not.toHaveProperty('beneficiaries')
  })
  it('rejects extra identity-bearing response fields instead of silently accepting them', async () => {
    fetcher.mockResolvedValue(response({ ...saddd, beneficiaryIds: ['forbidden-detail'] }))
    await expect(pathwaysClient.getSadddDashboard()).rejects.toThrow()
  })
  it('does not use an empty array or zero fallback after denied indicator access', async () => {
    fetcher.mockResolvedValue(response({ message: 'Denied' }, 403))
    await expect(pathwaysClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
  it('requires project context for activity indicator choices', async () => {
    await expect(pathwaysClient.getIndicators()).rejects.toMatchObject({ code: 'invalid' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reloads on repeated reads instead of maintaining a cross-user aggregate cache', async () => {
    fetcher.mockImplementation(() => Promise.resolve(response(dashboard)))
    await pathwaysClient.getMonitoringDashboard()
    await pathwaysClient.getMonitoringDashboard()
    expect(browser.getSession).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('fails closed when the current session disappears', async () => {
    browser.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(pathwaysClient.getMonitoringDashboard()).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not send an unapproved demographic filter', async () => {
    await expect(pathwaysClient.getSadddDashboard({ sex: 'FEMALE' } as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
