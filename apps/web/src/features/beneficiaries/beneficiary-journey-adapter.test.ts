import { describe, expect, it } from 'vitest'

import type { BeneficiaryJourneyHistory } from '@/types/pathways'

import { mapBeneficiaryJourneyHistory } from './beneficiary-journey-adapter'

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
          participation: { attendanceStatus: 'PARTIAL', progressStatus: 'IN_PROGRESS' },
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
        attendanceStatus: 'Partial',
        note: 'Attended the session.',
      }),
    ])
    expect(result.notes.map((note) => note.id)).toEqual(['event-1', 'event-2'])
    expect(result.notes[1]?.note).toContain('Correction: Verified source record')
  })
})
