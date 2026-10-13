import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { useCurrentRole } from '@/hooks/use-current-role'
import { journeysClient } from '@/lib/api/journeys'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  ActivitySummary,
  BeneficiaryRecord,
  CorrectJourneyEventInput,
  DigitalFormDefinition,
  EnrollmentJourneyEventInput,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { mapBeneficiaryJourneyHistory } from '../profile.utils'

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
}

export const useBeneficiaryDetail = ({
  beneficiary,
  projects,
  activities,
  stages,
  participationForms,
  projectId,
  assessmentsUnavailable = false,
}: BeneficiaryDetailProps) => {
  const { role, profile } = useCurrentRole()
  const [participation, setParticipation] = useState(beneficiary.participation)
  const [notes, setNotes] = useState(beneficiary.notes)
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
    selectedStage,
    participationForms,
    projectId,
    assessmentsUnavailable,
  })
  const { selectedStageParticipationActivities, transferDestinationOptions, correctableNote } = view

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
    if (!canCorrectJourney || !correctableNote) return
    setNoteDraft({
      eventId: correctableNote.id,
      eventDate: todayIso(),
      description: correctableNote.note,
      note: correctableNote.journeyNote ?? '',
      reason: '',
    })
    setNoteOpen(true)
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
      const saved = await pathwaysClient.saveDirectSubmission(
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
        await pathwaysClient.submitDirectSubmission(projectId, form.id, saved.id, saved.updatedAt)
      }
      const history = await journeysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id)
      const nextJourney = mapBeneficiaryJourneyHistory(history)
      setParticipation(nextJourney.participation)
      setNotes(nextJourney.notes)
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
    const history = await journeysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id)
    const nextJourney = mapBeneficiaryJourneyHistory(history)
    setParticipation(nextJourney.participation)
    setNotes(nextJourney.notes)
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
      toast.error('Select a note to correct.')
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
      toast.success('Journey note added and reloaded from the project history.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The note could not be added.')
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
    enrollmentStatus,
    canEditBeneficiary,
    canViewMedia,
    canUploadMedia,
    canViewAssessmentDetail,
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
    recordParticipation,
    transitionJourney,
    correctJourneyNote,
  }
}

export type BeneficiaryDetailState = ReturnType<typeof useBeneficiaryDetail>
