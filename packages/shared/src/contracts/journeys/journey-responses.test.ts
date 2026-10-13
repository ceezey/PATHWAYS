import { describe, expect, it } from 'vitest'

import { beneficiaryJourneyResponse, journeyStageResponse } from './journey-responses'

const uuid = '10000000-0000-4000-8000-000000000001'

describe('journey response contracts', () => {
  it('accepts a stage that carries the display label and rejects the stored label', () => {
    const stage = {
      id: uuid,
      projectId: uuid,
      code: 'ENTRY',
      name: 'Entry',
      order: 1,
      type: 'Follow-Up',
      terminal: false,
      mappedActivityIds: [],
      description: '',
      archived: false,
      updatedAt: '2026-09-01T00:00:00.000Z',
    }
    expect(journeyStageResponse.safeParse(stage).success).toBe(true)
    expect(journeyStageResponse.safeParse({ ...stage, type: 'FOLLOW_UP' }).success).toBe(false)
  })

  it('accepts a history with one enrollment event and one participation event', () => {
    const event = {
      id: uuid,
      eventType: 'ENROLLMENT',
      eventDate: '2026-09-01',
      description: null,
      note: null,
      stageId: null,
      stageCodeSnapshot: null,
      stageNameSnapshot: null,
      activityId: null,
      activityCodeSnapshot: null,
      activityTitleSnapshot: null,
      participationId: null,
      participation: null,
      correctsEventId: null,
      correctionReason: null,
      recordedAt: '2026-09-01T00:00:00.000Z',
      recordedBy: 'Fictional Officer',
    }
    const participation = {
      ...event,
      eventType: 'PARTICIPATION',
      participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
    }
    const history = {
      projectId: uuid,
      beneficiaryId: uuid,
      enrollmentId: uuid,
      enrollmentStatus: 'ACTIVE',
      events: [event, participation],
    }
    expect(beneficiaryJourneyResponse.safeParse(history).success).toBe(true)
    expect(
      beneficiaryJourneyResponse.safeParse({ ...history, events: [{ id: uuid }] }).success,
    ).toBe(false)
  })
})
