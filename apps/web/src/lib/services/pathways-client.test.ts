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

  it('does not fabricate collection records while domain endpoints are unavailable', async () => {
    const collections = await Promise.all([
      pathwaysClient.getActivities('project-id'),
      pathwaysClient.getEvidence('project-id'),
      pathwaysClient.getProjectIndicators('project-id'),
      pathwaysClient.getExpenses('project-id'),
      pathwaysClient.getRecommendationOutcomes('project-id'),
      pathwaysClient.getTransparencySections('project-id'),
      pathwaysClient.getBeneficiaryRecordsForRole('Program Manager'),
      pathwaysClient.getBeneficiaryMediaProofForRole('Program Manager', 'beneficiary-id'),
      pathwaysClient.getBeneficiarySadddAggregatesForRole('Program Manager'),
      pathwaysClient.getJourneyStages('project-id'),
      pathwaysClient.getIndicators(),
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
      code: 'not_configured',
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
              message: 'Workbook formulas, macros, and links are forbidden.',
              code: 'WORKBOOK_ACTIVE_CONTENT',
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
      message: 'Workbook formulas, macros, and links are forbidden.',
    })
  })

  it('loads and creates project-scoped Beneficiary records through the real API boundary', async () => {
    const authUserId = '77000000-0000-4000-8000-000000000001'
    const organizationId = '77000000-0000-4000-8000-000000000002'
    const userId = '77000000-0000-4000-8000-000000000003'
    const projectId = '77000000-0000-4000-8000-000000000004'
    const beneficiary = {
      id: '77000000-0000-4000-8000-000000000005',
      code: 'SYN-001',
      subjectType: 'INDIVIDUAL',
      displayName: 'Synthetic Person',
      firstName: 'Synthetic',
      middleName: null,
      lastName: 'Person',
      sex: 'NOT_SPECIFIED',
      birthDate: '2000-01-01',
      ageAtRegistration: 26,
      disabilityStatus: 'NOT_SPECIFIED',
      locationBarangay: 'Test',
      locationCityMunicipality: 'Test City',
      locationProvince: 'Test Province',
      status: 'ACTIVE',
      consentRecorded: true,
      dataProcessingConsentRecorded: true,
      isMinor: false,
      guardianConsentRecorded: false,
      projectId,
      enrollment: {
        id: '77000000-0000-4000-8000-000000000006',
        projectId,
        enrollmentDate: '2026-01-01',
        status: 'ACTIVE',
      },
      consentProvenance: [
        { kind: 'PARTICIPATION', source: 'DIRECT_ENTRY', recordedAt: '2026-01-01T00:00:00.000Z' },
      ],
      updatedAt: '2026-09-13T00:00:00.000Z',
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
        new Response(JSON.stringify({ items: [beneficiary], nextCursor: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(beneficiary), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetcher)

    await expect(
      pathwaysClient.getBeneficiaryRecordsForRole('Monitoring and Evaluation Officer', projectId),
    ).resolves.toMatchObject([
      { code: 'SYN-001', projectIds: [projectId], consentToStoreData: true },
    ])
    await expect(
      pathwaysClient.registerBeneficiary(projectId, {
        formId: '77000000-0000-4000-8000-000000000007',
        clientRegistrationId: '77000000-0000-4000-8000-000000000008',
        values: { beneficiary_code: 'SYN-001' },
      }),
    ).resolves.toMatchObject({ code: 'SYN-001', projectIds: [projectId] })
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/beneficiaries/projects/${projectId}`,
    )
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
  })
})
