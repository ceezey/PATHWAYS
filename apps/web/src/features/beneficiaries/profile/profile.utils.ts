import type {
  ActivitySummary,
  BeneficiaryAssessmentRecord,
  BeneficiaryJourneyHistory,
  BeneficiaryNoteRecord,
  BeneficiaryOutcomeRecord,
  BeneficiaryParticipationRecord,
  JourneyCorrectionTarget,
  JourneyEventType,
  JourneyStageConfig,
} from '@/types/pathways'

import { formatDate, stageForActivity } from '../beneficiaries.utils'

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

export type ParticipationHistoryEntry = {
  id: string
  kind: 'participation' | 'assessment' | 'outcome'
  date: string
  stageId: string | null
  title: string
  detail: string
  result: string | null
  note: string
}

export const buildParticipationHistory = ({
  participation,
  assessments,
  outcomes,
  activities,
  stages,
}: {
  participation: BeneficiaryParticipationRecord[]
  assessments: BeneficiaryAssessmentRecord[]
  outcomes: BeneficiaryOutcomeRecord[]
  activities: ActivitySummary[]
  stages: JourneyStageConfig[]
}): ParticipationHistoryEntry[] => {
  const activityTitle = (activityId: string | null) =>
    activities.find((activity) => activity.id === activityId)?.title

  const entries: ParticipationHistoryEntry[] = [
    ...participation.map((record) => ({
      id: `participation:${record.id}`,
      kind: 'participation' as const,
      date: record.participatedAt.slice(0, 10),
      stageId: stageForActivity(record.activityId, stages, activities)?.id ?? null,
      title: activityTitle(record.activityId) ?? record.activityId,
      detail: record.attendanceStatus,
      result: record.outcome ? `Outcome: ${record.outcome}` : null,
      note: record.note,
    })),
    ...assessments.map((assessment) => ({
      id: `assessment:${assessment.id}`,
      kind: 'assessment' as const,
      date: assessment.assessedAt.slice(0, 10),
      stageId: assessment.stageId || null,
      title: assessment.title,
      detail: 'Assessment',
      result: `Score: ${assessment.score} / ${assessment.maximumScore}`,
      note: assessment.note,
    })),
    ...outcomes.map((outcome) => ({
      id: `outcome:${outcome.id}`,
      kind: 'outcome' as const,
      date: outcome.occurredAt.slice(0, 10),
      stageId: outcome.stageId,
      title: eventTypeLabels[outcome.eventType],
      detail: activityTitle(outcome.activityId) ?? 'Enrollment status',
      result: `Outcome: ${eventTypeLabels[outcome.eventType]}`,
      note: outcome.description,
    })),
  ]

  // Newest date first; same-date entries fall back to id so the order is stable.
  return entries.sort(
    (first, second) => second.date.localeCompare(first.date) || first.id.localeCompare(second.id),
  )
}

/** An empty bound is open; stageId 'all' keeps every stage. */
export type ParticipationHistoryFilters = { from: string; to: string; stageId: string }

export const filterParticipationHistory = (
  entries: ParticipationHistoryEntry[],
  { from, to, stageId }: ParticipationHistoryFilters,
) => {
  if (from && to && from > to) {
    return []
  }

  return entries.filter(
    (entry) =>
      (!from || entry.date >= from) &&
      (!to || entry.date <= to) &&
      (stageId === 'all' || entry.stageId === stageId),
  )
}
