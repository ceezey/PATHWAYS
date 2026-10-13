// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation: request.requestFoundation,
}))

import { pathwaysClient } from '@/lib/services/pathways-client'
import type { JourneyStageConfig } from '@/types/pathways'
import { journeysClient } from './journeys'

const projectId = '79500000-0000-4000-8000-000000000001'
const beneficiaryId = '79500000-0000-4000-8000-000000000002'
const stageId = '79500000-0000-4000-8000-000000000003'
const activityId = '79500000-0000-4000-8000-000000000004'
const eventId = '79500000-0000-4000-8000-000000000005'
const stagesPath = `/projects/${projectId}/journey-stages`
const journeyPath = `/beneficiaries/projects/${projectId}/${beneficiaryId}/journey`

const stage: JourneyStageConfig = {
  id: stageId,
  projectId,
  code: 'J2',
  name: 'Workshop participation',
  order: 2,
  type: 'Follow-Up',
  terminal: false,
  mappedActivityIds: [activityId],
  description: 'Core stage',
  archived: false,
  updatedAt: '2026-09-21T00:00:00.000Z',
}
const history = {
  projectId,
  beneficiaryId,
  enrollmentId: stageId,
  enrollmentStatus: 'ACTIVE',
  events: [
    {
      id: eventId,
      eventType: 'ENROLLMENT',
      eventDate: '2026-09-21',
      recordedAt: '2026-09-21T00:00:00.000Z',
      recordedBy: 'Fictional Officer',
    },
  ],
}

// The same cases run against the PathwaysClient methods until Task 3 removes them.
const clients = [
  ['pathwaysClient', pathwaysClient],
  ['journeysClient', journeysClient],
] as const

describe.each(clients)('%s journey requests', (_name, client) => {
  beforeEach(() => request.requestFoundation.mockReset())

  it('reads the stages with the abort signal and refuses a row of the wrong shape', async () => {
    const signal = new AbortController().signal
    request.requestFoundation.mockResolvedValue([stage])
    await expect(client.getJourneyStages(projectId, signal)).resolves.toEqual([stage])
    expect(request.requestFoundation).toHaveBeenCalledWith(stagesPath, { signal })
    request.requestFoundation.mockResolvedValue([{ ...stage, type: 'FOLLOW_UP' }])
    await expect(client.getJourneyStages(projectId)).rejects.toThrow(
      'Invalid journey-stage response.',
    )
    request.requestFoundation.mockResolvedValue({})
    await expect(client.getJourneyStages(projectId)).rejects.toThrow(
      'Invalid journey-stage response.',
    )
  })

  it('saves the stages with the stored type codes and the revision the editor read', async () => {
    request.requestFoundation.mockResolvedValue([stage])
    await client.saveJourneyStages(projectId, [stage])
    const [path, init] = request.requestFoundation.mock.calls[0]
    expect(path).toBe(stagesPath)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      stages: [
        {
          id: stageId,
          code: 'J2',
          name: 'Workshop participation',
          order: 2,
          type: 'FOLLOW_UP',
          terminal: false,
          description: 'Core stage',
          mappedActivityIds: [activityId],
          expectedUpdatedAt: '2026-09-21T00:00:00.000Z',
        },
      ],
    })
  })

  it('reads the history and refuses one without a list of events', async () => {
    request.requestFoundation.mockResolvedValue(history)
    await expect(client.getBeneficiaryJourneyHistory(projectId, beneficiaryId)).resolves.toEqual(
      history,
    )
    expect(request.requestFoundation).toHaveBeenCalledWith(journeyPath)
    request.requestFoundation.mockResolvedValue({ ...history, events: 'none' })
    await expect(client.getBeneficiaryJourneyHistory(projectId, beneficiaryId)).rejects.toThrow(
      'Invalid journey-history response.',
    )
  })

  it('posts an event and a correction at their append-only paths', async () => {
    request.requestFoundation.mockResolvedValue({ id: eventId })
    const event = {
      eventType: 'FOLLOW_UP',
      eventDate: '2026-09-22',
      description: 'Follow-up check',
      stageId,
    } as const
    const correction = {
      eventDate: '2026-09-21',
      description: 'Corrected wording',
      reason: 'Typo',
      stageId,
    }
    await client.transitionBeneficiaryJourney(projectId, beneficiaryId, event)
    await client.correctBeneficiaryJourneyEvent(projectId, beneficiaryId, 'a b', correction)
    expect(request.requestFoundation.mock.calls).toEqual([
      [`${journeyPath}/events`, { method: 'POST', body: JSON.stringify(event) }],
      [
        `${journeyPath}/events/a%20b/corrections`,
        { method: 'POST', body: JSON.stringify(correction) },
      ],
    ])
  })
})
