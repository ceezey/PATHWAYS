'use client'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hasAction } from '@/lib/demo-state/permissions'
import {
  reuseIndicator,
  reviewExpense,
  saveExpense,
  saveIndicator,
} from '@/lib/demo-state/projects'
import { type DemoExpense, currentAccount, visibleDemoProjects } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import { useState } from 'react'
import { ProjectWorkspaceHeader } from './project-workspace-header'

const blankExpense = { activityId: '', amount: '', category: '', date: '', description: '' }
export function ConnectedBudgetWorkspace({ projectId }: { projectId: string }) {
  const state = useDemoState()
  const actor = currentAccount(state)
  const project = state.projects.find((p) => p.id === projectId)
  const budget = state.budgets.find((b) => b.projectId === projectId)
  const [draft, setDraft] = useState(blankExpense)
  const [editing, setEditing] = useState<string>()
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [reviewId, setReviewId] = useState<string>()
  const expenses = state.expenses.filter((e) => e.projectId === projectId)
  if (!project || !actor?.projectIds.includes(projectId))
    return <p role="alert">Project unavailable or outside your scope.</p>
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      saveExpense({ ...draft, amount: Number(draft.amount), projectId }, editing)
      setDraft(blankExpense)
      setEditing(undefined)
      setMessage('Expense saved. Budget updates only when verified.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense could not be saved.')
    }
  }
  const review = (id: string, verified: boolean) => {
    try {
      reviewExpense(id, verified, reason)
      setReviewId(undefined)
      setReason('')
      setMessage(
        verified
          ? 'Expense verified. Budget utilization updated once.'
          : 'Expense returned with the correction reason.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Review failed.')
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget & Expense Ledger"
        description="Demo data · verified expenses update the shared project budget."
      />
      <ProjectWorkspaceHeader project={project} />
      <SectionCard title="Project budget">
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            ['Allocation', budget?.plannedAmount],
            ['Verified spending', budget?.actualSpending],
            ['Available budget', budget ? budget.plannedAmount - budget.actualSpending : undefined],
          ].map(([label, amount]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd className="text-xl font-semibold">
                {amount === undefined
                  ? 'Unavailable'
                  : Number(amount).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3">
          Utilization:{' '}
          {budget ? Math.round((budget.actualSpending / budget.plannedAmount) * 100) : 0}% · Expense
          limit: {state.expenseRule.limitPercent}% of project budget; available budget also
          enforced.
        </p>
      </SectionCard>
      {hasAction(actor.role, 'expenses.submit') && !project.archived ? (
        <SectionCard title={editing ? 'Correct returned expense' : 'Record expense'}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <label>
              Related activity
              <select
                required
                className="mt-1 block w-full rounded border p-2"
                value={draft.activityId}
                onChange={(e) => setDraft({ ...draft, activityId: e.target.value })}
              >
                <option value="">Select activity</option>
                {state.activities
                  .filter((a) => a.projectId === projectId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </label>
            {(['amount', 'category', 'date', 'description'] as const).map((key) => (
              <label className="capitalize" htmlFor={`expense-${key}`} key={key}>
                {key} <span aria-hidden="true">*</span>
                <Input
                  id={`expense-${key}`}
                  required
                  type={key === 'amount' ? 'number' : key === 'date' ? 'date' : 'text'}
                  step={key === 'amount' ? '0.01' : undefined}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <Button type="submit">{editing ? 'Resubmit correction' : 'Save expense'}</Button>
          </form>
        </SectionCard>
      ) : null}
      <output className="block text-sm">{message}</output>
      <SectionCard title="Expense records">
        {expenses.length === 0 ? (
          <p>No new expenses recorded. Baseline verified spending is included above.</p>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense: DemoExpense) => (
              <article className="rounded border p-4" key={expense.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">
                    {expense.category} · PHP {expense.amount.toLocaleString()}
                  </h3>
                  <StatusBadge
                    tone={
                      expense.status === 'Verified'
                        ? 'success'
                        : expense.status === 'For Correction'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {expense.status}
                  </StatusBadge>
                </div>
                <p>{expense.description}</p>
                <p className="text-sm">
                  {expense.date} ·{' '}
                  {state.activities.find((a) => a.id === expense.activityId)?.title}
                </p>
                {expense.reason ? <p>Correction reason: {expense.reason}</p> : null}
                {expense.status === 'For Verification' &&
                hasAction(actor.role, 'expenses.verify') ? (
                  <div className="mt-3 flex gap-3">
                    <Button onClick={() => review(expense.id, true)}>Verify expense</Button>
                    <Button variant="outline" onClick={() => setReviewId(expense.id)}>
                      Return for correction
                    </Button>
                  </div>
                ) : null}
                {expense.status === 'For Correction' && expense.submittedBy === actor.id ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(expense.id)
                      setDraft({ ...expense, amount: String(expense.amount) })
                    }}
                  >
                    Correct expense
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
      {reviewId ? (
        <SectionCard title="Return expense for correction">
          <label htmlFor="expense-correction-reason">
            Required correction reason
            <Input
              id="expense-correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="mt-3 flex gap-3">
            <Button onClick={() => review(reviewId, false)}>Confirm return</Button>
            <Button variant="outline" onClick={() => setReviewId(undefined)}>
              Cancel
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

const blankIndicator = {
  label: '',
  description: '',
  unit: '',
  disaggregation: '',
  dataSource: '',
  target: '0',
}
export function ConnectedIndicatorWorkspace({ projectId }: { projectId?: string }) {
  const state = useDemoState()
  const actor = currentAccount(state)
  const workspaceProject = projectId
    ? state.projects.find((project) => project.id === projectId)
    : undefined
  const projects = visibleDemoProjects(state)
  const [selectedProject, setProject] = useState(projectId ?? '')
  const scope = projectId ?? selectedProject
  const [draft, setDraft] = useState(blankIndicator)
  const [editing, setEditing] = useState<string>()
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const canManage = actor && hasAction(actor.role, 'indicators.manage')
  const rows = state.indicators.filter(
    (i) =>
      actor?.projectIds.includes(i.projectId) &&
      (!scope || i.projectId === scope) &&
      `${i.label} ${i.code}`.toLowerCase().includes(query.toLowerCase()),
  )
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      saveIndicator(
        {
          ...draft,
          target: Number(draft.target),
          actual: editing ? (state.indicators.find((i) => i.id === editing)?.actual ?? 0) : 0,
          code: editing
            ? (state.indicators.find((i) => i.id === editing)?.code ?? '')
            : `IND-${state.sequence + 1}`,
          projectId: scope,
        },
        editing,
      )
      setEditing(undefined)
      setDraft(blankIndicator)
      setMessage('Indicator saved and available for reuse.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Indicator could not be saved.')
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={projectId ? 'Target Indicators' : 'Indicator Library'}
        description="Demo data · definitions and measured targets remain distinct. Project Managers have read-only access."
      />
      {workspaceProject ? <ProjectWorkspaceHeader project={workspaceProject} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Project
          <select
            className="block w-full rounded border p-2"
            value={scope}
            disabled={Boolean(projectId)}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">Select authorized project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="indicator-search">
          Search indicators
          <Input id="indicator-search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {canManage ? (
        <SectionCard title={editing ? 'Update indicator' : 'Create indicator'}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            {(Object.keys(blankIndicator) as (keyof typeof blankIndicator)[]).map((key) => (
              <label htmlFor={`indicator-${key}`} key={key}>
                {
                  {
                    label: 'Name',
                    description: 'Description',
                    unit: 'Unit of measure',
                    disaggregation: 'Disaggregation requirements',
                    dataSource: 'Data source',
                    target: 'Target',
                  }[key]
                }
                <Input
                  id={`indicator-${key}`}
                  required
                  type={key === 'target' ? 'number' : 'text'}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <Button type="submit">Save indicator</Button>
            {editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(undefined)
                  setDraft(blankIndicator)
                }}
              >
                Cancel edit
              </Button>
            ) : null}
          </form>
        </SectionCard>
      ) : null}
      <output className="block">{message}</output>
      <SectionCard title="Indicators">
        <div className="space-y-3">
          {rows.length ? (
            rows.map((indicator) => (
              <article className="rounded border p-4" key={indicator.id}>
                <h2 className="font-semibold">
                  {indicator.code} · {indicator.label}
                </h2>
                <p>{indicator.description}</p>
                <p>
                  Target {indicator.target}; actual {indicator.actual} {indicator.unit}
                </p>
                <p className="text-sm">
                  Disaggregation: {indicator.disaggregation || 'Not recorded'} · Source:{' '}
                  {indicator.dataSource || 'Not recorded'}
                </p>
                {canManage ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(indicator.id)
                      setProject(indicator.projectId)
                      setDraft({
                        label: indicator.label,
                        description: indicator.description ?? '',
                        unit: indicator.unit ?? '',
                        disaggregation: indicator.disaggregation ?? '',
                        dataSource: indicator.dataSource ?? '',
                        target: String(indicator.target),
                      })
                    }}
                  >
                    Edit indicator
                  </Button>
                ) : null}
              </article>
            ))
          ) : (
            <p>No indicators match this scope.</p>
          )}
        </div>
      </SectionCard>
      {canManage && scope ? (
        <SectionCard title="Reuse an existing indicator">
          <label>
            Indicator to link
            <select
              className="block w-full rounded border p-2"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                try {
                  reuseIndicator(e.target.value, scope)
                  setMessage('Indicator linked to the project monitoring framework.')
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Link failed.')
                }
                e.target.value = ''
              }}
            >
              <option value="">Choose an existing definition</option>
              {state.indicators
                .filter((i) => actor.projectIds.includes(i.projectId))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} · {i.label}
                  </option>
                ))}
            </select>
          </label>
          <ul className="mt-3">
            {state.projectIndicators
              .filter((i) => i.projectId === scope)
              .map((i) => (
                <li key={i.id}>
                  {i.label} · Target {i.target}
                </li>
              ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  )
}
