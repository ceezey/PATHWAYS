import type {
  BeneficiaryJourneyHistory,
  BeneficiaryNoteRecord,
  BeneficiaryOutcomeRecord,
  BeneficiaryParticipationRecord,
  JourneyCorrectionTarget,
  JourneyEventType,
} from '@/types/pathways'

import { formatDate } from '../beneficiaries.utils'

const attendanceLabels: Record<string, BeneficiaryParticipationRecord['attendanceStatus']> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  COMPLETED: 'Completed',
  NOT_COMPLETED: 'Not completed',
  EXCUSED: 'Excused',
}

const attendanceStatus = (value: string): BeneficiaryParticipationRecord['attendanceStatus'] =>
  attendanceLabels[value] ?? 'Present'

const progressLabels: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  NEEDS_FOLLOW_UP: 'Needs follow-up',
}

/** One source of label copy for journey event types. */
export const eventTypeLabels: Record<JourneyEventType, string> = {
  ENROLLMENT: 'Enrollment',
  PARTICIPATION: 'Participation',
  PROGRESS_UPDATE: 'Progress update',
  COMPLETION: 'Completed',
  FOLLOW_UP: 'Follow-up',
  DROPOUT: 'Dropped out',
  TRANSFER: 'Transferred',
}

const outcomeTypes = new Set<string>(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER'])

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
      outcome: progressLabels[event.participation?.progressStatus ?? ''],
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
      ...(event.note ? { journeyNote: event.note } : {}),
      note: event.correctionReason
        ? `${event.description as string} (Correction: ${event.correctionReason})`
        : (event.description as string),
    }))

  const outcomes: BeneficiaryOutcomeRecord[] = orderedEvents
    .filter((event) => outcomeTypes.has(event.eventType) && event.correctsEventId === null)
    .map((event) => ({
      id: event.id,
      eventType: event.eventType as BeneficiaryOutcomeRecord['eventType'],
      occurredAt: event.eventDate,
      stageId: event.stageId,
      activityId: event.activityId,
      description: event.description ?? '',
    }))

  const correctionTargets: JourneyCorrectionTarget[] = orderedEvents
    .filter((event) => event.correctsEventId === null && event.stageId !== null)
    .map((event) => ({
      id: event.id,
      stageId: event.stageId as string,
      eventDate: event.eventDate,
      label: [
        formatDate(event.eventDate),
        eventTypeLabels[event.eventType],
        event.activityTitleSnapshot ?? event.description,
      ]
        .filter(Boolean)
        .join(' · '),
      description: event.description ?? '',
      note: event.note ?? '',
    }))

  return { notes, participation, outcomes, correctionTargets }
}
