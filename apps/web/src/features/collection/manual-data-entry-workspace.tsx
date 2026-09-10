'use client'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { duplicateEntry, saveEntry, validateEntry } from '@/lib/demo-state/collection'
import { type DemoEntry, currentAccount, visibleDemoProjects } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { useState } from 'react'

const blank: Omit<DemoEntry, 'id'> = {
  projectId: '',
  formId: '',
  beneficiaryId: '',
  activityId: '',
  date: '',
  values: {},
  status: 'Draft',
  source: 'Manual',
  dataType: 'activity',
}
export function ManualDataEntryWorkspace() {
  const state = useDemoState()
  const actor = currentAccount(state)
  const [draft, setDraft] = useState(blank)
  const [id, setId] = useState<string>()
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [details, setDetails] = useState(false)
  const form = state.forms.find((f) => f.id === draft.formId)
  const activity = state.activities.find((a) => a.id === draft.activityId)
  const save = (submit: boolean) => {
    const input = {
      ...draft,
      status: submit ? ('Submitted' as const) : ('Draft' as const),
      values: { ...draft.values, beneficiary_id: draft.beneficiaryId, activity_date: draft.date },
    }
    const issues = submit ? validateEntry(state, input) : []
    setErrors(issues)
    if (issues.length) return
    const duplicate = submit && duplicateEntry(state, input, id)
    if (
      duplicate &&
      !window.confirm(
        'A participant record exists for this activity and date. Confirm another record? Cancel to revise.',
      )
    )
      return
    try {
      const entry = saveEntry(input, id, duplicate)
      setId(submit ? undefined : entry.id)
      setMessage(
        submit
          ? `Record ${entry.id} submitted. Project, journey, indicators, and audit updated.`
          : `Draft ${entry.id} saved without validation. Resume after refresh.`,
      )
      if (submit) setDraft(blank)
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
        <div className="flex flex-wrap gap-2">
          {state.entries
            .filter((e) => e.status === 'Draft' && e.ownerId === actor?.id)
            .map((e) => (
              <Button
                key={e.id}
                variant="outline"
                onClick={() => {
                  setId(e.id)
                  setDraft(e)
                  setErrors([])
                }}
              >
                Resume {e.id}
              </Button>
            ))}
        </div>
      </SectionCard>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Data entry">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save(true)
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
                  setId(undefined)
                }}
              >
                <option value="">Select project</option>
                {visibleDemoProjects(state).map((p) => (
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
                  setDraft({ ...draft, dataType: e.target.value as DemoEntry['dataType'] })
                }
              >
                <option value="project">Project record</option>
                <option value="activity">Activity record</option>
                <option value="participant">Participant record</option>
              </select>
            </label>
            <label className="block">
              Published form (optional)
              <select
                className="block w-full rounded border p-2"
                value={draft.formId}
                onChange={(e) => setDraft({ ...draft, formId: e.target.value })}
              >
                <option value="">Standard project data fields</option>
                {state.forms
                  .filter((f) => f.projectId === draft.projectId && f.status === 'Published')
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title}
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
                    {state.activities
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
                    {state.beneficiaries
                      .filter((b) => b.projectIds.includes(draft.projectId))
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} · {b.displayName}
                        </option>
                      ))}
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
                  ].includes(f.code ?? f.id),
              )
              .map((f) => (
                <label className="block" htmlFor={`entry-field-${f.id}`} key={f.id}>
                  {f.label}
                  {f.required ? ' *' : ''}
                  {f.type === 'single_select' ? (
                    <select
                      id={`entry-field-${f.id}`}
                      className="block w-full rounded border p-2"
                      value={draft.values[f.code ?? f.id] ?? ''}
                      onChange={(e) => valueField(f.code ?? f.id, e.target.value)}
                    >
                      <option value="">Choose</option>
                      {f.options.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`entry-field-${f.id}`}
                      type={f.type === 'number' || f.type === 'date' ? f.type : 'text'}
                      value={draft.values[f.code ?? f.id] ?? ''}
                      onChange={(e) => valueField(f.code ?? f.id, e.target.value)}
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
              <Button type="button" variant="outline" onClick={() => save(false)}>
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
              Saving produces an audit event. Only the System Administrator can review the
              global audit ledger.
            </p>
          </SectionCard>
        </aside>
      </div>
    </div>
  )
}
