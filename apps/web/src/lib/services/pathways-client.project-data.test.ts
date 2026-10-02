import { afterEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError, pathwaysClient, requestFoundationResponse } from './pathways-client'

const authUserId = '73700000-0000-4000-8000-000000000001'
const projectId = '73700000-0000-4000-8000-000000000004'
const setup = (body: unknown, status = 200) => {
  const dispatchEvent = vi.fn()
  vi.stubGlobal('window', { dispatchEvent })
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(
      JSON.stringify({
        authUserId,
        organizationId: '73700000-0000-4000-8000-000000000002',
        userId: '73700000-0000-4000-8000-000000000003',
      }),
    )}`,
  })
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-token', user: { id: authUserId } } },
    error: null,
  })
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetcher)
  return { dispatchEvent, fetcher }
}
const eventTypes = (dispatchEvent: ReturnType<typeof vi.fn>) =>
  dispatchEvent.mock.calls.map(([event]) => (event as Event).type)

const listItem = {
  id: '73700000-0000-4000-8000-000000000010',
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: '',
  storedStatus: 'NOT_STARTED',
  status: 'Planned',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  assignedUserIds: [],
  assignedTo: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 0,
  progress: 0,
  updatedAt: '2026-09-28T00:00:00.000Z',
  overdueExplanationNeeded: false,
  capabilities: {
    canEdit: false,
    canRecordProgress: true,
    canSubmitProof: true,
    canExplainOverdue: false,
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('project data loading client contract', () => {
  it('parses the lean activity list without requiring or inventing detail-only fields', async () => {
    setup([listItem])
    const [item] = await pathwaysClient.getActivities(projectId)
    expect(item).toEqual(listItem)
    for (const key of ['updateNotes', 'submittedProof', 'assignedEmails', 'budgetAllocation'])
      expect(item).not.toHaveProperty(key)
  })

  it.each([
    { assignedTo: undefined },
    { code: 7 },
    { status: null },
    { status: 'Unknown' },
    { storedStatus: 3 },
    { storedStatus: 'ARCHIVED' },
    { overdue: 'yes' },
    { dueDate: null },
    { description: undefined },
  ])('rejects a malformed list item %j', async (malformed) => {
    setup([{ ...listItem, ...malformed }])
    await expect(pathwaysClient.getActivities(projectId)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
  })

  it('accepts a list item without a code', async () => {
    setup([{ ...listItem, code: null }])
    await expect(pathwaysClient.getActivities(projectId)).resolves.toHaveLength(1)
  })

  it('reads one activity by id and forwards cancellation', async () => {
    const { fetcher } = setup({
      ...listItem,
      assignedEmails: [],
      beneficiariesReached: 0,
      budgetAllocation: null,
      budgetLogged: null,
      submittedProof: [],
      updateNotes: [],
      overdueExplanations: [],
    })
    const controller = new AbortController()
    await expect(
      pathwaysClient.getActivity(projectId, listItem.id, controller.signal),
    ).resolves.toMatchObject({ id: listItem.id, updateNotes: [] })
    expect(fetcher).toHaveBeenCalledWith(
      `http://127.0.0.1:4000/api/projects/${projectId}/activities/${listItem.id}`,
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it.each([
    [
      {
        id: 'e1',
        category: 'HURRICANE',
        explanation: 'x'.repeat(20),
        actorName: 'A',
        recordedAt: 'd',
      },
    ],
    [{ id: 'e1', category: 'WEATHER', explanation: 'too short', actorName: 'A', recordedAt: 'd' }],
    [
      {
        id: 'e1',
        category: 'WEATHER',
        explanation: 'x'.repeat(2001),
        actorName: 'A',
        recordedAt: 'd',
      },
    ],
    [{ id: 'e1', category: 'WEATHER', explanation: 'x'.repeat(20), actorName: 'A' }],
    [
      {
        id: 'e1',
        category: 'WEATHER',
        explanation: 'x'.repeat(20),
        actorName: 'A',
        recordedAt: 'd',
        extra: 1,
      },
    ],
    ['not-an-object'],
  ])('rejects a malformed overdueExplanations entry %j', async (entry) => {
    setup({
      ...listItem,
      assignedEmails: [],
      beneficiariesReached: 0,
      budgetAllocation: null,
      budgetLogged: null,
      submittedProof: [],
      updateNotes: [],
      overdueExplanations: [entry],
    })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
  })

  it.each([
    [
      { budgetLogged: '1500.50', budgetLoggedEntries: 2 },
      { budgetLogged: 1500.5, budgetLoggedEntries: 2 },
    ],
    [
      { budgetLogged: '0.00', budgetLoggedEntries: 0 },
      { budgetLogged: 0, budgetLoggedEntries: 0 },
    ],
    [
      { budgetLogged: null, budgetLoggedEntries: null },
      { budgetLogged: null, budgetLoggedEntries: null },
    ],
  ])('parses the logged expense total %j', async (logged, parsed) => {
    setup({
      ...listItem,
      assignedEmails: [],
      beneficiariesReached: 0,
      budgetAllocation: null,
      submittedProof: [],
      updateNotes: [],
      overdueExplanations: [],
      ...logged,
    })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).resolves.toMatchObject(parsed)
  })

  it('treats a legacy fixed 0 without an entry count as withheld, never as ₱0', async () => {
    setup({
      ...listItem,
      assignedEmails: [],
      beneficiariesReached: 0,
      budgetAllocation: null,
      budgetLogged: 0,
      submittedProof: [],
      updateNotes: [],
      overdueExplanations: [],
    })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).resolves.toMatchObject({
      budgetLogged: null,
      budgetLoggedEntries: null,
    })
  })

  it.each([
    { budgetLogged: '10.00', budgetLoggedEntries: null },
    { budgetLogged: null, budgetLoggedEntries: 0 },
    { budgetLogged: '10.00', budgetLoggedEntries: -1 },
  ])('rejects an incoherent logged expense total %j', async (logged) => {
    setup({
      ...listItem,
      assignedEmails: [],
      beneficiariesReached: 0,
      budgetAllocation: null,
      submittedProof: [],
      updateNotes: [],
      overdueExplanations: [],
      ...logged,
    })
    await expect(pathwaysClient.getActivity(projectId, listItem.id)).rejects.toBeInstanceOf(
      PathwaysClientError,
    )
  })

  it('validates the overview metrics contract and rejects a value on a suppressed cell', async () => {
    const metrics = {
      contractVersion: 'project.overview-metrics.v1',
      projectId,
      businessDate: '2026-09-28',
      generatedAt: '2026-09-28T00:00:00.000Z',
      kpiAchievement: null,
      budgetUtilization: null,
      beneficiariesReached: {
        metric: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
        target: 10,
      },
      timeline: {
        metric: { state: 'AVAILABLE', value: '50', reason: null },
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    }
    const { fetcher } = setup(metrics)
    await expect(pathwaysClient.getProjectOverviewMetrics(projectId)).resolves.toEqual(metrics)
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/overview-metrics`,
    )
    setup({
      ...metrics,
      beneficiariesReached: {
        metric: { state: 'SUPPRESSED', value: '3', reason: 'SMALL_CELL' },
        target: 10,
      },
    })
    await expect(pathwaysClient.getProjectOverviewMetrics(projectId)).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('signals a committed write, but not a read, to the authorized-read cache', async () => {
    const read = setup({})
    await requestFoundationResponse('/synthetic')
    expect(eventTypes(read.dispatchEvent)).toEqual([])
    const write = setup({})
    await requestFoundationResponse('/synthetic', { method: 'PATCH', body: '{}' })
    expect(eventTypes(write.dispatchEvent)).toEqual(['pathways:write-committed'])
  })

  it('carries the thrown error as the denial token, so one denial is counted once', async () => {
    const { dispatchEvent } = setup({ message: 'Denied' }, 403)
    const thrown = await requestFoundationResponse('/synthetic').catch((error: unknown) => error)
    const [event] = dispatchEvent.mock.calls.map(([value]) => value as CustomEvent<unknown>)
    expect(event?.type).toBe('pathways:authorization-denied')
    expect(event?.detail).toBe(thrown)
  })

  it('signals authorization denial for 401 and 403 responses', async () => {
    for (const status of [401, 403]) {
      const { dispatchEvent } = setup({ message: 'Denied' }, status)
      await expect(requestFoundationResponse('/synthetic')).rejects.toBeInstanceOf(
        PathwaysClientError,
      )
      expect(eventTypes(dispatchEvent)).toEqual(['pathways:authorization-denied'])
    }
  })
})
