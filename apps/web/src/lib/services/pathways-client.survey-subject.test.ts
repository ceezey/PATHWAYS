import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))
import { pathwaysClient } from './pathways-client'
const authUserId = '79000000-0000-4000-8000-000000000001'
const organizationId = '79000000-0000-4000-8000-000000000002'
const userId = '79000000-0000-4000-8000-000000000003'
const projectId = '79000000-0000-4000-8000-000000000004'
const subjectId = '79000000-0000-4000-8000-000000000005'
const otherId = '79000000-0000-4000-8000-000000000006'
const record = {
  id: subjectId,
  projectId,
  code: 'SYN-1',
  displayName: 'Fictional contributor',
  subjectType: 'INDIVIDUAL',
  status: 'ACTIVE',
  consentRecorded: true,
  dataProcessingConsentRecorded: true,
  enrollment: { projectId, status: 'ACTIVE', endedDate: null },
  dateOfBirth: '2000-01-01',
}
const fetcher = vi.fn<typeof fetch>()
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  vi.resetAllMocks()
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
afterEach(() => vi.unstubAllGlobals())

describe('survey contributor scoped consumed response boundary', () => {
  it('requests one bounded scoped page and returns only existing minimal display fields', async () => {
    fetcher.mockResolvedValueOnce(json({ items: [record], nextCursor: otherId }))
    const controller = new AbortController()
    await expect(
      pathwaysClient.getSurveySubjectPage(projectId, ' Fictional ', otherId, controller.signal),
    ).resolves.toEqual({
      items: [{ id: subjectId, code: 'SYN-1', displayName: 'Fictional contributor' }],
      nextCursor: otherId,
    })
    expect(fetcher).toHaveBeenCalledWith(
      `http://127.0.0.1:4000/api/beneficiaries/projects/${projectId}?enrollmentStatus=ACTIVE&limit=25&search=Fictional&cursor=${otherId}`,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-test-token',
          'X-Pathways-Organization-Id': organizationId,
          'X-Pathways-User-Id': userId,
        }),
      }),
    )
  })
  it.each([
    ['bad', '', undefined],
    [projectId, 'x'.repeat(81), undefined],
    [projectId, '', 'bad'],
  ] as const)('rejects invalid search input before network %j', async (project, search, cursor) => {
    await expect(pathwaysClient.getSurveySubjectPage(project, search, cursor)).rejects.toThrow(
      'Invalid contributor search',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    null,
    [],
    { items: [], nextCursor: 'bad' },
    { items: Array(26).fill(record), nextCursor: null },
  ])('rejects an invalid or unbounded page %j', async (value) => {
    fetcher.mockResolvedValueOnce(json(value))
    await expect(pathwaysClient.getSurveySubjectPage(projectId)).rejects.toThrow(
      'Invalid contributor page',
    )
  })
  it.each([
    { id: 'bad' },
    { projectId: otherId },
    { code: '' },
    { displayName: 'x'.repeat(241) },
    { consentRecorded: 'true' },
    { dataProcessingConsentRecorded: 1 },
    { subjectType: 'UNKNOWN' },
    { enrollment: { projectId: otherId, status: 'ACTIVE' } },
  ])('rejects malformed or foreign-project contributor shape %j', async (replacement) => {
    fetcher.mockResolvedValueOnce(
      json({ items: [{ ...record, ...replacement }], nextCursor: null }),
    )
    await expect(pathwaysClient.getSurveySubjectPage(projectId)).rejects.toThrow(
      'scope could not be verified',
    )
  })
  it.each([
    { subjectType: 'GROUP' },
    { consentRecorded: false },
    { dataProcessingConsentRecorded: false },
    { status: 'ARCHIVED' },
    { enrollment: { projectId, status: 'ENDED', endedDate: null } },
    { enrollment: { projectId, status: 'ACTIVE', endedDate: '' } },
    { enrollment: { projectId, status: 'ACTIVE', endedDate: false } },
    { enrollment: { projectId, status: 'ACTIVE', endedDate: '2026-09-27' } },
  ])(
    'excludes unavailable consumed eligibility without synthesizing a choice %j',
    async (replacement) => {
      fetcher.mockResolvedValueOnce(
        json({ items: [{ ...record, ...replacement }], nextCursor: null }),
      )
      await expect(pathwaysClient.getSurveySubjectPage(projectId)).resolves.toEqual({
        items: [],
        nextCursor: null,
      })
    },
  )
  it('accepts canonical omitted null endedDate and still strips private fields', async () => {
    fetcher.mockResolvedValueOnce(
      json({
        items: [{ ...record, enrollment: { projectId, status: 'ACTIVE' } }],
        nextCursor: null,
      }),
    )
    const page = await pathwaysClient.getSurveySubjectPage(projectId)
    expect(page.items).toEqual([
      { id: subjectId, code: 'SYN-1', displayName: 'Fictional contributor' },
    ])
    expect(page.items[0]).not.toHaveProperty('dateOfBirth')
  })
})
