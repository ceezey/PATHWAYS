// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { SourceMutationRecoveryError, sourceMutationTickets } from '@/lib/services/source-mutation'
import { indicatorLibraryClient, indicatorsClient } from './indicators'

const projectId = '79300000-0000-4000-8000-000000000001'
const indicatorId = '79300000-0000-4000-8000-000000000002'
const requestKey = '79300000-0000-4000-8000-000000000003'
const entryId = '79300000-0000-4000-8000-000000000004'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const base = `/projects/${projectId}/indicators`

const indicator = {
  id: indicatorId,
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
const entry = {
  id: entryId,
  code: 'WORKSHOP_ATTENDEES',
  name: 'Workshop attendees',
  description: null,
  unitLabel: 'people',
  dataSource: 'Attendance sheet',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  recipe: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}
const measurement = {
  clientMeasurementId: requestKey,
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  value: '12',
  source: 'Attendance sheet',
}

// Answers like the API: the receipt echoes the key field the client sent.
const acknowledge =
  (keyField: string, replayed: boolean) => async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as Record<string, string>
    const receipt = { requestId: sent[keyField], committed: true, replayed }
    return replayed ? receipt : { ...indicator, sourceAcknowledgement: receipt }
  }

const client = indicatorsClient
const library = indicatorLibraryClient

describe('indicatorsClient indicator requests', () => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    request.requestFoundation.mockReset()
  })

  it('reads the definitions and the released values with encoded ids and the abort signal', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([indicator])
    await expect(client.getProjectIndicators('a/b c', signal)).resolves.toEqual([indicator])
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/projects/a%2Fb%20c/indicators', {
      signal,
    })
    await expect(client.getProjectIndicatorValues(projectId, signal)).resolves.toEqual([indicator])
    expect(request.requestFoundation).toHaveBeenLastCalledWith(
      `/projects/${projectId}/indicator-values`,
      {
        signal,
      },
    )
  })

  it('refuses a row with an unknown key or a list of more than 100 rows', async () => {
    request.requestFoundation.mockResolvedValue([{ ...indicator, projectGoalComparison: null }])
    await expect(client.getProjectIndicators(projectId)).rejects.toThrow()
    request.requestFoundation.mockResolvedValue(Array.from({ length: 101 }, () => indicator))
    await expect(client.getProjectIndicatorValues(projectId)).rejects.toThrow()
  })

  it('projects the definitions to code and label and needs a project', async () => {
    request.requestFoundation.mockResolvedValue([indicator])
    await expect(client.getIndicators(projectId)).resolves.toEqual([
      { id: indicatorId, projectId, code: 'OWN_TARGET', label: 'Own target' },
    ])
    request.requestFoundation.mockReset()
    await expect(client.getIndicators()).rejects.toMatchObject({
      code: 'invalid',
      message: 'Project scope is required.',
    })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it.each([
    [
      'create',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.createProjectIndicator(projectId, { code: 'NEW_ONE' } as never, c),
      base,
      'POST',
      { code: 'NEW_ONE' },
    ],
    [
      'create from the library',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.createProjectIndicatorFromLibrary(
          projectId,
          { libraryEntryId: entryId } as never,
          c,
        ),
      `${base}/from-library`,
      'POST',
      { libraryEntryId: entryId },
    ],
    [
      'update',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.updateProjectIndicator(
          projectId,
          indicatorId,
          { name: 'Renamed', expectedRevision: 1 } as never,
          c,
        ),
      `${base}/${indicatorId}`,
      'PATCH',
      { name: 'Renamed', expectedRevision: 1 },
    ],
    [
      'archive',
      (client_: typeof indicatorsClient, c?: typeof context) =>
        client_.archiveProjectIndicator(projectId, indicatorId, 3, c),
      `${base}/${indicatorId}/archive`,
      'POST',
      { expectedRevision: 3 },
    ],
  ])(
    '%s sends its body with the request id and the ownership check',
    async (_label, run, path, method, body) => {
      request.requestFoundation.mockImplementation(acknowledge('clientMutationId', false))
      await expect(run(client, context)).resolves.toMatchObject({ id: indicatorId })
      const [sentPath, init, isCurrent] = request.requestFoundation.mock.calls[0]
      expect(sentPath).toBe(path)
      expect(init.method).toBe(method)
      expect(JSON.parse(init.body)).toEqual({
        ...body,
        clientMutationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
      expect(isCurrent).toBe(context.isCurrent)
    },
  )

  it('returns a replay receipt as the receipt and refuses a call without a context', async () => {
    request.requestFoundation.mockImplementation(acknowledge('clientMutationId', true))
    await expect(
      client.archiveProjectIndicator(projectId, indicatorId, 3, context),
    ).resolves.toEqual({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      committed: true,
      replayed: true,
    })
    request.requestFoundation.mockReset()
    await expect(client.archiveProjectIndicator(projectId, indicatorId, 3)).rejects.toMatchObject({
      code: 'unauthorized',
    })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })

  it('records a measurement under its own key field and the measurement path', async () => {
    request.requestFoundation.mockImplementation(acknowledge('clientMeasurementId', false))
    await expect(
      client.recordIndicatorMeasurement(projectId, 'x/y', measurement, context),
    ).resolves.toMatchObject({
      id: indicatorId,
    })
    const [path, init, isCurrent] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(`${base}/x%2Fy/measurements`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(measurement)
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('accepts a legacy bare indicator for a measurement and refuses an invalid receipt', async () => {
    request.requestFoundation.mockResolvedValue(indicator)
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, context),
    ).resolves.toEqual(indicator)
    sourceMutationTickets.clear()
    request.requestFoundation.mockResolvedValue({
      ...indicator,
      sourceAcknowledgement: { requestId: 'other' },
    })
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, context),
    ).rejects.toBeInstanceOf(SourceMutationRecoveryError)
  })

  it('refuses a measurement without a current context before any request', async () => {
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Current measurement ownership is required.',
    })
    await expect(
      client.recordIndicatorMeasurement(projectId, indicatorId, measurement, {
        ...context,
        isCurrent: () => false,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(request.requestFoundation).not.toHaveBeenCalled()
  })
})

describe('indicatorLibraryClient', () => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('lists the entries and refuses an unknown key', async () => {
    request.requestFoundation.mockResolvedValue([entry])
    await expect(library.list()).resolves.toEqual([entry])
    expect(request.requestFoundation).toHaveBeenCalledWith('/indicator-library')
    request.requestFoundation.mockResolvedValue([{ ...entry, extra: true }])
    await expect(library.list()).rejects.toThrow()
  })

  it('creates an entry with the given body and archives one with an encoded id', async () => {
    request.requestFoundation.mockResolvedValue(entry)
    const input = { code: 'WORKSHOP_ATTENDEES' } as never
    await expect(library.create(input)).resolves.toEqual(entry)
    expect(request.requestFoundation).toHaveBeenCalledWith('/indicator-library', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    request.requestFoundation.mockResolvedValue(undefined)
    await expect(library.archive('a/b')).resolves.toBeUndefined()
    expect(request.requestFoundation).toHaveBeenLastCalledWith('/indicator-library/a%2Fb/archive', {
      method: 'POST',
    })
  })
})
