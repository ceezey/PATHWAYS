'use client'

import { Archive, ArrowLeft, History, Loader2, RotateCcw, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
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
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  BeneficiaryJourneyEvent,
  BeneficiaryJourneyHistory,
  BeneficiaryRecord,
  JourneyStageConfig,
  ProjectSummary,
  UpdateBeneficiaryInput,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

const sexCode = {
  Female: 'FEMALE',
  Male: 'MALE',
  Other: 'OTHER',
  'Prefer not to say': 'PREFER_NOT_TO_SAY',
  'Not specified': 'NOT_SPECIFIED',
} as const
const disabilityCode = {
  'With disability': 'WITH_DISABILITY',
  'Without disability': 'WITHOUT_DISABILITY',
  'Not specified': 'NOT_SPECIFIED',
} as const

export const BeneficiaryDetail = ({
  initial,
  projects,
  projectId,
  role,
}: {
  initial: BeneficiaryRecord
  projects: ProjectSummary[]
  projectId: string
  role: PathwaysRole
}) => {
  const router = useRouter()
  const [record, setRecord] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [journey, setJourney] = useState<BeneficiaryJourneyHistory | null>(null)
  const [journeyStages, setJourneyStages] = useState<JourneyStageConfig[]>([])
  const [journeyLoading, setJourneyLoading] = useState(true)
  const [journeyError, setJourneyError] = useState('')
  const [journeyEventType, setJourneyEventType] = useState<'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT'>(
    'FOLLOW_UP',
  )
  const [journeyEventOpen, setJourneyEventOpen] = useState(false)
  const [correctionEvent, setCorrectionEvent] = useState<BeneficiaryJourneyEvent | null>(null)
  const [draft, setDraft] = useState({
    subjectType: initial.subjectType === 'UNSPECIFIED_LEGACY' ? 'INDIVIDUAL' : initial.subjectType,
    displayName: initial.displayName,
    firstName: initial.firstName,
    middleName: initial.middleName ?? '',
    lastName: initial.lastName,
    sex: sexCode[initial.sex],
    birthDate: initial.birthDate ?? '',
    age: initial.age?.toString() ?? '',
    disabilityStatus: disabilityCode[initial.disabilityStatus],
    province: initial.province,
    city: initial.city,
    barangay: initial.barangay,
  })
  const currentProject = projects.find((project) => project.id === projectId)
  const canEdit = ['System Administrator', 'Monitoring and Evaluation Officer'].includes(role)
  const canArchive = ['System Administrator', 'Project Manager'].includes(role)
  const canManageJourney = [
    'System Administrator',
    'Project Manager',
    'Monitoring and Evaluation Officer',
  ].includes(role)
  const canCorrectJourney = [
    'System Administrator',
    'Project Manager',
    'Monitoring and Evaluation Officer',
    'Project Officer',
  ].includes(role)
  const refreshJourney = useCallback(async () => {
    setJourneyLoading(true)
    setJourneyError('')
    try {
      const [history, stages] = await Promise.all([
        pathwaysClient.getBeneficiaryJourneyHistory(projectId, record.id),
        pathwaysClient.getJourneyStages(projectId),
      ])
      setJourney(history)
      setJourneyStages(stages)
    } catch (cause) {
      setJourneyError(
        cause instanceof PathwaysClientError
          ? cause.message
          : 'Journey history could not be loaded.',
      )
    } finally {
      setJourneyLoading(false)
    }
  }, [projectId, record.id])

  useEffect(() => {
    void refreshJourney()
  }, [refreshJourney])

  const openJourneyEvent = (eventType: 'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT') => {
    setJourneyEventType(eventType)
    setJourneyEventOpen(true)
  }

  const update = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError('')
    const input: UpdateBeneficiaryInput = {
      subjectType: draft.subjectType as UpdateBeneficiaryInput['subjectType'],
      displayName: draft.displayName || undefined,
      firstName: draft.firstName || undefined,
      middleName: draft.middleName || undefined,
      lastName: draft.lastName || undefined,
      sex: draft.sex,
      birthDate: draft.birthDate || undefined,
      ageAtRegistration: draft.age ? Number(draft.age) : undefined,
      disabilityStatus: draft.disabilityStatus,
      locationProvince: draft.province || undefined,
      locationCityMunicipality: draft.city || undefined,
      locationBarangay: draft.barangay || undefined,
      expectedUpdatedAt: record.updatedAt,
    }
    try {
      const updated = await pathwaysClient.updateBeneficiary(projectId, record.id, input)
      setRecord(updated)
      setEditing(false)
      toast.success('Beneficiary profile updated.')
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError ? cause.message : 'Profile could not be updated.',
      )
    } finally {
      setSaving(false)
    }
  }
  const archive = async () => {
    setSaving(true)
    setError('')
    try {
      await pathwaysClient.archiveBeneficiary(projectId, record.id, record.updatedAt)
      toast.success('Beneficiary profile archived.')
      router.push('/beneficiaries')
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError ? cause.message : 'Profile could not be archived.',
      )
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex gap-2">
            <StatusBadge tone="success">{record.enrollmentStatus}</StatusBadge>
            <StatusBadge tone="neutral">{record.subjectType.replaceAll('_', ' ')}</StatusBadge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold">{record.displayName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {record.code} · {currentProject?.title ?? 'Authorized project'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/beneficiaries">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Directory
            </Link>
          </Button>
          {canEdit ? (
            <Button variant="outline" onClick={() => setEditing((value) => !value)}>
              Edit profile
            </Button>
          ) : null}
          {canArchive ? (
            <Button variant="destructive" disabled={saving} onClick={() => void archive()}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          ) : null}
        </div>
      </section>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {editing ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Edit shared profile</h2>
          <p className="text-sm text-muted-foreground">
            Saving is denied unless the actor has shared-profile authority for every active
            enrollment.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Subject type">
              <Select value={draft.subjectType} onValueChange={(v) => update('subjectType', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['INDIVIDUAL', 'GROUP', 'COMMUNITY'].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Display name">
              <Input
                value={draft.displayName}
                onChange={(e) => update('displayName', e.target.value)}
              />
            </Field>
            <Field label="First name">
              <Input
                value={draft.firstName}
                onChange={(e) => update('firstName', e.target.value)}
              />
            </Field>
            <Field label="Middle name">
              <Input
                value={draft.middleName}
                onChange={(e) => update('middleName', e.target.value)}
              />
            </Field>
            <Field label="Last name">
              <Input value={draft.lastName} onChange={(e) => update('lastName', e.target.value)} />
            </Field>
            <Field label="Birth date">
              <Input
                type="date"
                value={draft.birthDate}
                onChange={(e) => update('birthDate', e.target.value)}
              />
            </Field>
            <Field label="Age at registration">
              <Input
                type="number"
                min="0"
                max="130"
                value={draft.age}
                onChange={(e) => update('age', e.target.value)}
              />
            </Field>
            <Field label="Province">
              <Input value={draft.province} onChange={(e) => update('province', e.target.value)} />
            </Field>
            <Field label="City">
              <Input value={draft.city} onChange={(e) => update('city', e.target.value)} />
            </Field>
            <Field label="Barangay">
              <Input value={draft.barangay} onChange={(e) => update('barangay', e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void save()}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Profile and demographics</h2>
          <Row label="Display name" value={record.displayName} />
          {record.subjectType === 'INDIVIDUAL' ? (
            <>
              <Row label="First name" value={record.firstName || 'Not recorded'} />
              <Row label="Middle name" value={record.middleName ?? 'Not recorded'} />
              <Row label="Last name" value={record.lastName || 'Not recorded'} />
            </>
          ) : null}
          <Row label="Location" value={record.location} />
          <Row label="Sex" value={record.sex} />
          <Row label="Birth date" value={record.birthDate ?? 'Not recorded'} />
          <Row label="Age at registration" value={record.age?.toString() ?? 'Not recorded'} />
          <Row label="Disability" value={record.disabilityStatus} />
        </section>
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Consent and enrollment</h2>
          <Row
            label="Participation consent"
            value={record.consentToParticipate ? 'Recorded' : 'Not recorded'}
          />
          <Row
            label="Data-processing consent"
            value={record.consentToStoreData ? 'Recorded' : 'Not recorded'}
          />
          <Row
            label="Guardian consent"
            value={
              record.isMinor
                ? record.guardianConsent
                  ? 'Recorded'
                  : 'Not recorded'
                : 'Not applicable'
            }
          />
          <Row
            label="Enrollment date"
            value={record.enrollments[0]?.enrolledAt ?? 'Not recorded'}
          />
          {record.consentProvenance.map((entry) => (
            <p key={`${entry.kind}-${entry.recordedAt}`} className="text-xs text-muted-foreground">
              {entry.kind.replaceAll('_', ' ')} · {entry.source.replaceAll('_', ' ')} ·{' '}
              {new Date(entry.recordedAt).toLocaleString()}
            </p>
          ))}
        </section>
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Beneficiary journey history</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Persisted, chronological project events. Corrections are appended and never overwrite
              the original event.
            </p>
          </div>
          {canManageJourney && journey?.enrollmentStatus === 'ACTIVE' ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => openJourneyEvent('FOLLOW_UP')}>
                Add follow-up
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => openJourneyEvent('COMPLETION')}
              >
                Complete enrollment
              </Button>
              <Button type="button" variant="outline" onClick={() => openJourneyEvent('DROPOUT')}>
                Record dropout
              </Button>
            </div>
          ) : null}
        </div>
        {journeyLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading journey history...
          </p>
        ) : journeyError ? (
          <p role="alert" className="text-sm text-destructive">
            {journeyError}
          </p>
        ) : journey ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">Enrollment: {journey.enrollmentStatus}</StatusBadge>
              <StatusBadge tone="neutral">
                {journey.events.length} event{journey.events.length === 1 ? '' : 's'}
              </StatusBadge>
            </div>
            {journey.events.length === 0 ? (
              <p className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                No journey events have been recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {journey.events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {event.eventType.replaceAll('_', ' ')} · {event.eventDate}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.stageCodeSnapshot
                            ? `${event.stageCodeSnapshot} · ${event.stageNameSnapshot ?? ''}`
                            : 'No stage snapshot'}
                          {event.activityTitleSnapshot ? ` · ${event.activityTitleSnapshot}` : ''}
                        </p>
                        {event.participation ? (
                          <p className="mt-1 text-sm text-muted-foreground">
                            Attendance: {event.participation.attendanceStatus} · Progress:{' '}
                            {event.participation.progressStatus}
                          </p>
                        ) : null}
                        {event.description ? (
                          <p className="mt-2 text-sm">{event.description}</p>
                        ) : null}
                        {event.correctsEventId ? (
                          <p className="mt-2 text-xs font-medium text-warning">
                            Correction of {event.correctsEventId} · {event.correctionReason}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          Recorded by {event.recordedBy} ·{' '}
                          {new Date(event.recordedAt).toLocaleString()}
                        </p>
                      </div>
                      {canCorrectJourney && !event.correctsEventId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => setCorrectionEvent(event)}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Correct event
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
      </section>
      <JourneyEventDialog
        beneficiaryId={record.id}
        eventType={journeyEventType}
        journeyStages={journeyStages}
        onOpenChange={setJourneyEventOpen}
        onSaved={refreshJourney}
        open={journeyEventOpen}
        projectId={projectId}
      />
      <JourneyCorrectionDialog
        beneficiaryId={record.id}
        event={correctionEvent}
        journeyStages={journeyStages}
        onOpenChange={(open) => {
          if (!open) setCorrectionEvent(null)
        }}
        onSaved={refreshJourney}
        open={Boolean(correctionEvent)}
        projectId={projectId}
      />
    </div>
  )
}

const JourneyEventDialog = ({
  beneficiaryId,
  eventType,
  journeyStages,
  onOpenChange,
  onSaved,
  open,
  projectId,
}: {
  beneficiaryId: string
  eventType: 'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT'
  journeyStages: JourneyStageConfig[]
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
  open: boolean
  projectId: string
}) => {
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [stageId, setStageId] = useState('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEventDate(new Date().toISOString().slice(0, 10))
    setDescription('')
    setStageId('none')
    setError('')
  }, [open])

  const save = async () => {
    if (!eventDate || !description.trim()) {
      setError('Event date and description are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await pathwaysClient.transitionBeneficiaryJourney(projectId, beneficiaryId, {
        eventType,
        eventDate,
        description: description.trim(),
        stageId: stageId === 'none' ? undefined : stageId,
      })
      await onSaved()
      toast.success(`${eventType.replaceAll('_', ' ')} event recorded.`)
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError
          ? cause.message
          : 'Journey event could not be recorded.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{eventType.replaceAll('_', ' ')}</DialogTitle>
          <DialogDescription>
            FOLLOW UP keeps the enrollment active. Completion or dropout closes the source
            enrollment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-2">
            <span>Event date</span>
            <Input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            <span>Journey stage</span>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No stage</SelectItem>
                {journeyStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.code} · {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-2">
            <span>Description</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Record event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const JourneyCorrectionDialog = ({
  beneficiaryId,
  event,
  journeyStages,
  onOpenChange,
  onSaved,
  open,
  projectId,
}: {
  beneficiaryId: string
  event: BeneficiaryJourneyEvent | null
  journeyStages: JourneyStageConfig[]
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
  open: boolean
  projectId: string
}) => {
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [stageId, setStageId] = useState('none')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !event) return
    setEventDate(event.eventDate)
    setDescription(event.description ?? '')
    setReason('')
    setStageId(event.stageId ?? 'none')
    setError('')
  }, [event, open])

  const save = async () => {
    if (!event || !eventDate || !description.trim() || !reason.trim()) {
      setError('Date, corrected description, and correction reason are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await pathwaysClient.correctBeneficiaryJourneyEvent(projectId, beneficiaryId, event.id, {
        eventDate,
        description: description.trim(),
        reason: reason.trim(),
        stageId: stageId === 'none' ? undefined : stageId,
      })
      await onSaved()
      toast.success('Journey correction appended.')
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof PathwaysClientError
          ? cause.message
          : 'Journey correction could not be saved.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Append journey correction</DialogTitle>
          <DialogDescription>
            The original event remains unchanged. This creates a linked correction event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-2">
            <span>Corrected event date</span>
            <Input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            <span>Journey stage</span>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No stage</SelectItem>
                {journeyStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.code} · {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-2">
            <span>Corrected description</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Label>
          <Label className="space-y-2">
            <span>Correction reason</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Label>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving...' : 'Append correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <span className="text-sm font-medium">{label}</span>
    {children}
  </div>
)
const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border bg-background p-3">
    <p className="text-xs uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 font-medium">{value}</p>
  </div>
)
