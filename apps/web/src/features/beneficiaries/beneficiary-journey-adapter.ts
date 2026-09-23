import type {
  BeneficiaryJourneyHistory,
  BeneficiaryNoteRecord,
  BeneficiaryParticipationRecord,
} from '@/types/pathways'

const attendanceStatus = (value: string): BeneficiaryParticipationRecord['attendanceStatus'] => {
  if (value === 'PARTIAL') return 'Partial'
  if (value === 'ABSENT') return 'Absent'
  return 'Present'
}

export const mapBeneficiaryJourneyHistory = (history: BeneficiaryJourneyHistory) => {
  const orderedEvents = history.events
    .slice()
    .sort(
      (first, second) =>
        first.eventDate.localeCompare(second.eventDate) ||
        first.recordedAt.localeCompare(second.recordedAt) ||
        first.id.localeCompare(second.id),
    )

  const participation: BeneficiaryParticipationRecord[] = orderedEvents
    .filter(
      (event) =>
        event.eventType === 'PARTICIPATION' &&
        Boolean(event.participationId) &&
        Boolean(event.activityId) &&
        Boolean(event.participation),
    )
    .map((event) => ({
      id: event.participationId as string,
      beneficiaryId: history.beneficiaryId,
      projectId: history.projectId,
      activityId: event.activityId as string,
      participatedAt: event.eventDate,
      attendanceStatus: attendanceStatus(event.participation?.attendanceStatus ?? ''),
      note: event.description ?? event.participation?.progressStatus ?? '',
    }))

  const notes: BeneficiaryNoteRecord[] = orderedEvents
    .filter((event) => Boolean(event.description))
    .map((event) => ({
      id: event.id,
      beneficiaryId: history.beneficiaryId,
      projectId: history.projectId,
      stageId: event.stageId ?? '',
      author: event.recordedBy,
      createdAt: event.recordedAt,
      visibility: 'Project team',
      note: event.correctionReason
        ? `${event.description as string} (Correction: ${event.correctionReason})`
        : (event.description as string),
    }))

  return { notes, participation }
}
