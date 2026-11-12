import { describe, expect, it } from 'vitest'

import type { BeneficiaryJourneyEvent, BeneficiaryJourneyHistory } from '@/types/pathways'

import { mapBeneficiaryJourneyHistory } from './profile.utils'

describe('beneficiary journey history adapter', () => {
  it('keeps participation and corrections in deterministic chronological order', () => {
    const history: BeneficiaryJourneyHistory = {
      projectId: 'project-a',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [
        {
          id: 'event-2',
          eventType: 'PROGRESS_UPDATE',
          eventDate: '2026-06-16',
          description: 'Corrected stage context',
          stageId: 'stage-2',
          stageCodeSnapshot: 'J2',
          stageNameSnapshot: 'Follow-up',
          activityId: null,
          activityCodeSnapshot: null,
          activityTitleSnapshot: null,
          participationId: null,
          participation: null,
          correctsEventId: 'event-1',
          correctionReason: 'Verified source record',
          recordedAt: '2026-06-17T00:00:00.000Z',
          recordedBy: 'reviewer-a',
        },
        {
          id: 'event-1',
          eventType: 'PARTICIPATION',
          eventDate: '2026-06-15',
          description: 'Attended the session.',
          stageId: 'stage-1',
          stageCodeSnapshot: 'J1',
          stageNameSnapshot: 'Entry',
          activityId: 'activity-a',
          activityCodeSnapshot: 'ACT-1',
          activityTitleSnapshot: 'Orientation',
          participationId: 'participation-a',
          participation: { attendanceStatus: 'NOT_COMPLETED', progressStatus: 'IN_PROGRESS' },
          correctsEventId: null,
          correctionReason: null,
          recordedAt: '2026-06-15T12:00:00.000Z',
          recordedBy: 'officer-a',
        },
      ],
    }

    const result = mapBeneficiaryJourneyHistory(history)

    expect(result.participation).toEqual([
      expect.objectContaining({
        id: 'participation-a',
        activityId: 'activity-a',
        attendanceStatus: 'Not completed',
        note: 'Attended the session.',
      }),
    ])
    expect(result.notes.map((note) => note.id)).toEqual(['event-1', 'event-2'])
    expect(result.notes[1]?.note).toContain('Correction: Verified source record')
  })

  it('exposes the optional journey note and leaves it off when absent', () => {
    const event = {
      id: 'event-1',
      eventType: 'FOLLOW_UP',
      eventDate: '2026-06-15',
      description: 'Followed up.',
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
      recordedAt: '2026-06-15T12:00:00.000Z',
      recordedBy: 'officer-a',
    } as const
    const history = (note: string | null): BeneficiaryJourneyHistory => ({
      projectId: 'project-a',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [{ ...event, note }],
    })

    expect(mapBeneficiaryJourneyHistory(history('Needs a visit.')).notes[0]?.journeyNote).toBe(
      'Needs a visit.',
    )
    expect(mapBeneficiaryJourneyHistory(history(null)).notes[0]).not.toHaveProperty('journeyNote')
  })

  it.each([
    ['PRESENT', 'Present'],
    ['ABSENT', 'Absent'],
    ['COMPLETED', 'Completed'],
    ['NOT_COMPLETED', 'Not completed'],
    ['EXCUSED', 'Excused'],
  ])('maps the %s attendance status to %s', (value, label) => {
    const result = mapBeneficiaryJourneyHistory({
      projectId: 'project-a',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events: [
        {
          id: 'event-1',
          eventType: 'PARTICIPATION',
          eventDate: '2026-06-15',
          description: null,
          stageId: null,
          stageCodeSnapshot: null,
          stageNameSnapshot: null,
          activityId: 'activity-a',
          activityCodeSnapshot: null,
          activityTitleSnapshot: null,
          participationId: 'participation-a',
          participation: { attendanceStatus: value, progressStatus: 'IN_PROGRESS' },
          correctsEventId: null,
          correctionReason: null,
          recordedAt: '2026-06-15T12:00:00.000Z',
          recordedBy: 'officer-a',
        },
      ],
    })
    expect(result.participation[0]?.attendanceStatus).toBe(label)
  })

  describe('outcomes and correction targets', () => {
    const baseEvent = {
      eventType: 'FOLLOW_UP',
      eventDate: '2026-06-15',
      description: null,
      stageId: 'stage-1',
      stageCodeSnapshot: null,
      stageNameSnapshot: null,
      activityId: null,
      activityCodeSnapshot: null,
      activityTitleSnapshot: null,
      participationId: null,
      participation: null,
      correctsEventId: null,
      correctionReason: null,
      recordedAt: '2026-06-15T12:00:00.000Z',
      recordedBy: 'officer-a',
    } as const
    const historyOf = (events: BeneficiaryJourneyEvent[]): BeneficiaryJourneyHistory => ({
      projectId: 'project-a',
      beneficiaryId: 'beneficiary-a',
      enrollmentId: 'enrollment-a',
      enrollmentStatus: 'ACTIVE',
      events,
    })

    it('lists every original entry as a correction target, including undescribed and already corrected ones', () => {
      const { correctionTargets } = mapBeneficiaryJourneyHistory(
        historyOf([
          {
            ...baseEvent,
            id: 'P1',
            eventType: 'PARTICIPATION',
            eventDate: '2026-06-14',
            activityId: 'activity-a',
            activityTitleSnapshot: 'Orientation',
            participationId: 'part-1',
            participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
          },
          { ...baseEvent, id: 'N1', description: 'Checked in' },
          {
            ...baseEvent,
            id: 'C1',
            description: 'Checked in again',
            correctsEventId: 'N1',
            correctionReason: 'Wrong date',
            recordedAt: '2026-06-16T00:00:00.000Z',
          },
          { ...baseEvent, id: 'X1', stageId: null, description: 'No stage' },
        ]),
      )
      expect(correctionTargets.map((t) => t.id)).toEqual(['P1', 'N1'])
      expect(correctionTargets[0]).toMatchObject({ stageId: 'stage-1', description: '', note: '' })
      expect(correctionTargets[0]?.label).toContain('Participation · Orientation')
      expect(correctionTargets[1]?.label).toContain('Follow-up · Checked in')
    })

    it('returns enrollment outcomes and the participation outcome label', () => {
      const { participation, outcomes } = mapBeneficiaryJourneyHistory(
        historyOf([
          {
            ...baseEvent,
            id: 'P1',
            eventType: 'PARTICIPATION',
            eventDate: '2026-06-10',
            activityId: 'activity-a',
            participationId: 'part-1',
            participation: { attendanceStatus: 'PRESENT', progressStatus: 'IN_PROGRESS' },
          },
          { ...baseEvent, id: 'D1', eventType: 'DROPOUT', description: 'Moved away' },
          {
            ...baseEvent,
            id: 'D2',
            eventType: 'DROPOUT',
            description: 'Moved abroad',
            correctsEventId: 'D1',
            correctionReason: 'Detail',
            recordedAt: '2026-06-16T00:00:00.000Z',
          },
          {
            ...baseEvent,
            id: 'F1',
            eventType: 'COMPLETION',
            eventDate: '2026-06-20',
            participationId: 'part-2',
          },
        ]),
      )
      expect(participation[0]?.outcome).toBe('In progress')
      expect(outcomes.map((o) => [o.id, o.eventType])).toEqual([
        ['D1', 'DROPOUT'],
        ['F1', 'COMPLETION'],
      ])
      expect(outcomes[0]).toMatchObject({ description: 'Moved away', stageId: 'stage-1' })
    })
  })
})
