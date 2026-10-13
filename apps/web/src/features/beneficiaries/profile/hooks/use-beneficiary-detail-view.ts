import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

import type {
  ActivitySummary,
  BeneficiaryNoteRecord,
  BeneficiaryParticipationRecord,
  BeneficiaryRecord,
  DigitalFormDefinition,
  JourneyStageConfig,
} from '@/types/pathways'

import {
  deriveCurrentStage,
  progressionRate,
  resolveJourneySummary,
  stageForActivity,
} from '../../beneficiaries.utils'

export const useBeneficiaryDetailView = ({
  beneficiary,
  stages,
  activities,
  participation,
  notes,
  selectedStage,
  participationForms,
  projectId,
  assessmentsUnavailable,
}: {
  beneficiary: BeneficiaryRecord
  stages: JourneyStageConfig[]
  activities: ActivitySummary[]
  participation: BeneficiaryParticipationRecord[]
  notes: BeneficiaryNoteRecord[]
  selectedStage: JourneyStageConfig | null
  participationForms: DigitalFormDefinition[]
  projectId: string
  assessmentsUnavailable: boolean
}) => {
  const searchParams = useSearchParams()
  const summary = useMemo(
    () =>
      resolveJourneySummary(
        beneficiary.progress,
        stages,
        deriveCurrentStage(participation, stages, activities),
        progressionRate(participation, stages, activities),
      ),
    [activities, beneficiary.progress, participation, stages],
  )
  const currentStage = summary.stage
  const progress = summary.percent
  const orderedStages = useMemo(
    () => stages.slice().sort((first, second) => first.order - second.order),
    [stages],
  )
  const reachedStageIds = useMemo(
    () =>
      new Set(
        participation.map((record) => stageForActivity(record.activityId, stages, activities)?.id),
      ),
    [activities, participation, stages],
  )
  // A branch is off this person's path when they have no events on it but do on a sibling branch.
  const offPath = (stage: JourneyStageConfig) =>
    Boolean(stage.parentStageId) &&
    !reachedStageIds.has(stage.id) &&
    stages.some(
      (sibling) => sibling.parentStageId === stage.parentStageId && reachedStageIds.has(sibling.id),
    )
  const stageState = (stage: JourneyStageConfig) =>
    offPath(stage)
      ? 'off-path'
      : !currentStage || stage.order === currentStage.order
        ? 'current'
        : stage.order < currentStage.order
          ? 'done'
          : 'upcoming'
  const stageDisplayCode = (stage: JourneyStageConfig) => {
    const index = orderedStages.findIndex((candidate) => candidate.id === stage.id)
    return index >= 0 ? `J${index + 1}` : stage.code
  }

  const initials =
    [beneficiary.firstName, beneficiary.lastName]
      .map((name) => name?.trim().charAt(0))
      .filter(Boolean)
      .join('')
      .toUpperCase() || beneficiary.displayName.trim().charAt(0).toUpperCase()
  const headerEnrollment =
    beneficiary.enrollments.find((enrollment) => enrollment.projectId === projectId) ??
    beneficiary.enrollments[0]
  const latestEnrollment = beneficiary.enrollments.find((enrollment) =>
    beneficiary.projectIds.includes(enrollment.projectId),
  )
  const selectedStageActivities = selectedStage
    ? activities.filter((activity) => selectedStage.mappedActivityIds.includes(activity.id))
    : []
  const selectedStageParticipationActivities = selectedStageActivities.filter((activity) =>
    participationForms.some(
      (form) => form.activityId === activity.id && form.journeyStageId === selectedStage?.id,
    ),
  )
  // Pre and post tests can sit in different stages, so the pair is read across the enrollment.
  const orderedAssessments = [
    ...beneficiary.assessments.filter((item) => item.stageId === selectedStage?.id),
    ...beneficiary.assessments.filter((item) => item.stageId !== selectedStage?.id),
  ]
  const preAssessment = beneficiary.assessments.filter((item) => item.type === 'PRE_TEST').at(-1)
  const postAssessment = beneficiary.assessments.filter((item) => item.type === 'POST_TEST').at(-1)
  const assessmentChange =
    preAssessment && postAssessment && preAssessment.maximumScore === postAssessment.maximumScore
      ? Math.round((postAssessment.score - preAssessment.score) * 100) / 100
      : null
  const assessmentStageLabel = (stageId: string) => {
    const found = stages.find((candidate) => candidate.id === stageId)
    return found ? `${stageDisplayCode(found)} ${found.name}` : 'Unmapped stage'
  }
  const assessmentButtonTitle = assessmentsUnavailable
    ? 'Assessment results could not be loaded for your current access.'
    : beneficiary.assessments.length === 0
      ? 'No assessments are recorded for this person.'
      : 'View assessment'
  const selectedStageNotes = selectedStage
    ? notes.filter((note) => note.stageId === selectedStage.id)
    : []
  const unlinkedNotes = notes.filter((note) => !stages.some((stage) => stage.id === note.stageId))
  const transferDestinationOptions = beneficiary.enrollments.filter(
    (enrollment) => enrollment.projectId !== projectId && enrollment.status === 'Active',
  )
  const correctableNote = selectedStageNotes[selectedStageNotes.length - 1] ?? null
  const requestedReturnTo = searchParams?.get('returnTo')
  const directoryHref =
    requestedReturnTo &&
    (requestedReturnTo === '/beneficiaries' || requestedReturnTo.startsWith('/beneficiaries?'))
      ? requestedReturnTo
      : '/beneficiaries'

  return {
    currentStage,
    progress,
    stageState,
    stageDisplayCode,
    initials,
    headerEnrollment,
    latestEnrollment,
    selectedStageActivities,
    selectedStageParticipationActivities,
    orderedAssessments,
    assessmentChange,
    assessmentStageLabel,
    assessmentButtonTitle,
    selectedStageNotes,
    unlinkedNotes,
    transferDestinationOptions,
    correctableNote,
    directoryHref,
  }
}
