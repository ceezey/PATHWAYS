// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  requestFoundation: vi.fn(),
  requestFoundationResponse: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
  requestFoundationResponse: request.requestFoundationResponse,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { sourceMutationTickets } from '@/lib/services/source-mutation'
import { activitiesClient } from './activities'

const projectId = '75100000-0000-4000-8000-000000000001'
const activityId = '75100000-0000-4000-8000-000000000002'
const updateId = '75100000-0000-4000-8000-000000000003'
const evidenceId = '75100000-0000-4000-8000-000000000004'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const base = `/projects/${projectId}/activities`

const detail = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: 'Synthetic description',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-02-01',
  assignedUserIds: [],
  assignedTo: [],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  beneficiariesReached: 0,
  budgetAllocation: null,
  progress: 20,
  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
  overdueExplanationNeeded: false,
  updatedAt: '2026-09-28T00:00:00.000Z',
}

// Answers like the API: the receipt echoes the request id the client generated.
const acknowledge = (replayed: boolean) => async (_path: string, init: RequestInit) => {
  const sent = JSON.parse(String(init.body)) as { clientMutationId: string }
  const receipt = { requestId: sent.clientMutationId, committed: true, replayed }
  return replayed ? receipt : { ...detail, sourceAcknowledgement: receipt }
}

// The same cases run against the PathwaysClient methods until Task 2 removes them.
const clients: Array<[string, typeof activitiesClient]> = [
  ['pathwaysClient', pathwaysClient],
  ['activitiesClient', activitiesClient],
]

describe.each(clients)('%s activity requests', (_name, client) => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    request.requestFoundation.mockReset()
    request.requestFoundationResponse.mockReset()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reads the context rows with the abort signal and keeps only id, title and stage', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([
      { id: 'a-1', title: 'First', journeyStageId: 's-1', status: 'IN_PROGRESS' },
    ])
    await expect(client.getActivityContext(projectId, signal)).resolves.toEqual([
      { id: 'a-1', title: 'First', journeyStageId: 's-1' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/context`, { signal })
  })

  it.each([
    ['a non-list', { rows: [] }],
    ['a row without a stage', [{ id: 'a-1', title: 'First' }]],
    [
      'more than 100 rows',
      Array.from({ length: 101 }, () => ({ id: 'a', title: 't', journeyStageId: 's' })),
    ],
  ])('refuses %s as the context answer', async (_label, answer) => {
    request.requestFoundation.mockResolvedValue(answer)
    await expect(client.getActivityContext(projectId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid activity context response.',
    })
  })

  it('reads the list and one activity with encoded ids and the abort signal', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValueOnce([])
    await client.getActivities('a/b c', signal)
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/projects/a%2Fb%20c/activities', {
      signal,
    })
    request.requestFoundation.mockResolvedValueOnce(detail)
    await expect(client.getActivity(projectId, 'x/y', signal)).resolves.toMatchObject({
      id: activityId,
    })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${base}/x%2Fy`, { signal })
  })

  it('rejects an activity answer without an id', async () => {
    request.requestFoundation.mockResolvedValue({ ...detail, id: undefined })
    await expect(client.getActivity(projectId, activityId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid activity response.',
    })
  })

  it('reads the assignable officers and keeps only user id and display name', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([{ userId: 'u-1', displayName: 'Ana Cruz' }])
    await expect(client.getAssignableProjectOfficers(projectId, signal)).resolves.toEqual([
      { userId: 'u-1', displayName: 'Ana Cruz' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/assignable-officers`, {
      signal,
    })
    request.requestFoundation.mockResolvedValue([{ userId: 'u-1', displayName: 'Ana', email: 'x' }])
    await expect(client.getAssignableProjectOfficers(projectId)).rejects.toMatchObject({
      message: 'Invalid officer response.',
    })
  })

  it('creates with the planned date names, the request id and the ownership check', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    const result = await client.createActivity(
      {
        projectId,
        title: 'New',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        targetBeneficiaries: 5,
        budgetAllocation: '100.00',
        assignedUserIds: ['u-1'],
        indicatorIds: ['i-1'],
        journeyStageId: null,
      },
      context,
    )
    expect(result).toMatchObject({ id: activityId })
    const [path, init, isCurrent] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(base)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      title: 'New',
      description: 'Described',
      plannedStartDate: '2026-03-01',
      plannedEndDate: '2026-04-01',
      targetBeneficiaries: 5,
      budgetAllocation: '100.00',
      assignedUserIds: ['u-1'],
      indicatorIds: ['i-1'],
      journeyStageId: null,
      clientMutationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('refuses to create without a mutation context', async () => {
    await expect(
      client.createActivity({
        projectId,
        title: 'New',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        assignedUserIds: [],
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('patches an update with the expected revision and returns a replay receipt as it is', async () => {
    request.requestFoundation.mockImplementation(acknowledge(true))
    const result = await client.updateActivity(
      {
        projectId,
        id: activityId,
        title: 'Edited',
        description: 'Described',
        startDate: '2026-03-01',
        dueDate: '2026-04-01',
        assignedUserIds: [],
        expectedUpdatedAt: detail.updatedAt,
      },
      context,
    )
    expect(result).toMatchObject({ committed: true, replayed: true })
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toMatchObject({
      title: 'Edited',
      plannedStartDate: '2026-03-01',
      plannedEndDate: '2026-04-01',
      expectedUpdatedAt: detail.updatedAt,
    })
  })

  it('transitions with the status, reason and revision', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    await client.transitionActivity(
      projectId,
      activityId,
      'CANCELLED',
      detail.updatedAt,
      'No longer needed',
      context,
    )
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}/transition`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({
      status: 'CANCELLED',
      expectedUpdatedAt: detail.updatedAt,
      reason: 'No longer needed',
    })
  })

  it('reviews an update with the decision, reason and revision', async () => {
    request.requestFoundation.mockImplementation(acknowledge(false))
    await client.reviewActivityUpdate(
      projectId,
      activityId,
      updateId,
      'RETURN',
      'Needs a clearer photo',
      detail.updatedAt,
      context,
    )
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/${activityId}/updates/${updateId}/review`)
    expect(JSON.parse(init.body)).toMatchObject({
      decision: 'RETURN',
      reason: 'Needs a clearer photo',
      expectedUpdatedAt: detail.updatedAt,
    })
  })

  // Every mutation returns a replay receipt as it is and refuses without a context before any request.
  const mutations: Array<
    [string, (client: typeof activitiesClient, ctx?: typeof context) => Promise<unknown>]
  > = [
    [
      'createActivity',
      (client, ctx) =>
        client.createActivity(
          {
            projectId,
            title: 'New',
            description: 'Described',
            startDate: '2026-03-01',
            dueDate: '2026-04-01',
            assignedUserIds: [],
          },
          ctx,
        ),
    ],
    [
      'updateActivity',
      (client, ctx) =>
        client.updateActivity(
          {
            projectId,
            id: activityId,
            title: 'Edited',
            description: 'Described',
            startDate: '2026-03-01',
            dueDate: '2026-04-01',
            assignedUserIds: [],
            expectedUpdatedAt: detail.updatedAt,
          },
          ctx,
        ),
    ],
    [
      'transitionActivity',
      (client, ctx) =>
        client.transitionActivity(
          projectId,
          activityId,
          'CANCELLED',
          detail.updatedAt,
          'No longer needed',
          ctx,
        ),
    ],
    [
      'reviewActivityUpdate',
      (client, ctx) =>
        client.reviewActivityUpdate(
          projectId,
          activityId,
          updateId,
          'RETURN',
          'Needs a clearer photo',
          detail.updatedAt,
          ctx,
        ),
    ],
  ]

  it.each(mutations)('%s returns a replay receipt as it is', async (_label, call) => {
    request.requestFoundation.mockImplementation(acknowledge(true))
    await expect(call(client, context)).resolves.toMatchObject({ committed: true, replayed: true })
  })

  it.each(mutations)('%s refuses without a context before any request', async (_label, call) => {
    await expect(call(client)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('records progress under the progressPercent name', async () => {
    request.requestFoundation.mockResolvedValue(detail)
    await client.recordActivityProgress({
      projectId,
      activityId,
      clientUpdateId: updateId,
      progress: 40,
      note: 'Half done',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`${base}/${activityId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ clientUpdateId: updateId, progressPercent: 40, note: 'Half done' }),
    })
  })

  it('records an overdue explanation', async () => {
    request.requestFoundation.mockResolvedValue(detail)
    await client.recordOverdueExplanation({
      projectId,
      activityId,
      clientMutationId: updateId,
      category: 'LOGISTICS',
      explanation: 'The venue was unavailable.',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}/${activityId}/overdue-explanations`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMutationId: updateId,
          category: 'LOGISTICS',
          explanation: 'The venue was unavailable.',
        }),
      },
    )
  })

  it('reads the evidence list and downloads a proof as a blob', async () => {
    request.requestFoundation.mockResolvedValue({ scope: 'aggregate', activities: [] })
    await expect(client.getEvidence(projectId)).resolves.toEqual({
      scope: 'aggregate',
      activities: [],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/evidence`)
    const blob = new Blob(['proof'])
    request.requestFoundationResponse.mockResolvedValue({ blob: async () => blob })
    await expect(client.downloadActivityProof(projectId, activityId, evidenceId)).resolves.toBe(
      blob,
    )
    expect(request.requestFoundationResponse).toHaveBeenCalledWith(
      `${base}/${activityId}/proof/${evidenceId}`,
    )
  })

  it('reads the upload limits and reserves with the session count only when it is given', async () => {
    request.requestFoundation.mockResolvedValueOnce({
      maxFiles: 10,
      maxFileBytes: 1024,
      maxTotalBytes: 4096,
      contentTypes: ['application/pdf'],
    })
    await expect(client.getActivityProofUploadLimits(projectId)).resolves.toMatchObject({
      maxFiles: 10,
    })
    expect(request.requestFoundation).toHaveBeenLastCalledWith(`${base}/proof-upload-limits`)
    const reservation = { clientUpdateId: updateId, updateId, status: 'UPLOADING', files: [] }
    request.requestFoundation.mockResolvedValue(reservation)
    const input = {
      projectId,
      activityId,
      clientUpdateId: updateId,
      progressPercent: 50,
      note: 'Proof attached',
      files: [
        { fileName: 'a.pdf', contentType: 'application/pdf', byteSize: 10, sha256: 'a'.repeat(64) },
      ],
    }
    await client.reserveActivityProofUpload(input)
    await client.reserveActivityProofUpload({ ...input, beneficiariesReachedThisSession: 0 })
    const [first, second] = request.requestFoundation.mock.calls.slice(-2)
    expect(first[0]).toBe(`${base}/${activityId}/updates/reservations`)
    expect(first[1].method).toBe('POST')
    expect(JSON.parse(first[1].body)).toEqual({
      clientUpdateId: updateId,
      progressPercent: 50,
      note: 'Proof attached',
      files: input.files,
    })
    expect(JSON.parse(second[1].body)).toMatchObject({ beneficiariesReachedThisSession: 0 })
  })

  it('finalizes one evidence file with a bodyless POST', async () => {
    request.requestFoundation.mockResolvedValue({ status: 'UPLOADING', updateId, remaining: 1 })
    await expect(
      client.finalizeActivityProofFile(projectId, activityId, updateId, evidenceId),
    ).resolves.toEqual({ status: 'UPLOADING', updateId, remaining: 1 })
    expect(request.requestFoundation).toHaveBeenCalledWith(
      `${base}/${activityId}/updates/${updateId}/files/${evidenceId}/finalize`,
      { method: 'POST' },
    )
  })

  it('puts the file to the signed URL without credentials and reports a refusal', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['proof'], 'proof.pdf', { type: 'application/pdf' })
    await expect(
      client.uploadActivityProofFile('http://localhost:54321/upload', file),
    ).rejects.toBeInstanceOf(PathwaysClientError)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('http://localhost:54321/upload')
    expect(init).toMatchObject({
      method: 'PUT',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    fetcher.mockResolvedValue({ ok: true, status: 200 })
    await expect(
      client.uploadActivityProofFile('http://localhost:54321/upload', file),
    ).resolves.toBeUndefined()
  })
})
