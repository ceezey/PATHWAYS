'use client'

import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  MessageSquarePlus,
  Pencil,
  UserCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { UNFINISHED_CONTROLS_UI_ENABLED } from '@/constants/feature-flags'
import { useCurrentRole } from '@/hooks/use-current-role'
import { isUiActionAvailable } from '@/lib/rbac/ui-action-availability'
import { type AssessmentDetail, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  ActivitySummary,
  BeneficiaryAssessmentRecord,
  BeneficiaryNoteRecord,
  BeneficiaryParticipationRecord,
  BeneficiaryRecord,
  CorrectJourneyEventInput,
  DigitalFormDefinition,
  EnrollmentJourneyEventInput,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

import { mapBeneficiaryJourneyHistory } from './beneficiary-journey-adapter'
import { BeneficiaryMediaProof } from './beneficiary-media-proof'

import {
  deriveCurrentStage,
  enrollmentTone,
  formatDate,
  progressionRate,
  projectTitle,
  stageForActivity,
  stageTypeTone,
} from './beneficiary-utils'

const assessmentTypeLabel: Record<AssessmentDetail['type'], string> = {
  PRE_TEST: 'Pre-test',
  POST_TEST: 'Post-test',
  OUTCOME_SURVEY: 'Outcome survey',
  FEEDBACK_SURVEY: 'Feedback survey',
  OTHER: 'Other',
}

const journeyEventTypeLabel: Record<EnrollmentJourneyEventInput['eventType'], string> = {
  COMPLETION: 'Complete enrollment',
  FOLLOW_UP: 'Record follow-up',
  DROPOUT: 'Mark as dropped out',
  TRANSFER: 'Transfer to another project',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

type BeneficiaryDetailProps = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: ActivitySummary[]
  stages: JourneyStageConfig[]
  participationForms: DigitalFormDefinition[]
  projectId: string
}

export const BeneficiaryDetail = ({
  beneficiary,
  projects,
  activities,
  stages,
  participationForms,
  projectId,
}: BeneficiaryDetailProps) => {
  const { role, profile } = useCurrentRole()
  const searchParams = useSearchParams()
  const [participation, setParticipation] = useState(beneficiary.participation)
  const [notes, setNotes] = useState(beneficiary.notes)
  const enrollmentStatus = beneficiary.enrollmentStatus
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [participationOpen, setParticipationOpen] = useState(false)
  const [savingParticipation, setSavingParticipation] = useState(false)
  const participationClientId = useRef<string | null>(null)
  const [selectedAssessment, setSelectedAssessment] = useState<BeneficiaryAssessmentRecord | null>(
    beneficiary.assessments[0] ?? null,
  )
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
    stageId: string
    destinationProjectId: string
  }>({
    eventType: 'FOLLOW_UP',
    eventDate: todayIso(),
    description: '',
    stageId: '',
    destinationProjectId: '',
  })
  const [noteOpen, setNoteOpen] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState({
    eventId: '',
    eventDate: todayIso(),
    description: '',
    reason: '',
  })
  const canEditBeneficiary = isUiActionAvailable(role, 'beneficiaries.edit', profile)
  const canViewAssessmentDetail = isUiActionAvailable(role, 'assessments.detail.view', profile)
  const canTransitionJourney = isUiActionAvailable(
    role,
    'beneficiaries.journey.transition',
    profile,
  )
  const canCorrectJourney = isUiActionAvailable(role, 'beneficiaries.journey.correct', profile)
  const [assessmentDetail, setAssessmentDetail] = useState<
    { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; detail: AssessmentDetail }
  >({ state: 'idle' })
  useEffect(() => {
    if (!assessmentOpen || !selectedAssessment || !canViewAssessmentDetail) return
    const controller = new AbortController()
    setAssessmentDetail({ state: 'loading' })
    pathwaysClient
      .getAssessmentDetail(selectedAssessment.projectId, selectedAssessment.id, controller.signal)
      .then((detail) => setAssessmentDetail({ state: 'ready', detail }))
      .catch(() => {
        if (!controller.signal.aborted) setAssessmentDetail({ state: 'error' })
      })
    return () => controller.abort()
  }, [assessmentOpen, selectedAssessment, canViewAssessmentDetail])
  const canRecordParticipation = isUiActionAvailable(
    role,
    'beneficiaries.participation.record',
    profile,
  )

  const currentStage = useMemo(
    () => deriveCurrentStage(participation, stages, activities),
    [activities, participation, stages],
  )
  const progress = useMemo(
    () => progressionRate(participation, stages, activities),
    [activities, participation, stages],
  )
  const orderedStages = useMemo(
    () => stages.slice().sort((first, second) => first.order - second.order),
    [stages],
  )
  const currentStageIndex = currentStage
    ? orderedStages.findIndex((stage) => stage.id === currentStage.id)
    : -1
  const stageDisplayCode = (stage: JourneyStageConfig) => {
    const index = orderedStages.findIndex((candidate) => candidate.id === stage.id)
    return index >= 0 ? `J${index + 1}` : stage.code
  }

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
  const selectedStageAssessments = selectedStage
    ? beneficiary.assessments.filter((assessment) => assessment.stageId === selectedStage.id)
    : []
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

  const openAssessmentForSelectedStage = () => {
    const assessment = selectedStageAssessments[0]
    if (!assessment) return
    setSelectedAssessment(assessment)
    setAssessmentOpen(true)
  }

  const openJourneyTransition = () => {
    if (!canTransitionJourney || enrollmentStatus !== 'Active') return
    setJourneyDraft({
      eventType: 'FOLLOW_UP',
      eventDate: todayIso(),
      description: '',
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
          attendance_status: participationDraft.attendanceStatus.toUpperCase(),
          progress_status: 'IN_PROGRESS',
          progress_notes: participationDraft.note.trim() || null,
        },
      )
      if (saved.status === 'DRAFT') {
        await pathwaysClient.submitDirectSubmission(projectId, form.id, saved.id, saved.updatedAt)
      }
      const history = await pathwaysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id)
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
    const history = await pathwaysClient.getBeneficiaryJourneyHistory(projectId, beneficiary.id)
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
        ...(journeyDraft.stageId ? { stageId: journeyDraft.stageId } : {}),
        ...(journeyDraft.eventType === 'TRANSFER'
          ? { destinationProjectId: journeyDraft.destinationProjectId }
          : {}),
      }
      await pathwaysClient.transitionBeneficiaryJourney(projectId, beneficiary.id, input)
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
        ...(selectedStage ? { stageId: selectedStage.id } : {}),
      }
      await pathwaysClient.correctBeneficiaryJourneyEvent(
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

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={enrollmentTone(enrollmentStatus)}>{enrollmentStatus}</StatusBadge>
            <StatusBadge tone="neutral">Derived current stage</StatusBadge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {beneficiary.displayName}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {beneficiary.code} · {beneficiary.sex} · {beneficiary.ageGroup} ·{' '}
              {beneficiary.disabilityStatus}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="icon" title="Back to Beneficiaries" variant="outline">
            <Link aria-label="Back to Beneficiaries" href={directoryHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          {canTransitionJourney ? (
            <Button
              aria-label="Update enrollment status"
              disabled={enrollmentStatus !== 'Active'}
              onClick={openJourneyTransition}
              size="icon"
              title={
                enrollmentStatus === 'Active'
                  ? 'Update enrollment status'
                  : 'Enrollment status changes require an active enrollment.'
              }
              type="button"
              variant="outline"
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Profile summary</h2>
            {canEditBeneficiary ? (
              <Button asChild size="icon" title="Edit beneficiary profile" variant="outline">
                <Link
                  aria-label="Edit beneficiary profile"
                  href={`/beneficiaries/${beneficiary.id}/edit?projectId=${encodeURIComponent(projectId)}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-3 text-sm">
            <SummaryRow label="Beneficiary code" value={beneficiary.code} />
            <SummaryRow
              label="Safe profile name"
              value={[beneficiary.firstName, beneficiary.middleName, beneficiary.lastName]
                .filter(Boolean)
                .join(' ')}
            />
            <SummaryRow label="Location" value={beneficiary.location} />
            <SummaryRow
              label="Consent"
              value={beneficiary.consentToStoreData ? 'Confirmed' : 'Pending'}
            />
            <SummaryRow
              label="Guardian consent"
              value={
                beneficiary.isMinor
                  ? beneficiary.guardianConsent
                    ? 'Confirmed'
                    : 'Pending'
                  : 'Not applicable'
              }
            />
          </div>
          <div className="rounded-sm border border-border bg-surface-subtle p-4">
            <p className="text-xs uppercase text-muted-foreground">Project enrollment</p>
            {beneficiary.enrollments.map((enrollment) => (
              <div key={enrollment.id} className="mt-3 space-y-2">
                <p className="font-medium text-foreground">
                  {projectTitle(enrollment.projectId, projects)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={enrollmentTone(enrollmentStatus)}>
                    {enrollmentStatus}
                  </StatusBadge>
                  <StatusBadge tone="neutral">{enrollment.followUpStatus}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enrolled {formatDate(enrollment.enrolledAt)}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          {beneficiary.sex === 'Prefer not to say' ||
          beneficiary.disabilityStatus === 'Not specified' ? (
            <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
              SADDD completeness warning: one or more sex, age, or disability dimensions are not
              disclosed for this profile.
            </div>
          ) : null}
          <section aria-labelledby="beneficiary-information-title" className="min-w-0 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Beneficiary record
              </p>
              <h2
                className="mt-1 text-xl font-semibold text-foreground"
                id="beneficiary-information-title"
              >
                Beneficiary Information
              </h2>
            </div>

            <Tabs className="min-w-0" defaultValue="journey">
              <TabsList
                className="flex w-full overflow-x-auto"
                aria-label="Beneficiary information"
              >
                <TabsTrigger value="journey">Journey tracking</TabsTrigger>
                {UNFINISHED_CONTROLS_UI_ENABLED ? (
                  <TabsTrigger value="media">Media proof</TabsTrigger>
                ) : null}
                <TabsTrigger value="participation">Participation history</TabsTrigger>
              </TabsList>

              <TabsContent value="journey">
                <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex flex-col gap-3 border-b border-border bg-surface-subtle p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Journey tracker</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Select a journey stage to show its details and actions below the tracker.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <StatusBadge tone="success">{progress}% progressed</StatusBadge>
                      <StatusBadge tone="neutral">
                        {currentStage ? stageDisplayCode(currentStage) : 'No stage'} ·{' '}
                        {currentStage?.name ?? 'Unmapped'}
                      </StatusBadge>
                    </div>
                  </div>

                  <div className="overflow-x-auto p-4 sm:p-5">
                    <ol
                      className="flex min-w-max items-start"
                      aria-label="Beneficiary journey stages"
                    >
                      {orderedStages.map((stage, index) => {
                        const reached = currentStageIndex >= 0 && index < currentStageIndex
                        const active = currentStage?.id === stage.id
                        const selected = selectedStage?.id === stage.id
                        const locked = currentStageIndex >= 0 && index > currentStageIndex
                        const detailId = `journey-stage-detail-${stage.id}`

                        return (
                          <li className="flex items-start" key={stage.id}>
                            <button
                              aria-controls={detailId}
                              aria-current={active ? 'step' : undefined}
                              aria-expanded={selected}
                              aria-label={`${stageDisplayCode(stage)} ${stage.name}: ${active ? 'Current stage' : reached ? 'Reached' : 'Locked'}${selected ? ', details shown' : ''}`}
                              className="group flex w-36 flex-col items-center rounded-md px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-40"
                              disabled={locked}
                              onClick={() => setSelectedStage(selected ? null : stage)}
                              type="button"
                            >
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : active
                                      ? 'border-primary bg-primary-subtle text-primary'
                                      : reached
                                        ? 'border-success bg-success-subtle text-success'
                                        : 'border-border bg-background text-muted-foreground'
                                }`}
                              >
                                {stageDisplayCode(stage)}
                              </span>
                              <span className="mt-2 max-w-32 text-sm font-medium leading-5 text-foreground">
                                {stage.name}
                              </span>
                              <span className="mt-1 text-xs text-muted-foreground">
                                {active ? 'Current stage' : reached ? 'Reached' : 'Locked'}
                              </span>
                            </button>
                            {index < orderedStages.length - 1 ? (
                              <span
                                aria-hidden="true"
                                className={`mt-7 h-0.5 w-8 shrink-0 sm:w-12 ${
                                  index < currentStageIndex ? 'bg-success' : 'bg-border'
                                }`}
                              />
                            ) : null}
                          </li>
                        )
                      })}
                    </ol>
                  </div>

                  {selectedStage ? (
                    <div
                      className="space-y-5 border-t border-border bg-background p-4 sm:p-5"
                      id={`journey-stage-detail-${selectedStage.id}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-foreground">
                              {stageDisplayCode(selectedStage)} · {selectedStage.name}
                            </h4>
                            <StatusBadge tone={stageTypeTone(selectedStage.type)}>
                              {selectedStage.type}
                            </StatusBadge>
                          </div>
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {selectedStage.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          {canRecordParticipation ? (
                            <Button
                              aria-label="Record participation"
                              disabled={selectedStageParticipationActivities.length === 0}
                              onClick={openParticipationForSelectedStage}
                              size="icon"
                              title="Record participation through the published activity-monitoring form"
                              type="button"
                            >
                              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          {canViewAssessmentDetail ? (
                            <Button
                              aria-label="View assessment"
                              disabled={selectedStageAssessments.length === 0}
                              onClick={openAssessmentForSelectedStage}
                              size="icon"
                              title="View assessment"
                              type="button"
                              variant="outline"
                            >
                              <FileText className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          {canCorrectJourney ? (
                            <Button
                              aria-label="Add note"
                              disabled={!correctableNote}
                              onClick={openNoteForSelectedStage}
                              size="icon"
                              title={
                                correctableNote
                                  ? 'Add a provenance-tracked note to the most recent journey record'
                                  : 'A recorded journey event is required before a note can be added.'
                              }
                              type="button"
                              variant="outline"
                            >
                              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <StageActivityList
                          activities={selectedStageActivities}
                          participation={participation}
                        />
                        <JourneyNoteList notes={selectedStageNotes} title="Journey notes" />
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="mt-4 rounded-lg border border-border bg-card p-5">
                  <h3 className="text-lg font-semibold text-foreground">Follow-up status</h3>
                  <div className="mt-3 rounded-sm border border-border bg-surface-subtle p-4">
                    <p className="font-medium text-foreground">
                      {latestEnrollment?.followUpStatus ?? 'Not due'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Reviewed with participation history and journey notes; it does not change
                      shared records from this view.
                    </p>
                  </div>
                </section>

                {unlinkedNotes.length > 0 ? (
                  <div className="mt-4">
                    <JourneyNoteList
                      description="Legacy notes without a verified journey-stage association are preserved here and are not assigned automatically."
                      notes={unlinkedNotes}
                      title="Unlinked notes"
                    />
                  </div>
                ) : null}
              </TabsContent>

              {UNFINISHED_CONTROLS_UI_ENABLED ? (
                <TabsContent value="media">
                  <BeneficiaryMediaProof
                    activities={activities}
                    beneficiaryId={beneficiary.id}
                    canManage={canEditBeneficiary}
                    mediaProof={[]}
                    projectIds={beneficiary.projectIds}
                    projects={projects}
                    unavailableReason="Beneficiary media remains unavailable until a server-backed upload and review lifecycle is approved."
                  />
                </TabsContent>
              ) : null}

              <TabsContent value="participation">
                <RecordList
                  activities={activities}
                  participation={participation}
                  stages={stages}
                  title="Participation history"
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>

      <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAssessment?.title ?? 'Assessment record'}</DialogTitle>
            <DialogDescription>Human-reviewed assessment basis.</DialogDescription>
          </DialogHeader>
          {selectedAssessment && assessmentDetail.state === 'loading' ? (
            <output className="block text-sm text-muted-foreground">
              Loading assessment detail.
            </output>
          ) : selectedAssessment && assessmentDetail.state === 'error' ? (
            <p className="text-sm text-destructive" role="alert">
              Assessment detail is unavailable for your current access.
            </p>
          ) : selectedAssessment && assessmentDetail.state === 'ready' ? (
            <div className="space-y-4">
              <div className="rounded-sm border border-border bg-surface-subtle p-4">
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {assessmentDetail.detail.score} / {assessmentDetail.detail.maximumScore}
                </p>
              </div>
              <SummaryRow
                label="Assessment type"
                value={assessmentTypeLabel[assessmentDetail.detail.type]}
              />
              <SummaryRow
                label="Assessment date"
                value={formatDate(assessmentDetail.detail.assessmentDate)}
              />
              {assessmentDetail.detail.beneficiary ? (
                <SummaryRow
                  label="Beneficiary code"
                  value={assessmentDetail.detail.beneficiary.code}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No assessment is available.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={participationOpen} onOpenChange={setParticipationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record participation</DialogTitle>
            <DialogDescription>
              Record an activity and attendance outcome for{' '}
              {selectedStage ? stageDisplayCode(selectedStage) : 'the selected'}
              {' journey stage'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={participationDraft.activityId}
              onValueChange={(value) =>
                setParticipationDraft((current) => ({ ...current, activityId: value }))
              }
            >
              <SelectTrigger aria-label="Participation activity">
                <SelectValue placeholder="Select activity" />
              </SelectTrigger>
              <SelectContent>
                {selectedStageParticipationActivities.map((activity) => (
                  <SelectItem key={activity.id} value={activity.id}>
                    {activity.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label className="space-y-2">
              <span>Date</span>
              <Input
                aria-label="Participation date"
                type="date"
                value={participationDraft.participatedAt}
                onChange={(event) =>
                  setParticipationDraft((current) => ({
                    ...current,
                    participatedAt: event.target.value,
                  }))
                }
              />
            </Label>
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="sr-only">Attendance status</legend>
              {['Present', 'Partial', 'Absent'].map((status) => (
                <Button
                  aria-pressed={participationDraft.attendanceStatus === status}
                  key={status}
                  type="button"
                  variant={participationDraft.attendanceStatus === status ? 'default' : 'outline'}
                  onClick={() =>
                    setParticipationDraft((current) => ({
                      ...current,
                      attendanceStatus: status,
                    }))
                  }
                >
                  {status}
                </Button>
              ))}
            </fieldset>
            <Textarea
              aria-label="Participation notes"
              placeholder="Participation notes"
              value={participationDraft.note}
              onChange={(event) =>
                setParticipationDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              disabled={savingParticipation}
              type="button"
              variant="outline"
              onClick={() => setParticipationOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={savingParticipation}
              onClick={() => void recordParticipation()}
              type="button"
            >
              {savingParticipation ? 'Saving...' : 'Save participation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={journeyOpen} onOpenChange={setJourneyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update enrollment status</DialogTitle>
            <DialogDescription>
              Record an enrollment journey event for {beneficiary.displayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={journeyDraft.eventType}
              onValueChange={(value) =>
                setJourneyDraft((current) => ({
                  ...current,
                  eventType: value as EnrollmentJourneyEventInput['eventType'],
                }))
              }
            >
              <SelectTrigger aria-label="Enrollment status">
                <SelectValue placeholder="Select an outcome" />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(journeyEventTypeLabel) as EnrollmentJourneyEventInput['eventType'][]
                ).map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>
                    {journeyEventTypeLabel[eventType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {journeyDraft.eventType === 'TRANSFER' ? (
              transferDestinationOptions.length > 0 ? (
                <Select
                  value={journeyDraft.destinationProjectId}
                  onValueChange={(value) =>
                    setJourneyDraft((current) => ({ ...current, destinationProjectId: value }))
                  }
                >
                  <SelectTrigger aria-label="Destination project">
                    <SelectValue placeholder="Select destination project" />
                  </SelectTrigger>
                  <SelectContent>
                    {transferDestinationOptions.map((enrollment) => (
                      <SelectItem key={enrollment.projectId} value={enrollment.projectId}>
                        {projectTitle(enrollment.projectId, projects)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No other active project enrollment is available for transfer.
                </p>
              )
            ) : null}
            <Label className="space-y-2">
              <span>Date</span>
              <Input
                aria-label="Enrollment status date"
                type="date"
                value={journeyDraft.eventDate}
                onChange={(event) =>
                  setJourneyDraft((current) => ({ ...current, eventDate: event.target.value }))
                }
              />
            </Label>
            <Textarea
              aria-label="Enrollment status description"
              placeholder="Describe the enrollment status change"
              value={journeyDraft.description}
              onChange={(event) =>
                setJourneyDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              disabled={savingJourney}
              type="button"
              variant="outline"
              onClick={() => setJourneyOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={savingJourney} onClick={() => void transitionJourney()} type="button">
              {savingJourney ? 'Saving...' : 'Save enrollment status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add note</DialogTitle>
            <DialogDescription>
              Add a provenance-tracked correction to the most recent journey record for{' '}
              {selectedStage ? stageDisplayCode(selectedStage) : 'the selected'}
              {' journey stage'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Label className="space-y-2">
              <span>Date</span>
              <Input
                aria-label="Note date"
                type="date"
                value={noteDraft.eventDate}
                onChange={(event) =>
                  setNoteDraft((current) => ({ ...current, eventDate: event.target.value }))
                }
              />
            </Label>
            <Textarea
              aria-label="Note text"
              placeholder="Journey note"
              value={noteDraft.description}
              onChange={(event) =>
                setNoteDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
            <Textarea
              aria-label="Correction reason"
              placeholder="Reason for this correction"
              value={noteDraft.reason}
              onChange={(event) =>
                setNoteDraft((current) => ({ ...current, reason: event.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button
              disabled={savingNote}
              type="button"
              variant="outline"
              onClick={() => setNoteOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={savingNote} onClick={() => void correctJourneyNote()} type="button">
              {savingNote ? 'Saving...' : 'Save note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const SummaryRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-sm border border-border bg-surface-subtle p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium text-foreground">{value || 'Not recorded'}</p>
  </div>
)

const RecordList = ({
  activities,
  participation,
  stages,
  title,
}: {
  activities: ActivitySummary[]
  participation: BeneficiaryParticipationRecord[]
  stages: JourneyStageConfig[]
  title: string
}) => (
  <section className="rounded-lg border border-border bg-card p-5">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div className="mt-4 space-y-3">
      {participation.length > 0 ? (
        participation
          .slice()
          .sort((first, second) => second.participatedAt.localeCompare(first.participatedAt))
          .map((record) => {
            const activity = activities.find((item) => item.id === record.activityId)
            const stage = stageForActivity(record.activityId, stages, activities)

            return (
              <div
                key={record.id}
                className="rounded-sm border border-border bg-surface-subtle p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {activity?.title ?? record.activityId}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(record.participatedAt)} · {record.attendanceStatus}
                    </p>
                  </div>
                  {stage ? (
                    <StatusBadge tone={stageTypeTone(stage.type)}>{stage.code}</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{record.note}</p>
              </div>
            )
          })
      ) : (
        <p className="rounded-sm border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
          No participation history is available for this coded profile.
        </p>
      )}
    </div>
  </section>
)

const StageActivityList = ({
  activities,
  participation,
}: {
  activities: ActivitySummary[]
  participation: BeneficiaryParticipationRecord[]
}) => (
  <section className="rounded-sm border border-border bg-card p-4">
    <h5 className="font-semibold text-foreground">Stage activities</h5>
    <div className="mt-3 space-y-2">
      {activities.length > 0 ? (
        activities.map((activity) => {
          const participationRecord = participation.find(
            (record) => record.activityId === activity.id,
          )

          return (
            <div
              className="rounded-sm border border-border bg-surface-subtle p-3"
              key={activity.id}
            >
              <p className="text-sm font-medium text-foreground">{activity.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {participationRecord
                  ? `${formatDate(participationRecord.participatedAt)} · ${participationRecord.attendanceStatus}`
                  : 'Not started'}
              </p>
            </div>
          )
        })
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          No activities are mapped to this journey stage.
        </p>
      )}
    </div>
  </section>
)

const JourneyNoteList = ({
  description,
  notes,
  title,
}: {
  description?: string
  notes: BeneficiaryNoteRecord[]
  title: string
}) => (
  <section className="rounded-sm border border-border bg-card p-4">
    <h5 className="font-semibold text-foreground">{title}</h5>
    {description ? (
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    ) : null}
    <div className="mt-3 space-y-2">
      {notes.length > 0 ? (
        notes.map((note) => (
          <div className="rounded-sm border border-border bg-surface-subtle p-3" key={note.id}>
            <StatusBadge tone="neutral">{note.visibility}</StatusBadge>
            <p className="mt-2 text-sm leading-6 text-foreground">{note.note}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {note.author} · {formatDate(note.createdAt)}
            </p>
          </div>
        ))
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          No notes have been added for this journey stage.
        </p>
      )}
    </div>
  </section>
)
