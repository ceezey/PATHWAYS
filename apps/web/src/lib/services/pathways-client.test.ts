import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError, pathwaysClient } from './pathways-client'

describe('PATHWAYS frontend data boundary', () => {
  beforeEach(() => browser.getSession.mockReset())
  afterEach(() => vi.unstubAllGlobals())

  it('does not fabricate collection records while remaining domain endpoints are unavailable', async () => {
    const collections = await Promise.all([
      pathwaysClient.getExpenses('project-id'),
      pathwaysClient.getRecommendationOutcomes('project-id'),
      pathwaysClient.getTransparencySections('project-id'),
      pathwaysClient.getBeneficiaryRecordsForRole('Program Manager'),
      pathwaysClient.getBeneficiaryMediaProofForRole('Program Manager', 'beneficiary-id'),
      pathwaysClient.getBudgets(),
      pathwaysClient.getAlerts(),
      pathwaysClient.getRecommendations(),
      pathwaysClient.getRules(),
      pathwaysClient.getReports(),
      pathwaysClient.getSurveyForms(),
      pathwaysClient.getSurveyAggregateResults(),
      pathwaysClient.getAnalyticsLocations(),
      pathwaysClient.getPublicProjects(),
    ])

    expect(collections.every((records) => records.length === 0)).toBe(true)
  })

  it('loads and creates activities through the scoped API without requiring relationship links', async () => {
    const authUserId = '72000000-0000-4000-8000-000000000001'
    const organizationId = '72000000-0000-4000-8000-000000000002'
    const userId = '72000000-0000-4000-8000-000000000003'
    const projectId = '72000000-0000-4000-8000-000000000004'
    const officerId = '72000000-0000-4000-8000-000000000005'
    const activity = {
      id: '72000000-0000-4000-8000-000000000006',
      projectId,
      title: 'Community workshop',
      description: 'Synthetic activity',
      storedStatus: 'NOT_STARTED',
      status: 'Planned',
      overdue: false,
      startDate: '2026-10-01',
      dueDate: '2026-10-02',
      assignedUserIds: [officerId],
      assignedTo: ['Project Officer Test'],
      assignedEmails: ['p07.po.01@example.test'],
      indicatorIds: [],
      journeyStageIds: [],
      journeyStageId: '',
      targetBeneficiaries: 0,
      beneficiariesReached: 0,
      budgetAllocation: 0,
      budgetLogged: 0,
      progress: 0,
      submittedProof: [],
      updateNotes: [],
      updatedAt: '2026-09-20T00:00:00.000Z',
    }
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
      error: null,
    })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([activity]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(activity), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetcher)

    await expect(pathwaysClient.getActivities(projectId)).resolves.toMatchObject([
      { id: activity.id, indicatorIds: [], journeyStageId: '' },
    ])
    await pathwaysClient.createActivity({
      projectId,
      title: activity.title,
      description: activity.description,
      startDate: activity.startDate,
      dueDate: activity.dueDate,
      targetBeneficiaries: 1,
      budgetAllocation: 1,
      assignedUserIds: [officerId],
    })

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/activities`,
    )
    const createRequest = fetcher.mock.calls[1]?.[1] as RequestInit
    expect(JSON.parse(String(createRequest.body))).toEqual({
      title: activity.title,
      description: activity.description,
      plannedStartDate: activity.startDate,
      plannedEndDate: activity.dueDate,
      assignedUserIds: [officerId],
    })
  })

  it('requires a verified browser session for implemented foundation reads', async () => {
    await expect(pathwaysClient.getProject('project-id')).rejects.toMatchObject({
      code: 'unauthorized',
    })
    await expect(pathwaysClient.getProjects()).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(pathwaysClient.getUsers()).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('uses the current session and non-authoritative workspace selectors for a real API read', async () => {
    const authUserId = '73000000-0000-4000-8000-000000000001'
    const organizationId = '73000000-0000-4000-8000-000000000002'
    const userId = '73000000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(
        JSON.stringify({ authUserId, organizationId, userId }),
      )}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
      error: null,
    })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '73000000-0000-4000-8000-000000000004',
            code: 'P01-1',
            title: 'Persisted project',
            description: null,
            objectives: null,
            implementationArea: 'Quezon City',
            status: 'ONGOING',
            programId: null,
            projectManager: null,
            updatedAt: '2026-09-13T00:00:00.000Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetcher)

    await expect(pathwaysClient.getProjects()).resolves.toMatchObject([
      { title: 'Persisted project', area: 'Quezon City', metricsAvailable: false },
    ])
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'http://127.0.0.1:4000/api/projects',
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer synthetic-access-token',
          'Content-Type': 'application/json',
          'X-Pathways-Organization-Id': organizationId,
          'X-Pathways-User-Id': userId,
        },
      }),
    )
  })

  it('reports unfinished record reads as explicitly not configured', async () => {
    await expect(pathwaysClient.getPublicProject('project-id')).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
    await expect(pathwaysClient.getDashboard('Program Manager')).rejects.toMatchObject({
      code: 'unauthorized',
    })
  })

  it('preserves bounded server field errors for direct-entry correction', async () => {
    const authUserId = '74000000-0000-4000-8000-000000000001'
    const organizationId = '74000000-0000-4000-8000-000000000002'
    const userId = '74000000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(
        JSON.stringify({ authUserId, organizationId, userId }),
      )}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              message: 'Form responses are invalid.',
              errors: [
                {
                  fieldCode: 'score',
                  code: 'above_maximum',
                  message: 'Score is above its maximum.',
                },
              ],
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(
      pathwaysClient.saveDirectSubmission(
        '74000000-0000-4000-8000-000000000004',
        '74000000-0000-4000-8000-000000000005',
        '74000000-0000-4000-8000-000000000006',
        { score: '100.0001' },
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      fieldErrors: [
        { fieldCode: 'score', code: 'above_maximum', message: 'Score is above its maximum.' },
      ],
    })
  })

  it('sends imports as authenticated multipart data without overriding the boundary header', async () => {
    const authUserId = '75000000-0000-4000-8000-000000000001'
    const organizationId = '75000000-0000-4000-8000-000000000002'
    const userId = '75000000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(
        JSON.stringify({ authUserId, organizationId, userId }),
      )}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
      error: null,
    })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'persisted-batch' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetcher)
    const source = new File(['score\n0\n'], 'scores.csv', { type: 'text/csv' })

    await pathwaysClient.uploadImport(
      '75000000-0000-4000-8000-000000000004',
      '75000000-0000-4000-8000-000000000005',
      '75000000-0000-4000-8000-000000000006',
      source,
    )

    const request = fetcher.mock.calls[0]?.[1] as RequestInit
    const headers = request.headers as Record<string, string>
    expect(request.body).toBeInstanceOf(FormData)
    expect(headers).toMatchObject({
      Authorization: 'Bearer synthetic-access-token',
      'X-Pathways-Organization-Id': organizationId,
      'X-Pathways-User-Id': userId,
    })
    expect(headers).not.toHaveProperty('Content-Type')
    expect((request.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('preserves a bounded secure-parser error for uploader correction', async () => {
    const authUserId = '76000000-0000-4000-8000-000000000001'
    const organizationId = '76000000-0000-4000-8000-000000000002'
    const userId = '76000000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(
        JSON.stringify({ authUserId, organizationId, userId }),
      )}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-access-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              message:
                'Workbook formulas are not accepted. Export a values-only copy before uploading.',
              code: 'WORKBOOK_FORMULA_REQUIRES_VALUES_ONLY',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(
      pathwaysClient.uploadImport(
        '76000000-0000-4000-8000-000000000004',
        '76000000-0000-4000-8000-000000000005',
        '76000000-0000-4000-8000-000000000006',
        new File(['unsafe'], 'unsafe.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'Workbook formulas are not accepted. Export a values-only copy before uploading.',
    })
  })
})
