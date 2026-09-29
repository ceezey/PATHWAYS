import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sourceMutationTickets } from './source-mutation'

const mutationId = '20000000-0000-4000-8000-000000000001'
const mutationContext = { principalKey: 'synthetic-owner', isCurrent: () => true }
const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: {
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api',
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic-project.supabase.co',
  },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import {
  PathwaysClientError,
  pathwaysClient,
  recoverSourceMutation,
  requestFoundationResponse,
} from './pathways-client'

describe('PATHWAYS frontend data boundary', () => {
  const setupSourceBrowser = () => {
    const authUserId = '73600000-0000-4000-8000-000000000001'
    const organizationId = '73600000-0000-4000-8000-000000000002'
    const userId = '73600000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    return { authUserId }
  }
  it('retries an uncertain activity create with identical API payload/id and accepts an id-free replay before current-list reload', async () => {
    setupSourceBrowser()
    const projectId = '73600000-0000-4000-8000-000000000004'
    const input = {
      projectId,
      title: 'Synthetic',
      description: '',
      startDate: '2026-10-01',
      dueDate: '2026-10-02',
      targetBeneficiaries: 0,
      assignedUserIds: [],
      indicatorIds: [],
      journeyStageId: null,
    }
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(Error('response lost'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ requestId: mutationId, committed: true, replayed: true })),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(pathwaysClient.createActivity(input, mutationContext)).rejects.toThrow()
    const replay = await pathwaysClient.createActivity(input, mutationContext)
    expect(replay).toEqual({ requestId: mutationId, committed: true, replayed: true })
    expect(replay).not.toHaveProperty('id')
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
    expect(
      sourceMutationTickets.pendingRecovery(
        mutationContext,
        `POST:/projects/${projectId}/activities`,
      ),
    ).not.toBeNull()
  })
  it('binds explicit review recovery to original activity/update/body without request key in semantic body', async () => {
    setupSourceBrowser()
    const projectId = '73600000-0000-4000-8000-000000000004'
    const activityId = '73600000-0000-4000-8000-000000000005'
    const updateId = '73600000-0000-4000-8000-000000000006'
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(Error('response lost'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ requestId: mutationId, abandoned: true })),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(
      pathwaysClient.reviewActivityUpdate(
        projectId,
        activityId,
        updateId,
        'APPROVE',
        'Synthetic reason',
        '2026-09-27T00:00:00.000Z',
        mutationContext,
      ),
    ).rejects.toThrow()
    const key = `POST:/projects/${projectId}/activities/${activityId}/updates/${updateId}/review`
    expect(await recoverSourceMutation(mutationContext, key)).toBe('ABANDONED')
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      operation: 'ACTIVITY_REVIEW',
      sourceId: activityId,
      requestId: mutationId,
      body: {
        decision: 'APPROVE',
        reason: 'Synthetic reason',
        expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
        updateId,
      },
    })
    expect(sourceMutationTickets.pendingRecovery(mutationContext, key)).not.toBeNull()
  })
  it('clears retained multipart note/files immediately through the existing logout lifecycle and never enables generic proof abandonment', async () => {
    setupSourceBrowser()
    const projectId = '73600000-0000-4000-8000-000000000004'
    const activityId = '73600000-0000-4000-8000-000000000005'
    const file = new File(['Synthetic'], 'synthetic.txt', { type: 'text/plain' })
    const fetcher = vi.fn().mockRejectedValue(Error('response lost'))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      pathwaysClient.submitActivityProof(
        {
          projectId,
          activityId,
          clientUpdateId: mutationId,
          progress: 20,
          note: 'Synthetic',
          files: [file],
        },
        mutationContext,
      ),
    ).rejects.toThrow()
    const key = `POST:/projects/${projectId}/activities/${activityId}/updates`
    expect(sourceMutationTickets.proofSnapshot(mutationContext, key)?.files[0]).toBe(file)
    await expect(recoverSourceMutation(mutationContext, key)).rejects.toThrow(
      'does not support recovery',
    )
    expect(fetcher).toHaveBeenCalledOnce()
    clearSensitiveDraftStorage()
    expect(sourceMutationTickets.proofSnapshot(mutationContext, key)).toBeNull()
    expect(sourceMutationTickets.pendingRecovery(mutationContext, key)).toBeNull()
  })
  it('checks the captured live mutation owner again after asynchronous token acquisition before dispatching private input', async () => {
    const { authUserId } = setupSourceBrowser()
    let live = true
    let resume: ((value: unknown) => void) | undefined
    browser.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = resolve
        }),
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const request = pathwaysClient.createActivity(
      {
        projectId: '73600000-0000-4000-8000-000000000004',
        title: 'Synthetic private title',
        description: '',
        startDate: '2026-10-01',
        dueDate: '2026-10-02',
        targetBeneficiaries: 0,
        assignedUserIds: [],
      },
      { ...mutationContext, isCurrent: () => live },
    )
    live = false
    if (!resume) throw Error('Missing token continuation')
    resume({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    await expect(request).rejects.toMatchObject({ code: 'unauthorized' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps bearer scope headers while omitting bodyless JSON type and preserving JSON/multipart bodies', async () => {
    const authUserId = '73600000-0000-4000-8000-000000000001'
    const organizationId = '73600000-0000-4000-8000-000000000002'
    const userId = '73600000-0000-4000-8000-000000000003'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}')))
    vi.stubGlobal('fetch', fetcher)
    await requestFoundationResponse('/synthetic')
    await requestFoundationResponse('/synthetic', {
      method: 'POST',
      body: JSON.stringify({ value: 1 }),
    })
    const multipart = new FormData()
    multipart.append('synthetic', 'value')
    await requestFoundationResponse('/synthetic', { method: 'POST', body: multipart })
    const requests = fetcher.mock.calls.map((call) => call[1])
    expect(requests[0].headers['Content-Type']).toBeUndefined()
    expect(requests[1].headers['Content-Type']).toBe('application/json')
    expect(requests[2].headers['Content-Type']).toBeUndefined()
    expect(requests[2].body).toBe(multipart)
    for (const request of requests) {
      expect(request.headers.Authorization).toBe('Bearer synthetic-token')
      expect(request.headers['X-Pathways-Organization-Id']).toBe(organizationId)
      expect(request.headers['X-Pathways-User-Id']).toBe(userId)
      expect(request.credentials).toBe('omit')
      expect(request.cache).toBe('no-store')
    }
  })

  it('distinguishes an absent project target from a recorded zero and forwards cancellation', async () => {
    const authUserId = '73500000-0000-4000-8000-000000000001'
    const organizationId = '73500000-0000-4000-8000-000000000002'
    const userId = '73500000-0000-4000-8000-000000000003'
    const projectId = '73500000-0000-4000-8000-000000000004'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    const project = {
      id: projectId,
      code: 'SYNTHETIC',
      title: 'Synthetic project',
      description: '',
      implementationArea: 'Synthetic area',
      sector: 'Education',
      status: 'PLANNED',
      projectOfficerIds: [],
      projectOfficers: [],
      startDate: null,
      endDate: null,
      updatedAt: '2026-09-23T00:00:00.000Z',
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...project, targetBeneficiaries: null })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...project, targetBeneficiaries: 0 })))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    expect(
      (await pathwaysClient.getProject(projectId, controller.signal)).targetBeneficiaries,
    ).toBeUndefined()
    expect(
      (await pathwaysClient.getProject(projectId, controller.signal)).targetBeneficiaries,
    ).toBe(0)
    expect(fetcher.mock.calls.every((call) => call[1].signal === controller.signal)).toBe(true)
  })
  beforeEach(() => {
    browser.getSession.mockReset()
    sourceMutationTickets.clear()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(mutationId)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not fabricate collection records while remaining domain endpoints are unavailable', async () => {
    // Published projects are read over the network; keep a locally running API out of this test.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('network unavailable')))
    const collections = await Promise.allSettled([
      pathwaysClient.getExpenses('project-id'),
      pathwaysClient.getRecommendationOutcomes('project-id'),
      pathwaysClient.getTransparencySections('project-id'),
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

    expect(collections.every((result) => result.status === 'rejected')).toBe(true)
    expect(
      collections.every(
        (result) => result.status === 'rejected' && result.reason instanceof PathwaysClientError,
      ),
    ).toBe(true)
    await expect(pathwaysClient.getBeneficiaryRecordsForRole('Program Manager')).resolves.toEqual(
      [],
    )
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
      targetGoal: '75',
      projectGoalComparison: { state: 'BELOW_TARGET', reason: null },
      internalAuditSalt: 'must-not-leak',
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
        new Response(
          JSON.stringify({
            ...activity,
            sourceAcknowledgement: { requestId: mutationId, committed: true, replayed: false },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    vi.stubGlobal('fetch', fetcher)

    const [loaded] = await pathwaysClient.getActivities(projectId)
    expect(loaded).toMatchObject({ id: activity.id, indicatorIds: [], journeyStageId: '' })
    expect(loaded).not.toHaveProperty('targetGoal')
    expect(loaded).not.toHaveProperty('projectGoalComparison')
    expect(loaded).not.toHaveProperty('internalAuditSalt')
    await pathwaysClient.createActivity(
      {
        projectId,
        title: activity.title,
        description: activity.description,
        startDate: activity.startDate,
        dueDate: activity.dueDate,
        timelineOverrideJustification: 'Approved timeline variance',
        targetBeneficiaries: 30,
        budgetAllocation: '10000.50',
        assignedUserIds: [officerId],
        indicatorIds: [],
        journeyStageId: null,
      },
      mutationContext,
    )

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/activities`,
    )
    const createRequest = fetcher.mock.calls[1]?.[1] as RequestInit
    expect(JSON.parse(String(createRequest.body))).toEqual({
      title: activity.title,
      description: activity.description,
      plannedStartDate: activity.startDate,
      plannedEndDate: activity.dueDate,
      timelineOverrideJustification: 'Approved timeline variance',
      targetBeneficiaries: 30,
      budgetAllocation: '10000.50',
      assignedUserIds: [officerId],
      indicatorIds: [],
      journeyStageId: null,
      clientMutationId: mutationId,
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
            targetGoal: '75',
            description: null,
            objectives: null,
            implementationArea: 'Quezon City',

            startDate: '2026-01-01',
            endDate: null,
            status: 'ONGOING',
            programId: null,
            projectManager: null,
            updatedAt: '2026-09-13T00:00:00.000Z',
          },
          {
            id: '73000000-0000-4000-8000-000000000005',
            code: 'P01-CONTEXT',
            title: 'Scoped project context',
            status: 'PLANNED',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetcher)

    const projects = await pathwaysClient.getProjects()
    // Metrics come only from the overview endpoint; the profile never fabricates zeros.
    for (const project of projects)
      for (const key of [
        'metricsAvailable',
        'kpiAchievement',
        'budgetUtilization',
        'timelineProgress',
        'beneficiariesReached',
      ])
        expect(project).not.toHaveProperty(key)
    expect(projects).toMatchObject([
      {
        title: 'Persisted project',
        area: 'Quezon City',

        startDate: '2026-01-01',
        endDate: null,
      },
      {
        title: 'Scoped project context',

        description: '',
      },
    ])
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'http://127.0.0.1:4000/api/projects',
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer synthetic-access-token',
          'X-Pathways-Organization-Id': organizationId,
          'X-Pathways-User-Id': userId,
        },
      }),
    )
  })

  it('creates and updates only supported project profile fields through the real API contract', async () => {
    const authUserId = '73500000-0000-4000-8000-000000000001'
    const organizationId = '73500000-0000-4000-8000-000000000002'
    const userId = '73500000-0000-4000-8000-000000000003'
    const projectId = '73500000-0000-4000-8000-000000000004'
    const project = {
      id: projectId,
      code: 'PRJ-73500000-0000-4000-8000-000000000004',
      title: 'Persisted project',
      description: 'Persisted project description.',
      objectives: 'Persisted project objectives.',
      implementationArea: 'Navotas',
      implementingPartners: 'Community Partner',
      sector: 'Education',
      targetBeneficiaries: 450,
      projectBudget: '125000.50',

      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'PLANNED',
      programId: null,
      projectManager: 'Synthetic manager',
      programManagerId: null,
      programManager: null,
      projectManagerId: '73500000-0000-4000-8000-000000000003',
      monitoringOfficerId: null,
      monitoringOfficer: null,
      projectOfficerIds: [],
      projectOfficers: [],
      updatedAt: '2026-09-23T00:00:00.000Z',
    }
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
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(project), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...project,
            title: 'Updated project',
            status: 'ONGOING',
            sourceAcknowledgement: { requestId: mutationId, committed: true, replayed: false },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    vi.stubGlobal('fetch', fetcher)

    await expect(
      pathwaysClient.createProject({
        title: project.title,
        description: project.description,
        objectives: project.objectives,
        implementationArea: project.implementationArea,
        sector: project.sector,
        targetBeneficiaries: project.targetBeneficiaries,
        projectBudget: project.projectBudget,

        startDate: project.startDate,
        endDate: project.endDate,
        status: 'Planned',
      }),
    ).resolves.toMatchObject({
      id: projectId,
      code: project.code,
      status: 'Planned',
      storedStatus: 'PLANNED',
    })
    await expect(
      pathwaysClient.updateProject(
        projectId,
        {
          code: project.code,
          title: 'Updated project',
          description: project.description,
          objectives: project.objectives,
          implementationArea: project.implementationArea,

          startDate: project.startDate,
          endDate: project.endDate,
          status: 'Active',
          expectedUpdatedAt: project.updatedAt,
        },
        mutationContext,
      ),
    ).resolves.toMatchObject({ title: 'Updated project', status: 'Active' })

    const createRequest = fetcher.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(createRequest.body))).toEqual({
      title: project.title,
      description: project.description,
      objectives: project.objectives,
      implementationArea: project.implementationArea,
      sector: project.sector,
      targetBeneficiaries: project.targetBeneficiaries,
      projectBudget: project.projectBudget,

      startDate: project.startDate,
      endDate: project.endDate,
      status: 'PLANNED',
    })
    const updateRequest = fetcher.mock.calls[1]?.[1] as RequestInit
    expect(JSON.parse(String(updateRequest.body))).toEqual({
      clientMutationId: mutationId,
      code: project.code,
      title: 'Updated project',
      description: project.description,
      objectives: project.objectives,
      implementationArea: project.implementationArea,

      startDate: project.startDate,
      endDate: project.endDate,
      status: 'ONGOING',
      expectedUpdatedAt: project.updatedAt,
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:4000/api/projects')
    expect(fetcher.mock.calls[1]?.[0]).toBe(`http://127.0.0.1:4000/api/projects/${projectId}`)
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

  it('surfaces the server reason for a 403 instead of a generic message', async () => {
    const authUserId = '74050000-0000-4000-8000-000000000001'
    const organizationId = '74050000-0000-4000-8000-000000000002'
    const userId = '74050000-0000-4000-8000-000000000003'
    const projectId = '74050000-0000-4000-8000-000000000004'
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
            message: 'A Project Manager cannot remove their own project authority.',
            error: 'Forbidden',
            statusCode: 403,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(pathwaysClient.getProject(projectId)).rejects.toMatchObject({
      code: 'forbidden',
      message: 'A Project Manager cannot remove their own project authority.',
    })
  })

  it('joins a class-validator string-array message instead of falling back to a generic message', async () => {
    const authUserId = '74060000-0000-4000-8000-000000000001'
    const organizationId = '74060000-0000-4000-8000-000000000002'
    const userId = '74060000-0000-4000-8000-000000000003'
    const projectId = '74060000-0000-4000-8000-000000000004'
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
            message: ['startDate must be a valid ISO 8601 date string'],
            error: 'Bad Request',
            statusCode: 400,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(pathwaysClient.getProject(projectId)).rejects.toMatchObject({
      code: 'invalid',
      message: 'startDate must be a valid ISO 8601 date string',
    })
  })

  it('falls back to a generic message for a 5xx server error', async () => {
    const authUserId = '74070000-0000-4000-8000-000000000001'
    const organizationId = '74070000-0000-4000-8000-000000000002'
    const userId = '74070000-0000-4000-8000-000000000003'
    const projectId = '74070000-0000-4000-8000-000000000004'
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
        new Response(JSON.stringify({ message: 'Internal error stack trace details.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(pathwaysClient.getProject(projectId)).rejects.toMatchObject({
      code: 'network',
      message: 'The requested operation could not be completed.',
    })
  })

  it('uses the scoped paginated draft-list and persisted-submission routes', async () => {
    const authUserId = '74100000-0000-4000-8000-000000000001'
    const organizationId = '74100000-0000-4000-8000-000000000002'
    const userId = '74100000-0000-4000-8000-000000000003'
    const projectId = '74100000-0000-4000-8000-000000000004'
    const formId = '74100000-0000-4000-8000-000000000005'
    const submissionId = '74100000-0000-4000-8000-000000000006'
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
        new Response(JSON.stringify({ offset: 5, limit: 5, total: 6, items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: submissionId,
            status: 'DRAFT',
            formId,
            formVersion: 1,
            updatedAt: '2026-09-23T00:00:00.000Z',
            values: { score: 42 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetcher)

    await pathwaysClient.listDirectSubmissions(projectId, formId, 5, 5)
    await pathwaysClient.getDirectSubmission(projectId, formId, submissionId)

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/metadata/projects/${projectId}/forms/${formId}/submissions?offset=5&limit=5`,
    )
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `http://127.0.0.1:4000/api/metadata/projects/${projectId}/forms/${formId}/submissions/${submissionId}`,
    )
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

describe('project client retired output omission', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  it('does not expose preserved targetGoal from an older project response', async () => {
    const authUserId = '79000000-0000-4000-8000-000000000001'
    const organizationId = '79000000-0000-4000-8000-000000000002'
    const userId = '79000000-0000-4000-8000-000000000003'
    const projectId = '79000000-0000-4000-8000-000000000004'
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: projectId,
            code: 'OLD',
            title: 'Historical project',
            status: 'PLANNED',
            targetBeneficiaries: 45,
            targetGoal: '75.1234',
            description: null,
            objectives: null,
            implementationArea: null,
            sector: null,
            implementingPartners: null,
            projectBudget: null,
            startDate: null,
            endDate: null,
            programId: null,
            programManager: null,
            programManagerId: null,
            projectManager: null,
            projectManagerId: null,
            monitoringOfficer: null,
            monitoringOfficerId: null,
            projectOfficers: [],
            projectOfficerIds: [],
            updatedAt: '2026-09-26T00:00:00Z',
          }),
          { status: 200 },
        ),
      ),
    )
    const read = await pathwaysClient.getProject(projectId)
    expect(read).not.toHaveProperty('targetGoal')
    expect(read.targetBeneficiaries).toBe(45)
  })
})

describe('workspace ownership during asynchronous token acquisition', () => {
  const authUserId = '72000000-0000-4000-8000-000000000001'
  const organizationId = '72000000-0000-4000-8000-000000000002'
  const userId = '72000000-0000-4000-8000-000000000003'
  const projectId = '72000000-0000-4000-8000-000000000004'
  const initialCookie = `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`
  beforeEach(() => {
    browser.getSession.mockReset()
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { cookie: initialCookie })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  it.each(['workspace', 'subject', 'logout'])(
    'does not dispatch an entered beneficiary payload after %s change',
    async (reason) => {
      let resolve!: (value: unknown) => void
      browser.getSession.mockReturnValue(
        new Promise((resolvePromise) => {
          resolve = resolvePromise
        }),
      )
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)
      const request = pathwaysClient.registerBeneficiary(projectId, {
        formId: '72000000-0000-4000-8000-000000000005',
        clientRegistrationId: '72000000-0000-4000-8000-000000000006',
        values: { display_name: 'Actor A entered data' },
      })
      if (reason === 'workspace')
        document.cookie = `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId: '72000000-0000-4000-8000-000000000007', userId }))}`
      if (reason === 'logout') clearSensitiveDraftStorage()
      resolve({
        error: null,
        data: {
          session: {
            access_token: 'synthetic-token',
            user: {
              id: reason === 'subject' ? '72000000-0000-4000-8000-000000000008' : authUserId,
            },
          },
        },
      })
      await expect(request).rejects.toBeInstanceOf(PathwaysClientError)
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('keeps the exact workspace across a same-subject token refresh', async () => {
    browser.getSession.mockResolvedValue({
      error: null,
      data: { session: { access_token: 'synthetic-new-token', user: { id: authUserId } } },
    })
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetcher)
    await expect(pathwaysClient.getProjects()).resolves.toEqual([])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-new-token')
    expect(fetcher.mock.calls[0][1].headers['X-Pathways-Organization-Id']).toBe(organizationId)
  })
})

describe('Beneficiary step-up denial', () => {
  const authUserId = '73900000-0000-4000-8000-000000000001'
  const setup = (body: unknown) => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(
        JSON.stringify({
          authUserId,
          organizationId: '73900000-0000-4000-8000-000000000002',
          userId: '73900000-0000-4000-8000-000000000003',
        }),
      )}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 403 })),
    )
    return dispatchEvent
  }
  afterEach(() => vi.unstubAllGlobals())

  it('announces the prompt and marks STEP_UP_REQUIRED without exposing detail', async () => {
    const dispatchEvent = setup({ statusCode: 403, code: 'STEP_UP_REQUIRED', message: 'x' })
    const error = await requestFoundationResponse('/beneficiaries/projects/p').catch((e) => e)
    expect(error).toBeInstanceOf(PathwaysClientError)
    expect(error).toMatchObject({ code: 'forbidden', status: 403, stepUpRequired: true })
    const events = dispatchEvent.mock.calls.map(([event]) => event.type)
    // Any 403 also tells the authorized-read cache to stop reusing cached reads.
    expect(events).toEqual([
      'pathways:authorization-denied',
      'pathways:beneficiary-step-up-required',
    ])
  })

  it('keeps an ordinary 403 as a plain denial with no prompt', async () => {
    const dispatchEvent = setup({ statusCode: 403, message: 'Missing permission.' })
    const error = await requestFoundationResponse('/beneficiaries/projects/p').catch((e) => e)
    expect(error).toMatchObject({ code: 'forbidden', status: 403, stepUpRequired: false })
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'pathways:authorization-denied',
    ])
  })
})

describe('Activity proof response parsing', () => {
  const authUserId = '73a00000-0000-4000-8000-000000000001'
  const organizationId = '73a00000-0000-4000-8000-000000000002'
  const userId = '73a00000-0000-4000-8000-000000000003'
  const projectId = '73a00000-0000-4000-8000-000000000004'
  const activityId = '73a00000-0000-4000-8000-000000000005'

  const stubResponse = (body: unknown) => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    })
    browser.getSession.mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    browser.getSession.mockReset()
  })

  it('accepts a well-formed upload limits response and rejects an unknown key', async () => {
    const limits = {
      maxFiles: 10,
      maxFileBytes: 50 * 1024 * 1024,
      maxTotalBytes: 250 * 1024 * 1024,
      contentTypes: ['application/pdf'],
    }
    stubResponse(limits)
    await expect(pathwaysClient.getActivityProofUploadLimits(projectId)).resolves.toEqual(limits)
    stubResponse({ ...limits, extra: true })
    await expect(pathwaysClient.getActivityProofUploadLimits(projectId)).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects an upload limits contentTypes array over 10 entries', async () => {
    stubResponse({
      maxFiles: 10,
      maxFileBytes: 1,
      maxTotalBytes: 1,
      contentTypes: Array.from({ length: 11 }, (_, index) => `type/${index}`),
    })
    await expect(pathwaysClient.getActivityProofUploadLimits(projectId)).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('accepts a reservation whose uploadUrl is an https URL on the configured Supabase origin', async () => {
    const reservation = {
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: false,
          uploadUrl: 'https://synthetic-project.supabase.co/storage/v1/object/upload/evidence-1',
        },
      ],
    }
    stubResponse(reservation)
    await expect(
      pathwaysClient.reserveActivityProofUpload({
        projectId,
        activityId,
        clientUpdateId: 'client-1',
        progressPercent: 10,
        note: 'note',
        files: [],
      }),
    ).resolves.toEqual(reservation)
  })

  it('rejects a reservation uploadUrl pointing at an unexpected origin', async () => {
    stubResponse({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: false,
          uploadUrl: 'https://attacker.example/evidence-1',
        },
      ],
    })
    await expect(
      pathwaysClient.reserveActivityProofUpload({
        projectId,
        activityId,
        clientUpdateId: 'client-1',
        progressPercent: 10,
        note: 'note',
        files: [],
      }),
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('rejects a reservation uploadUrl using a non-https scheme', async () => {
    stubResponse({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: false,
          uploadUrl: 'http://synthetic-project.supabase.co/evidence-1',
        },
      ],
    })
    await expect(
      pathwaysClient.reserveActivityProofUpload({
        projectId,
        activityId,
        clientUpdateId: 'client-1',
        progressPercent: 10,
        note: 'note',
        files: [],
      }),
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('rejects a reservation files array over 10 entries', async () => {
    stubResponse({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: Array.from({ length: 11 }, (_, index) => ({
        evidenceId: `evidence-${index}`,
        fileName: `f${index}.pdf`,
        contentType: 'application/pdf',
        byteSize: 1,
        sha256: 'x'.repeat(64),
        storageReady: false,
        uploadUrl: null,
      })),
    })
    await expect(
      pathwaysClient.reserveActivityProofUpload({
        projectId,
        activityId,
        clientUpdateId: 'client-1',
        progressPercent: 10,
        note: 'note',
        files: [],
      }),
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('accepts a COMMITTED reservation and a COMMITTED finalize result', async () => {
    stubResponse({ clientUpdateId: 'client-1', status: 'COMMITTED', acknowledgement: { ok: true } })
    await expect(
      pathwaysClient.reserveActivityProofUpload({
        projectId,
        activityId,
        clientUpdateId: 'client-1',
        progressPercent: 10,
        note: 'note',
        files: [],
      }),
    ).resolves.toEqual({
      clientUpdateId: 'client-1',
      status: 'COMMITTED',
      acknowledgement: { ok: true },
    })
    stubResponse({ status: 'COMMITTED', acknowledgement: { ok: true } })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).resolves.toEqual({ status: 'COMMITTED', acknowledgement: { ok: true } })
  })

  it('accepts a first-commit finalize result carrying the activity, and rejects extra keys', async () => {
    const officerId = '73a00000-0000-4000-8000-000000000006'
    const committedActivity = {
      id: '73a00000-0000-4000-8000-000000000007',
      projectId,
      title: 'Community workshop',
      description: 'Synthetic activity',
      storedStatus: 'FOR_REVIEW',
      status: 'For Review',
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
      progress: 40,
      submittedProof: [],
      updateNotes: [],
      updatedAt: '2026-09-20T00:00:00.000Z',
      sourceAcknowledgement: { requestId: 'req-1', committed: true, replayed: false },
    }
    stubResponse({ status: 'COMMITTED', activity: committedActivity })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).resolves.toEqual({
      status: 'COMMITTED',
      activity: {
        ...committedActivity,
        // No budgetLoggedEntries in the payload means the logged total predates it and is
        // treated as withheld, and capabilities default when absent from the response.
        budgetLogged: null,
        budgetLoggedEntries: null,
        capabilities: { canEdit: false, canRecordProgress: false, canSubmitProof: false },
      },
    })
    // Extra top-level keys alongside `activity` are rejected.
    stubResponse({
      status: 'COMMITTED',
      activity: committedActivity,
      acknowledgement: { ok: true },
    })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).rejects.toMatchObject({ code: 'network' })
    // An `activity` payload missing sourceAcknowledgement is rejected.
    const { sourceAcknowledgement: _drop, ...withoutAcknowledgement } = committedActivity
    stubResponse({ status: 'COMMITTED', activity: withoutAcknowledgement })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).rejects.toMatchObject({ code: 'network' })
  })

  it('rejects a finalize response with an out-of-range remaining count and a wrong-typed field', async () => {
    stubResponse({ status: 'UPLOADING', updateId: 'update-1', remaining: -1 })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).rejects.toMatchObject({ code: 'network' })
    stubResponse({ status: 'UPLOADING', updateId: 42, remaining: 1 })
    await expect(
      pathwaysClient.finalizeActivityProofFile(projectId, activityId, 'update-1', 'evidence-1'),
    ).rejects.toMatchObject({ code: 'network' })
  })
})
