import { describe, expect, it } from 'vitest'

import type {
  ActivitySummary,
  BeneficiaryAssessmentRecord,
  BeneficiaryJourneyEvent,
  BeneficiaryJourneyHistory,
  BeneficiaryOutcomeRecord,
  BeneficiaryParticipationRecord,
  JourneyStageConfig,
} from '@/types/pathways'

import {
  buildParticipationHistory,
  filterParticipationHistory,
  mapBeneficiaryJourneyHistory,
} from './profile.utils'

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

describe('participation history', () => {
  const activities = [
    { id: 'activity-a', title: 'Orientation', journeyStageId: 'stage-1' },
  ] as ActivitySummary[]
  const stages = [
    { id: 'stage-1', mappedActivityIds: ['activity-a'] },
    { id: 'stage-2', mappedActivityIds: [] },
  ] as JourneyStageConfig[]
  const participation = [
    {
      id: 'p1',
      beneficiaryId: 'b1',
      projectId: 'project-a',
      activityId: 'activity-a',
      participatedAt: '2026-06-15',
      attendanceStatus: 'Present',
      note: 'On time',
      outcome: 'In progress',
    },
  ] as BeneficiaryParticipationRecord[]
  const assessments = [
    {
      id: 'a1',
      beneficiaryId: 'b1',
      projectId: 'project-a',
      stageId: 'stage-2',
      type: 'PRE_TEST',
      title: 'Pre-test',
      assessedAt: '2026-06-10',
      score: 6,
      maximumScore: 10,
      source: 'Form',
      note: '',
    },
  ] as BeneficiaryAssessmentRecord[]
  const outcomes = [
    {
      id: 'o1',
      eventType: 'COMPLETION',
      occurredAt: '2026-06-20',
      stageId: null,
      activityId: null,
      description: 'Finished the program.',
    },
  ] as BeneficiaryOutcomeRecord[]

  const entries = buildParticipationHistory({
    participation,
    assessments,
    outcomes,
    activities,
    stages,
  })
  const kinds = (from: string, to: string, stageId = 'all') =>
    filterParticipationHistory(entries, { from, to, stageId }).map((entry) => entry.kind)

  it('lists participation, assessments and outcomes newest first with scores and outcomes', () => {
    expect(entries.map((entry) => entry.kind)).toEqual(['outcome', 'participation', 'assessment'])
    expect(entries[1]).toMatchObject({
      title: 'Orientation',
      detail: 'Present',
      result: 'Outcome: In progress',
      stageId: 'stage-1',
    })
    expect(entries[2]).toMatchObject({
      title: 'Pre-test',
      result: 'Score: 6 / 10',
      stageId: 'stage-2',
    })
    expect(entries[0]).toMatchObject({
      title: 'Completed',
      detail: 'Enrollment status',
      result: 'Outcome: Completed',
      stageId: null,
      note: 'Finished the program.',
    })
  })

  it('orders same-date entries by id', () => {
    const sameDay = buildParticipationHistory({
      participation,
      assessments: [{ ...assessments[0], assessedAt: '2026-06-15' }],
      outcomes: [],
      activities,
      stages,
    })

    expect(sameDay.map((entry) => entry.id)).toEqual(['assessment:a1', 'participation:p1'])
  })

  it('filters by date range with inclusive bounds', () => {
    expect(kinds('', '')).toHaveLength(3)
    expect(kinds('2026-06-12', '2026-06-15')).toEqual(['participation'])
  })

  it('filters by stage and drops entries without a stage', () => {
    expect(kinds('', '', 'stage-2')).toEqual(['assessment'])
  })

  it('returns nothing when the range is reversed', () => {
    expect(kinds('2026-06-21', '2026-06-01')).toEqual([])
  })
})
