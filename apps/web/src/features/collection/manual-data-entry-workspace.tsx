'use client'

import { ArrowLeft, CheckCircle2, Save } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const storageKey = 'pathways.frontend.manual-entry-draft'

type EntryDraft = {
  projectId: string
  beneficiaryCode: string
  activityDate: string
  attendanceStatus: string
  preTestScore: string
  postTestScore: string
  note: string
}

const emptyDraft: EntryDraft = {
  projectId: 'futuremakers-ncr',
  beneficiaryCode: '',
  activityDate: '',
  attendanceStatus: '',
  preTestScore: '',
  postTestScore: '',
  note: '',
}

export const ManualDataEntryWorkspace = () => {
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return
    try {
      setDraft({ ...emptyDraft, ...(JSON.parse(stored) as Partial<EntryDraft>) })
      setMessage('Restored an unfinished browser-local draft.')
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [])

  const update = (field: keyof EntryDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setMessage('')
  }

  const saveDraft = () => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft))
    setMessage('Draft saved in this browser only. No project record was changed.')
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!draft.beneficiaryCode.trim()) nextErrors.beneficiaryCode = 'Beneficiary code is required.'
    if (!draft.activityDate) nextErrors.activityDate = 'Activity date is required.'
    if (!draft.attendanceStatus) nextErrors.attendanceStatus = 'Attendance status is required.'
    for (const field of ['preTestScore', 'postTestScore'] as const) {
      const value = Number(draft[field])
      if (draft[field] && (!Number.isFinite(value) || value < 0 || value > 100)) {
        nextErrors[field] = 'Enter a score from 0 to 100.'
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setMessage('Review the highlighted fields before continuing.')
      return
    }
    setMessage(
      'Validation passed. Submission remains unavailable until a project data service is connected.',
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Collection / Manual entry"
        title="Encode Project Data"
        description="Record one beneficiary participation result with a resumable local draft and field-level validation."
        actions={
          <Button asChild variant="outline">
            <Link href="/collection">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to Collection
            </Link>
          </Button>
        }
      />

      <div className="rounded-lg border border-warning/25 bg-warning-subtle px-4 py-3 text-sm leading-6 text-warning">
        Drafts stay in this browser. Validation does not create, update, or submit a PATHWAYS
        record.
      </div>

      <SectionCard
        title="Participation record"
        description="Required fields are marked. Scores remain optional when an assessment was not administered."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Project" htmlFor="entry-project" required>
            <Select value={draft.projectId} onValueChange={(value) => update('projectId', value)}>
              <SelectTrigger id="entry-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="futuremakers-ncr">FutureMakers NCR</SelectItem>
                <SelectItem value="youth-rise-western-samar">Youth RISE - Western Samar</SelectItem>
                <SelectItem value="safe-spaces-northern-samar">
                  Safe Spaces - Northern Samar
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Beneficiary code"
            htmlFor="beneficiary-code"
            required
            error={errors.beneficiaryCode}
          >
            <Input
              id="beneficiary-code"
              value={draft.beneficiaryCode}
              onChange={(event) => update('beneficiaryCode', event.target.value)}
              aria-invalid={Boolean(errors.beneficiaryCode)}
              aria-describedby={errors.beneficiaryCode ? 'beneficiary-code-error' : undefined}
            />
          </Field>
          <Field label="Activity date" htmlFor="activity-date" required error={errors.activityDate}>
            <Input
              id="activity-date"
              type="date"
              value={draft.activityDate}
              onChange={(event) => update('activityDate', event.target.value)}
              aria-invalid={Boolean(errors.activityDate)}
              aria-describedby={errors.activityDate ? 'activity-date-error' : undefined}
            />
          </Field>
          <Field
            label="Attendance status"
            htmlFor="attendance-status"
            required
            error={errors.attendanceStatus}
          >
            <Select
              value={draft.attendanceStatus}
              onValueChange={(value) => update('attendanceStatus', value)}
            >
              <SelectTrigger
                id="attendance-status"
                aria-invalid={Boolean(errors.attendanceStatus)}
                aria-describedby={errors.attendanceStatus ? 'attendance-status-error' : undefined}
              >
                <SelectValue placeholder="Select a status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Present">Present</SelectItem>
                <SelectItem value="Partial">Partial</SelectItem>
                <SelectItem value="Absent">Absent</SelectItem>
                <SelectItem value="Excused">Excused</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pre-test score" htmlFor="pre-test-score" error={errors.preTestScore}>
            <Input
              id="pre-test-score"
              inputMode="decimal"
              value={draft.preTestScore}
              onChange={(event) => update('preTestScore', event.target.value)}
              aria-invalid={Boolean(errors.preTestScore)}
              aria-describedby={errors.preTestScore ? 'pre-test-score-error' : undefined}
            />
          </Field>
          <Field label="Post-test score" htmlFor="post-test-score" error={errors.postTestScore}>
            <Input
              id="post-test-score"
              inputMode="decimal"
              value={draft.postTestScore}
              onChange={(event) => update('postTestScore', event.target.value)}
              aria-invalid={Boolean(errors.postTestScore)}
              aria-describedby={errors.postTestScore ? 'post-test-score-error' : undefined}
            />
          </Field>
          <Field label="Note" htmlFor="entry-note" className="md:col-span-2">
            <Textarea
              id="entry-note"
              rows={4}
              value={draft.note}
              onChange={(event) => update('note', event.target.value)}
            />
          </Field>
        </div>
        {message ? (
          <output className="mt-5 flex items-start gap-2 rounded-md border bg-muted px-4 py-3 text-sm leading-6">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{message}</span>
          </output>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={saveDraft}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save local draft
          </Button>
          <Button type="button" onClick={validate}>
            Validate entry
          </Button>
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        <StatusBadge tone="neutral">Draft-capable</StatusBadge>
        <StatusBadge tone="neutral">No server submission</StatusBadge>
        <StatusBadge tone="neutral">Synthetic project choices</StatusBadge>
      </div>
    </div>
  )
}

const Field = ({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  error?: string
  className?: string
  children: ReactNode
}) => (
  <div className={`space-y-2 ${className ?? ''}`}>
    <Label htmlFor={htmlFor}>
      {label}
      {required ? (
        <span className="ml-1 text-danger" aria-hidden="true">
          *
        </span>
      ) : null}
    </Label>
    {children}
    {error ? (
      <p id={`${htmlFor}-error`} className="text-sm text-danger">
        {error}
      </p>
    ) : null}
  </div>
)
