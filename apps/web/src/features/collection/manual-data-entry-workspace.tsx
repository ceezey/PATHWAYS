'use client'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentRole } from '@/hooks/use-current-role'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  DigitalFormDefinition,
  DirectFormSubmission,
  DirectFormSubmissionPage,
  ProjectSummary,
} from '@/types/pathways'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type EntryDraft = {
  projectId: string
  formId: string
  beneficiaryId: string
  activityId: string
  date: string
  values: Record<string, string>
  dataType: 'project' | 'activity' | 'participant'
}

const blank: EntryDraft = {
  projectId: '',
  formId: '',
  beneficiaryId: '',
  activityId: '',
  date: '',
  values: {},
  dataType: 'activity',
}
export function ManualDataEntryWorkspace() {
  const pageSize = 5
  const { role } = useCurrentRole()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [forms, setForms] = useState<DigitalFormDefinition[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [draft, setDraft] = useState(blank)
  const [submission, setSubmission] = useState<DirectFormSubmission | null>(null)
  const [clientSubmissionId, setClientSubmissionId] = useState(() => crypto.randomUUID())
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState(false)
  const [submissionPage, setSubmissionPage] = useState<DirectFormSubmissionPage | null>(null)
  const [submissionOffset, setSubmissionOffset] = useState(0)
  const [submissionListError, setSubmissionListError] = useState('')
  const [submissionListRevision, setSubmissionListRevision] = useState(0)
  const form = forms.find((row) => row.id === draft.formId)
  const activity = activities.find((row) => row.id === draft.activityId)

  useEffect(() => {
    if (!role) return
    let active = true
    pathwaysClient
      .getProjectsForRole(role)
      .then((records) => {
        if (active) setProjects(records)
      })
      .catch((error: unknown) => {
        if (active)
          setErrors([error instanceof Error ? error.message : 'Projects could not be loaded.'])
      })
    return () => {
      active = false
    }
  }, [role])

  useEffect(() => {
    if (!draft.projectId) {
      setForms([])
      setActivities([])
      return
    }
    let active = true
    Promise.all([
      pathwaysClient.getDigitalForms(draft.projectId),
      pathwaysClient.getActivities(draft.projectId),
    ])
      .then(([nextForms, nextActivities]) => {
        if (active) {
          setForms(nextForms)
          setActivities(nextActivities)
        }
      })
      .catch((error: unknown) => {
        if (active)
          setErrors([error instanceof Error ? error.message : 'Project forms could not be loaded.'])
      })
    return () => {
      active = false
    }
  }, [draft.projectId])

  useEffect(() => {
    void submissionListRevision
    if (!draft.projectId || !draft.formId) {
      setSubmissionPage(null)
      setSubmissionListError('')
      return
    }
    let active = true
    setSubmissionListError('')
    pathwaysClient
      .listDirectSubmissions(draft.projectId, draft.formId, submissionOffset, pageSize)
      .then((page) => {
        if (active) setSubmissionPage(page)
      })
      .catch((error: unknown) => {
        if (active) {
          setSubmissionPage(null)
          setSubmissionListError(
            error instanceof Error ? error.message : 'Saved records could not be loaded.',
          )
        }
      })
    return () => {
      active = false
    }
  }, [draft.formId, draft.projectId, submissionListRevision, submissionOffset])

  const save = async (submit: boolean) => {
    if (!form || form.status !== 'PUBLISHED') {
      setErrors(['Select a published server-backed form before saving.'])
      return
    }
    setErrors([])
    setMessage('')
    const allowed = new Set(form.fields.map((field) => field.code))
    const candidate = {
      ...draft.values,
      beneficiary_id: draft.beneficiaryId,
      activity_date: draft.date,
      activity_id: draft.activityId,
    }
    const values = Object.fromEntries(Object.entries(candidate).filter(([key]) => allowed.has(key)))
    try {
      const saved = submission
        ? await pathwaysClient.updateDirectSubmission(
            draft.projectId,
            form.id,
            submission.id,
            submission.updatedAt,
            values,
          )
        : await pathwaysClient.saveDirectSubmission(
            draft.projectId,
            form.id,
            clientSubmissionId,
            values,
          )
      setSubmission(saved)
      setSubmissionListRevision((current) => current + 1)
      if (submit) {
        const validation = await pathwaysClient.validateDirectSubmission(
          draft.projectId,
          form.id,
          saved.id,
        )
        if (!validation.valid) {
          setErrors(validation.errors.map((issue) => issue.message))
          setMessage('Draft saved; submission needs corrections.')
          return
        }
        const submitted = await pathwaysClient.submitDirectSubmission(
          draft.projectId,
          form.id,
          saved.id,
          saved.updatedAt,
        )
        setMessage(`Record ${submitted.id} submitted to the selected form.`)
        setSubmission(null)
        setClientSubmissionId(crypto.randomUUID())
        setDraft(blank)
      } else {
        setMessage(
          `Draft ${saved.id} saved to the server. Keep this page open to continue editing.`,
        )
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Record could not be saved.'])
    }
  }
  const valueField = (key: string, value: string) =>
    setDraft({ ...draft, values: { ...draft.values, [key]: value } })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Encode Project Data"
        description="Save partial drafts or submit validated project-linked records."
      />
      <SectionCard title="Resume your drafts">
        {!draft.projectId || !draft.formId ? (
          <p className="text-sm text-muted-foreground">
            Select a project and published form to load your persisted records.
          </p>
        ) : submissionListError ? (
          <p className="text-sm text-danger" role="alert">
            {submissionListError}
          </p>
        ) : submissionPage?.items.length ? (
          <div className="space-y-3">
            <ul className="divide-y rounded border">
              {submissionPage.items.map((item) => {
                const draftRecord = item.status === 'DRAFT'
                return (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                    key={item.id}
                  >
                    <div>
                      <p className="font-medium">
                        {draftRecord ? 'Draft' : `Finalized (${item.status.toLowerCase()})`}
                      </p>
                      <p className="text-muted-foreground">
                        Version {item.formVersion} · Updated{' '}
                        {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/collection/projects/${encodeURIComponent(draft.projectId)}/forms/${encodeURIComponent(draft.formId)}/entries/new?submissionId=${encodeURIComponent(item.id)}`}
                      >
                        {draftRecord ? 'Resume draft' : 'View record'}
                      </Link>
                    </Button>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                {submissionOffset + 1}–
                {Math.min(submissionOffset + submissionPage.items.length, submissionPage.total)} of{' '}
                {submissionPage.total}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={submissionOffset === 0}
                  size="sm"
                  variant="outline"
                  onClick={() => setSubmissionOffset(Math.max(0, submissionOffset - pageSize))}
                >
                  Previous
                </Button>
                <Button
                  disabled={submissionOffset + submissionPage.items.length >= submissionPage.total}
                  size="sm"
                  variant="outline"
                  onClick={() => setSubmissionOffset(submissionOffset + pageSize)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : submissionPage ? (
          <p className="text-sm text-muted-foreground">No persisted records for this form.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Loading persisted records…</p>
        )}
      </SectionCard>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Data entry">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void save(true)
            }}
            noValidate
          >
            <label className="block" htmlFor="entry-project">
              Project
              <select
                id="entry-project"
                className="block w-full rounded border p-2"
                value={draft.projectId}
                onChange={(e) => {
                  setDraft({ ...blank, projectId: e.target.value })
                  setSubmission(null)
                  setSubmissionOffset(0)
                  setClientSubmissionId(crypto.randomUUID())
                }}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Data type
              <select
                className="block w-full rounded border p-2"
                value={draft.dataType}
                onChange={(e) =>
                  setDraft({ ...draft, dataType: e.target.value as EntryDraft['dataType'] })
                }
              >
                <option value="project">Project record</option>
                <option value="activity">Activity record</option>
                <option value="participant">Participant record</option>
              </select>
            </label>
            <label className="block">
              Published form
              <select
                className="block w-full rounded border p-2"
                value={draft.formId}
                onChange={(e) => {
                  setDraft({ ...draft, formId: e.target.value })
                  setSubmission(null)
                  setSubmissionOffset(0)
                }}
              >
                <option value="">Select a published form</option>
                {forms
                  .filter((f) => f.projectId === draft.projectId && f.status === 'PUBLISHED')
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block" htmlFor="entry-date">
              Record date
              <Input
                id="entry-date"
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            {draft.dataType !== 'project' ? (
              <>
                <label className="block">
                  Activity
                  <select
                    className="block w-full rounded border p-2"
                    value={draft.activityId}
                    onChange={(e) => setDraft({ ...draft, activityId: e.target.value })}
                  >
                    <option value="">Select activity</option>
                    {activities
                      .filter((a) => a.projectId === draft.projectId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block">
                  Participant
                  <select
                    className="block w-full rounded border p-2"
                    value={draft.beneficiaryId}
                    onChange={(e) => setDraft({ ...draft, beneficiaryId: e.target.value })}
                  >
                    <option value="">Select participant</option>
                    <option value="" disabled>
                      Server-side beneficiary selection requires PIN verification
                    </option>
                  </select>
                </label>
                <label className="block">
                  Attendance
                  <select
                    className="block w-full rounded border p-2"
                    value={draft.values.attendance_status ?? ''}
                    onChange={(e) => valueField('attendance_status', e.target.value)}
                  >
                    <option value="">Select attendance</option>
                    {['Present', 'Partial', 'Absent'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {['pre_test_score', 'post_test_score'].map((key) => (
                  <label className="block" htmlFor={`entry-${key}`} key={key}>
                    {key === 'pre_test_score' ? 'Pre-assessment score' : 'Post-assessment score'}
                    <Input
                      id={`entry-${key}`}
                      type="number"
                      min="0"
                      max="100"
                      value={draft.values[key] ?? ''}
                      onChange={(e) => valueField(key, e.target.value)}
                    />
                  </label>
                ))}
              </>
            ) : null}
            <label className="block" htmlFor="entry-notes">
              Record notes
              <Input
                id="entry-notes"
                value={draft.values.note ?? ''}
                onChange={(e) => valueField('note', e.target.value)}
              />
            </label>
            {form?.fields
              .filter(
                (f) =>
                  ![
                    'beneficiary_id',
                    'activity_date',
                    'attendance_status',
                    'pre_test_score',
                    'post_test_score',
                  ].includes(f.code),
              )
              .map((f) => (
                <label className="block" htmlFor={`entry-field-${f.code}`} key={f.code}>
                  {f.label}
                  {f.required ? ' *' : ''}
                  {f.dataType === 'SELECT' ? (
                    <select
                      id={`entry-field-${f.code}`}
                      className="block w-full rounded border p-2"
                      value={draft.values[f.code] ?? ''}
                      onChange={(e) => valueField(f.code, e.target.value)}
                    >
                      <option value="">Choose</option>
                      {(f.allowedValues ?? []).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`entry-field-${f.code}`}
                      type={
                        f.dataType === 'INTEGER' || f.dataType === 'DECIMAL'
                          ? 'number'
                          : f.dataType === 'DATE'
                            ? 'date'
                            : 'text'
                      }
                      value={draft.values[f.code] ?? ''}
                      onChange={(e) => valueField(f.code, e.target.value)}
                    />
                  )}
                </label>
              ))}
            {errors.length ? (
              <div
                role="alert"
                className="rounded border border-danger/30 bg-danger-subtle p-3 text-danger"
              >
                <h3 className="font-semibold">Correct these fields</h3>
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <output>{message}</output>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={() => void save(false)}>
                Save as draft
              </Button>
              <Button type="submit">Submit record</Button>
            </div>
          </form>
        </SectionCard>
        <aside className="sticky top-24">
          <SectionCard title="Activity details">
            <Button variant="outline" onClick={() => setDetails(!details)}>
              {details ? 'Hide activity details' : 'View activity details'}
            </Button>
            {details ? (
              activity ? (
                <div className="mt-3">
                  <h3>{activity.title}</h3>
                  <p>{activity.description}</p>
                  <p>
                    {activity.startDate} – {activity.dueDate}
                  </p>
                  <p>{activity.progress}% complete</p>
                </div>
              ) : (
                <p>Select an activity to inspect it.</p>
              )
            ) : null}
            <p className="mt-3 text-sm">
              Records are sent only to the selected published form. Audit review is currently
              unavailable in this interface.
            </p>
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
