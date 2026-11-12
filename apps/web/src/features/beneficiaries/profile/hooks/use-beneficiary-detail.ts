import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentRole } from '@/hooks/use-current-role'
import { beneficiariesClient } from '@/lib/api/beneficiaries'
import { PathwaysClientError } from '@/lib/api/core/request'
import { formsClient } from '@/lib/api/forms'
import { journeysClient } from '@/lib/api/journeys'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import type {
  ActivitySummary,
  BeneficiaryRecord,
  CorrectJourneyEventInput,
  DigitalFormDefinition,
  EnrollmentJourneyEventInput,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { buildParticipationHistory, mapBeneficiaryJourneyHistory } from '../profile.utils'

import { useBeneficiaryDetailView } from './use-beneficiary-detail-view'

const todayIso = () => new Date().toISOString().slice(0, 10)

export type BeneficiaryDetailProps = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: ActivitySummary[]
  stages: JourneyStageConfig[]
  participationForms: DigitalFormDefinition[]
  projectId: string
  assessmentsUnavailable?: boolean
  refreshAssessments?: () => Promise<void>
}

export const useBeneficiaryDetail = ({
  beneficiary: loadedBeneficiary,
  projects,
  activities,
  stages,
  participationForms,
  projectId,
  assessmentsUnavailable = false,
  refreshAssessments = async () => undefined,
}: BeneficiaryDetailProps) => {
  const { role, profile } = useCurrentRole()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [journey, setJourney] = useState(() => ({
    participation: loadedBeneficiary.participation,
    notes: loadedBeneficiary.notes,
    outcomes: loadedBeneficiary.outcomes ?? [],
    correctionTargets: loadedBeneficiary.correctionTargets ?? [],
  }))
  const { participation, notes, outcomes, correctionTargets } = journey
  // The server journey summary and enrollment status change with every journey write.
  const [summary, setSummary] = useState({
    progress: loadedBeneficiary.progress,
    enrollmentStatus: loadedBeneficiary.enrollmentStatus,
  })
  const beneficiary = useMemo(
    () => ({ ...loadedBeneficiary, ...summary }),
    [loadedBeneficiary, summary],
  )
  const enrollmentStatus = beneficiary.enrollmentStatus
  const [profileOpen, setProfileOpen] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [participationOpen, setParticipationOpen] = useState(false)
  const [savingParticipation, setSavingParticipation] = useState(false)
  const participationClientId = useRef<string | null>(null)
  const [selectedStage, setSelectedStage] = useState<JourneyStageConfig | null>(null)
  const [participationDraft, setParticipationDraft] = useState({
    activityId: activities[0]?.id ?? '',
    participatedAt: new Date().toISOString().slice(0, 10),
    attendanceStatus: 'Present',
    note: '',
  })
  const [journeyOpen, setJourneyOpen] = useState(false)
  const [savingJourney, setSavingJourney] = useState(false)
  const [journeyDraft, setJourneyDraft] = useState<{
    eventType: EnrollmentJourneyEventInput['eventType']
    eventDate: string
    description: string
    note: string
    stageId: string
    destinationProjectId: string
  }>({
    eventType: 'FOLLOW_UP',
    eventDate: todayIso(),
    description: '',
    note: '',
    stageId: '',
    destinationProjectId: '',
  })
  const [noteOpen, setNoteOpen] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState({
    eventId: '',
    eventDate: todayIso(),
    description: '',
    note: '',
    reason: '',
  })
  const canEditBeneficiary = isUiActionAvailable(role, 'beneficiaries.edit', profile)
  // Aggregate-only roles never see beneficiary media; the server denies them as well.
  const canViewMedia = role !== null && !['Program Manager', 'Grant Manager'].includes(role)
  const canUploadMedia = isUiActionAvailable(role, 'beneficiaries.media.upload', profile)
  const canViewAssessmentDetail = isUiActionAvailable(role, 'assessments.detail.view', profile)
  const canRecordAssessment = isUiActionAvailable(role, 'assessments.record', profile)
  const canTransitionJourney = isUiActionAvailable(
    role,
    'beneficiaries.journey.transition',
    profile,
  )
  const canCorrectJourney = isUiActionAvailable(role, 'beneficiaries.journey.correct', profile)
  const canRecordParticipation = isUiActionAvailable(
    role,
    'beneficiaries.participation.record',
    profile,
  )

  const view = useBeneficiaryDetailView({
    beneficiary,
    stages,
    activities,
    participation,
    notes,
    correctionTargets,
    selectedStage,
    participationForms,
    projectId,
    assessmentsUnavailable,
    canRecordAssessment,
  })
  const participationHistory = useMemo(
    () =>
      buildParticipationHistory({
        participation,
        assessments: beneficiary.assessments,
        outcomes,
        activities,
        stages,
      }),
    [participation, beneficiary.assessments, outcomes, activities, stages],
  )
  const {
    selectedStageParticipationActivities,
    transferDestinationOptions,
    selectedStageCorrectionTargets,
  } = view

  const openParticipationForSelectedStage = () => {
    if (
      !selectedStage ||
      !canRecordParticipation ||
      selectedStageParticipationActivities.length === 0
    )
      return
    setParticipationDraft((current) => ({
      ...current,
      activityId: selectedStageParticipationActivities.some(
        (activity) => activity.id === current.activityId,
      )
        ? current.activityId
        : (selectedStageParticipationActivities[0]?.id ?? ''),
    }))
    setParticipationOpen(true)
  }

  const openJourneyTransition = () => {
    if (!canTransitionJourney || enrollmentStatus !== 'Active') return
    setJourneyDraft({
      eventType: 'FOLLOW_UP',
      eventDate: todayIso(),
      description: '',
      note: '',
      stageId: selectedStage?.id ?? '',
      destinationProjectId: transferDestinationOptions[0]?.projectId ?? '',
    })
    setJourneyOpen(true)
  }

  const openNoteForSelectedStage = () => {
    const latest = selectedStageCorrectionTargets.at(-1)
    if (!canCorrectJourney || !latest) return
    setNoteDraft({
      eventId: latest.id,
      eventDate: todayIso(),
      description: latest.description,
      note: latest.note,
      reason: '',
    })
    setNoteOpen(true)
  }

  // Switching the target swaps the prefilled text and keeps the reason and date already typed.
  const chooseCorrectionTarget = (eventId: string) => {
    const target = selectedStageCorrectionTargets.find((candidate) => candidate.id === eventId)
    if (!target) return
    setNoteDraft((current) => ({
      ...current,
      eventId: target.id,
      description: target.description,
      note: target.note,
    }))
  }

  const recordParticipation = async () => {
    if (!participationDraft.activityId || !participationDraft.participatedAt) {
      toast.error('Select an activity and date.')
      return
    }
    if (
      projects.some(
        (project) => beneficiary.projectIds.includes(project.id) && project.status === 'Completed',
      ) &&
      !window.confirm('This project is completed. Record the participation update anyway?')
    )
      return
    const form = participationForms.find(
      (candidate) =>
        candidate.activityId === participationDraft.activityId &&
        candidate.journeyStageId === selectedStage?.id,
    )
    if (!form) {
      toast.error('No published activity-monitoring form is mapped to this activity and stage.')
      return
    }

    setSavingParticipation(true)
    try {
      participationClientId.current ??= crypto.randomUUID()
      const saved = await formsClient.saveDirectSubmission(
        projectId,
        form.id,
        participationClientId.current,
        {
          beneficiary_code: beneficiary.code,
          participation_date: participationDraft.participatedAt,
          attendance_status: participationDraft.attendanceStatus.toUpperCase().replace(' ', '_'),
          progress_status: 'IN_PROGRESS',
          progress_notes: participationDraft.note.trim() || null,
        },
      )
      if (saved.status === 'DRAFT') {
        await formsClient.submitDirectSubmission(projectId, form.id, saved.id, saved.updatedAt)
      }
      await refreshJourneyHistory()
      setParticipationOpen(false)
      setParticipationDraft((current) => ({ ...current, note: '' }))
      participationClientId.current = null
      toast.success('Participation recorded and reloaded from the project history.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Participation could not be recorded.')
    } finally {
      setSavingParticipation(false)
    }
  }

  const refreshJourneyHistory = async () => {
    const [history, record] = await Promise.all([
      journeysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id),
      role
        ? beneficiariesClient.getBeneficiaryRecordForRole(role, projectId, beneficiary.id)
        : null,
    ])
    const nextJourney = mapBeneficiaryJourneyHistory(history)
    setJourney(nextJourney)
    if (record) setSummary({ progress: record.progress, enrollmentStatus: record.enrollmentStatus })
  }

  // Every read is scoped to one project, so the filter switches the page after an enrollment probe.
  const openHistoryForProject = async (nextProjectId: string) => {
    if (nextProjectId === projectId || !role) return
    try {
      await beneficiariesClient.getBeneficiaryRecordForRole(role, nextProjectId, beneficiary.id)
    } catch (error) {
      toast.error(
        error instanceof PathwaysClientError && error.code === 'not_found'
          ? 'This person is not enrolled in that project.'
          : error instanceof Error
            ? error.message
            : 'The project history could not be opened.',
      )
      return
    }
    const params = new URLSearchParams(searchParams?.toString())
    params.set('projectId', nextProjectId)
    params.set('tab', 'participation')
    router.push(`/beneficiaries/${encodeURIComponent(beneficiary.id)}?${params}`)
  }

  const transitionJourney = async () => {
    if (!journeyDraft.description.trim() || !journeyDraft.eventDate) {
      toast.error('Enter a date and description.')
      return
    }
    if (journeyDraft.eventType === 'TRANSFER' && !journeyDraft.destinationProjectId) {
      toast.error('Select a destination project with an active enrollment.')
      return
    }
    setSavingJourney(true)
    try {
      const input: EnrollmentJourneyEventInput = {
        eventType: journeyDraft.eventType,
        eventDate: journeyDraft.eventDate,
        description: journeyDraft.description.trim(),
        ...(journeyDraft.note.trim() ? { note: journeyDraft.note.trim() } : {}),
        ...(journeyDraft.stageId ? { stageId: journeyDraft.stageId } : {}),
        ...(journeyDraft.eventType === 'TRANSFER'
          ? { destinationProjectId: journeyDraft.destinationProjectId }
          : {}),
      }
      await journeysClient.transitionBeneficiaryJourney(projectId, beneficiary.id, input)
      await refreshJourneyHistory()
      setJourneyOpen(false)
      toast.success('Enrollment status updated and reloaded from the project history.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Enrollment status could not be updated.',
      )
    } finally {
      setSavingJourney(false)
    }
  }

  const correctJourneyNote = async () => {
    if (!noteDraft.eventId) {
      toast.error('Select an entry to correct.')
      return
    }
    if (!noteDraft.description.trim() || !noteDraft.reason.trim() || !noteDraft.eventDate) {
      toast.error('Enter a note and a reason for the correction.')
      return
    }
    setSavingNote(true)
    try {
      const input: CorrectJourneyEventInput = {
        eventDate: noteDraft.eventDate,
        description: noteDraft.description.trim(),
        reason: noteDraft.reason.trim(),
        ...(noteDraft.note.trim() ? { note: noteDraft.note.trim() } : {}),
        ...(selectedStage ? { stageId: selectedStage.id } : {}),
      }
      await journeysClient.correctBeneficiaryJourneyEvent(
        projectId,
        beneficiary.id,
        noteDraft.eventId,
        input,
      )
      await refreshJourneyHistory()
      setNoteOpen(false)
      toast.success('Correction saved and reloaded from the project history.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The correction could not be saved.')
    } finally {
      setSavingNote(false)
    }
  }

  return {
    ...view,
    beneficiary,
    projects,
    activities,
    stages,
    projectId,
    participation,
    participationHistory,
    openHistoryForProject,
    enrollmentStatus,
    canEditBeneficiary,
    canViewMedia,
    canUploadMedia,
    canViewAssessmentDetail,
    canRecordAssessment,
    refreshAssessments,
    canTransitionJourney,
    canCorrectJourney,
    canRecordParticipation,
    profileOpen,
    setProfileOpen,
    assessmentOpen,
    setAssessmentOpen,
    participationOpen,
    setParticipationOpen,
    participationDraft,
    setParticipationDraft,
    savingParticipation,
    journeyOpen,
    setJourneyOpen,
    journeyDraft,
    setJourneyDraft,
    savingJourney,
    noteOpen,
    setNoteOpen,
    noteDraft,
    setNoteDraft,
    savingNote,
    selectedStage,
    setSelectedStage,
    openParticipationForSelectedStage,
    openJourneyTransition,
    openNoteForSelectedStage,
    chooseCorrectionTarget,
    recordParticipation,
    transitionJourney,
    correctJourneyNote,
  }
}

export type BeneficiaryDetailState = ReturnType<typeof useBeneficiaryDetail>
