'use client'

import { ArrowLeft, ClipboardCheck, FileText, MessageSquarePlus, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ProgressBar } from '@/components/pathways/progress-bar'
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
import type {
  Activity,
  BeneficiaryAssessmentRecord,
  BeneficiaryEnrollmentStatus,
  BeneficiaryMediaProofRecord,
  BeneficiaryNoteRecord,
  BeneficiaryParticipationRecord,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
} from '@/types/pathways'

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

type BeneficiaryDetailProps = {
  beneficiary: BeneficiaryRecord
  projects: ProjectSummary[]
  activities: Activity[]
  stages: JourneyStageConfig[]
  mediaProof: BeneficiaryMediaProofRecord[]
}

export const BeneficiaryDetail = ({
  beneficiary,
  projects,
  activities,
  stages,
  mediaProof,
}: BeneficiaryDetailProps) => {
  const [participation, setParticipation] = useState(beneficiary.participation)
  const [notes, setNotes] = useState(beneficiary.notes)
  const [enrollmentStatus, setEnrollmentStatus] = useState(beneficiary.enrollmentStatus)
  const [noteOpen, setNoteOpen] = useState(false)
  const [assessmentOpen, setAssessmentOpen] = useState(false)
  const [participationOpen, setParticipationOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [selectedAssessment, setSelectedAssessment] = useState<BeneficiaryAssessmentRecord | null>(
    beneficiary.assessments[0] ?? null,
  )
  const [noteDraft, setNoteDraft] = useState({
    stageId: stages[0]?.id ?? '',
    visibility: 'Project team',
    note: '',
  })
  const [participationDraft, setParticipationDraft] = useState({
    activityId: activities[0]?.id ?? '',
    participatedAt: new Date().toISOString().slice(0, 10),
    attendanceStatus: 'Present',
    note: '',
  })
  const [nextStatus, setNextStatus] = useState<BeneficiaryEnrollmentStatus>(enrollmentStatus)

  const currentStage = useMemo(
    () => deriveCurrentStage(participation, stages, activities),
    [activities, participation, stages],
  )
  const progress = useMemo(
    () => progressionRate(participation, stages, activities),
    [activities, participation, stages],
  )

  const latestEnrollment = beneficiary.enrollments.find((enrollment) =>
    beneficiary.projectIds.includes(enrollment.projectId),
  )

  const addNote = () => {
    if (!noteDraft.note.trim()) {
      toast.error('Add a note before saving.')
      return
    }

    // TODO(BACKEND): Save participation and assessment records.
    const note: BeneficiaryNoteRecord = {
      id: `note-prototype-${Date.now().toString(36)}`,
      beneficiaryId: beneficiary.id,
      projectId: beneficiary.projectIds[0],
      stageId: noteDraft.stageId,
      author: 'Prototype user',
      createdAt: new Date().toISOString().slice(0, 10),
      visibility: noteDraft.visibility as BeneficiaryNoteRecord['visibility'],
      note: noteDraft.note,
    }
    setNotes((current) => [note, ...current])
    setNoteDraft((current) => ({ ...current, note: '' }))
    setNoteOpen(false)
    toast.success('Note added locally.', {
      description: 'This is a prototype-only beneficiary note.',
    })
  }

  const recordParticipation = () => {
    if (!participationDraft.activityId || !participationDraft.participatedAt) {
      toast.error('Select an activity and date.')
      return
    }

    // TODO(BACKEND): Save participation and assessment records.
    const activity = activities.find((item) => item.id === participationDraft.activityId)
    const record: BeneficiaryParticipationRecord = {
      id: `part-prototype-${Date.now().toString(36)}`,
      beneficiaryId: beneficiary.id,
      projectId: activity?.projectId ?? beneficiary.projectIds[0],
      activityId: participationDraft.activityId,
      participatedAt: participationDraft.participatedAt,
      attendanceStatus:
        participationDraft.attendanceStatus as BeneficiaryParticipationRecord['attendanceStatus'],
      note: participationDraft.note || 'Prototype participation recorded.',
    }
    setParticipation((current) => [...current, record])
    setParticipationOpen(false)
    toast.success('Participation recorded locally.', {
      description: 'Current journey stage was recalculated from the activity mapping.',
    })
  }

  const updateStatus = () => {
    setEnrollmentStatus(nextStatus)
    setStatusOpen(false)
    toast.success('Enrollment status updated in prototype.', {
      description: 'This transition is visible only in the current UI session.',
    })
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-start lg:justify-between">
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
          <Button asChild variant="outline">
            <Link href="/beneficiaries">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Directory
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setStatusOpen(true)}>
            <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Update status
          </Button>
          <Button variant="outline" onClick={() => setNoteOpen(true)}>
            <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add note
          </Button>
          <Button onClick={() => setParticipationOpen(true)}>
            <ClipboardCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Record participation
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Profile summary</h2>
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
          <div className="rounded-lg border border-border bg-background p-4">
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

        <main className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Journey timeline</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Current stage is computed from beneficiary participation, activity records, and
                  activity-to-stage mappings.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="text-muted-foreground">Current computed stage</p>
                <p className="mt-1 font-semibold text-foreground">
                  {currentStage?.code} · {currentStage?.name}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <ProgressBar label="Journey progression" value={progress} tone="success" />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {stages
                .slice()
                .sort((first, second) => first.order - second.order)
                .map((stage) => {
                  const reached = participation.some(
                    (record) =>
                      stageForActivity(record.activityId, stages, activities)?.id === stage.id,
                  )
                  const active = currentStage?.id === stage.id

                  return (
                    <div
                      key={stage.id}
                      className={`rounded-lg border p-4 ${
                        active
                          ? 'border-primary bg-primary/10'
                          : reached
                            ? 'border-success/30 bg-success/10'
                            : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{stage.code}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{stage.name}</p>
                        </div>
                        <StatusBadge tone={stageTypeTone(stage.type)}>{stage.type}</StatusBadge>
                      </div>
                    </div>
                  )
                })}
            </div>
            <p className="mt-4 rounded-lg border border-info/20 bg-info/10 p-3 text-sm leading-6 text-info">
              Follow-up stages are open-ended and reviewed by people; they are not strict timeline
              compliance gates.
            </p>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">Assessments</h2>
                {beneficiary.assessments.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      setSelectedAssessment(beneficiary.assessments[0] ?? null)
                      setAssessmentOpen(true)
                    }}
                  >
                    <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                    View assessment
                  </Button>
                ) : (
                  <StatusBadge tone="neutral">No assessment available</StatusBadge>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {beneficiary.assessments.length > 0 ? (
                  beneficiary.assessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-muted/60"
                      type="button"
                      onClick={() => {
                        setSelectedAssessment(assessment)
                        setAssessmentOpen(true)
                      }}
                    >
                      <p className="font-medium text-foreground">{assessment.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {assessment.score}% · {formatDate(assessment.assessedAt)}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                    No assessment records are available for this sample profile.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Follow-up status</h2>
              <div className="mt-4 rounded-lg border border-border bg-background p-4">
                <p className="font-medium text-foreground">
                  {latestEnrollment?.followUpStatus ?? 'Not due'}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Follow-up status is reviewed with participation history and notes. It is displayed
                  here for review and does not change shared records.
                </p>
              </div>
            </section>
          </div>

          <BeneficiaryMediaProof
            activities={activities}
            beneficiaryId={beneficiary.id}
            mediaProof={mediaProof}
            projectIds={beneficiary.projectIds}
            projects={projects}
          />

          <section className="grid gap-6 xl:grid-cols-2">
            <RecordList
              activities={activities}
              participation={participation}
              stages={stages}
              title="Participation history"
            />
            <NoteList notes={notes} stages={stages} />
          </section>
        </main>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add beneficiary note</DialogTitle>
            <DialogDescription>
              Notes remain in this browser for the current demonstration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select
              value={noteDraft.stageId}
              onValueChange={(value) => setNoteDraft((current) => ({ ...current, stageId: value }))}
            >
              <SelectTrigger aria-label="Journey stage context">
                <SelectValue placeholder="Stage context" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.code} · {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <textarea
              aria-label="Beneficiary note"
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Note"
              value={noteDraft.note}
              onChange={(event) =>
                setNoteDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
            <Select
              value={noteDraft.visibility}
              onValueChange={(value) =>
                setNoteDraft((current) => ({ ...current, visibility: value }))
              }
            >
              <SelectTrigger aria-label="Note visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Project team">Project team</SelectItem>
                <SelectItem value="Internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addNote} type="button">
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assessmentOpen} onOpenChange={setAssessmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAssessment?.title ?? 'Assessment record'}</DialogTitle>
            <DialogDescription>
              Human-reviewed assessment basis for the prototype.
            </DialogDescription>
          </DialogHeader>
          {selectedAssessment ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {selectedAssessment.score}%
                </p>
              </div>
              <SummaryRow label="Source" value={selectedAssessment.source} />
              <SummaryRow label="Reviewed date" value={formatDate(selectedAssessment.assessedAt)} />
              <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6">
                {selectedAssessment.note}
              </p>
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
              Activity selection updates the journey stage shown in this demonstration.
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
                {activities.map((activity) => (
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
            <textarea
              aria-label="Participation notes"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Participation notes"
              value={participationDraft.note}
              onChange={(event) =>
                setParticipationDraft((current) => ({ ...current, note: event.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setParticipationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={recordParticipation} type="button">
              Save participation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update enrollment status</DialogTitle>
            <DialogDescription>
              Status changes remain in this browser for the current demonstration.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={nextStatus}
            onValueChange={(value) => setNextStatus(value as BeneficiaryEnrollmentStatus)}
          >
            <SelectTrigger aria-label="Enrollment status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending Review">Pending Review</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Exited">Exited</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateStatus} type="button">
              Apply status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const SummaryRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-lg border border-border bg-background p-3">
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
  activities: Activity[]
  participation: BeneficiaryParticipationRecord[]
  stages: JourneyStageConfig[]
  title: string
}) => (
  <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
              <div key={record.id} className="rounded-lg border border-border bg-background p-4">
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
        <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          No participation history in this coded mock profile.
        </p>
      )}
    </div>
  </section>
)

const NoteList = ({
  notes,
  stages,
}: { notes: BeneficiaryNoteRecord[]; stages: JourneyStageConfig[] }) => (
  <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
    <h2 className="text-lg font-semibold text-foreground">Notes</h2>
    <div className="mt-4 space-y-3">
      {notes.length > 0 ? (
        notes.map((note) => {
          const stage = stages.find((item) => item.id === note.stageId)

          return (
            <div key={note.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{note.visibility}</StatusBadge>
                {stage ? (
                  <StatusBadge tone={stageTypeTone(stage.type)}>{stage.code}</StatusBadge>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground">{note.note}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {note.author} · {formatDate(note.createdAt)}
              </p>
            </div>
          )
        })
      ) : (
        <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
          No notes have been added for this mock profile.
        </p>
      )}
    </div>
  </section>
)
