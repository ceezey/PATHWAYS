import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))
import { indicatorsClient } from './indicators'

const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const fetcher = vi.fn()

describe('P06 indicator client fail-closed request boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal('fetch', fetcher)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not replace a denied indicator read with a successful empty value', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(indicatorsClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})

describe('goal-free indicator read contract', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reads indicator-specific metrics without project comparisons and retains unavailable values', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    const indicator = {
      id: '79000000-0000-4000-8000-000000000005',
      projectId,
      code: 'OWN_TARGET',
      name: 'Own target',
      description: null,
      unitLabel: 'count',
      dataSource: null,
      mode: 'MANUAL',
      numericKind: 'COUNT',
      direction: 'HIGHER_IS_BETTER',
      displayPrecision: 0,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      baseline: '10',
      target: '30',
      current: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
      progress: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
      binding: null,
      measurementId: null,
      measuredAt: null,
      measurementSource: null,
      revision: 1,
      status: 'ACTIVE',
      contractVersion: 'p06.v1',
    }
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([indicator]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              ...indicator,
              projectGoalComparison: { state: 'UNAVAILABLE', reason: 'NO_MEASUREMENT' },
            },
          ]),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const [read] = await indicatorsClient.getProjectIndicators(projectId)
    expect(read.current.value).toBeNull()
    expect(read.progress.value).toBeNull()
    expect(read.target).toBe('30')
    expect(read).not.toHaveProperty('projectGoalComparison')
    await expect(indicatorsClient.getProjectIndicators(projectId)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'unrecognized_keys', keys: ['projectGoalComparison'] }),
      ]),
    })
  })
})
