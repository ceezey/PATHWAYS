'use client'

import { AlertTriangle, Check, ChevronDown, Eye, Pencil, Plus, ReceiptText, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { decideRecommendation } from '@/lib/demo-state/monitoring'
import { hasAction } from '@/lib/demo-state/permissions'
import { saveIndicatorForProjects } from '@/lib/demo-state/projects'
import { type DemoExpense, currentAccount, visibleDemoProjects } from '@/lib/demo-state/store'
import { useDemoState } from '@/lib/demo-state/use-demo-state'
import type { Indicator, RecommendationOutcome, RecommendationRecord } from '@/types/pathways'

import { ProjectWorkspaceHeader } from './project-workspace-header'

const peso = (amount: number) =>
  amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

const expenseTone = (status: DemoExpense['status']) => {
  if (status === 'Approved' || status === 'Partially Approved' || status === 'Verified')
    return 'success'
  if (status === 'Rejected' || status === 'For Correction') return 'danger'
  if (status === 'Escalated') return 'info'
  return 'warning'
}

type RecommendationReview = { recommendation: RecommendationRecord; alertTitle: string }

export function ConnectedBudgetWorkspace({ projectId }: { projectId: string }) {
  const state = useDemoState()
  const actor = currentAccount(state)
  const project = state.projects.find((record) => record.id === projectId)
  const budget = state.budgets.find((record) => record.projectId === projectId)
  const [recommendationReview, setRecommendationReview] = useState<RecommendationReview>()
  const [recommendationOutcome, setRecommendationOutcome] = useState<RecommendationOutcome>()
  const [outcomeNote, setOutcomeNote] = useState('')
  const [previewExpense, setPreviewExpense] = useState<DemoExpense>()
  const [message, setMessage] = useState('')

  if (!project || !actor?.projectIds.includes(projectId))
    return <p role="alert">Project unavailable or outside your scope.</p>

  const expenses = state.expenses.filter((expense) => expense.projectId === projectId)
  const budgetAlerts = state.alerts.filter(
    (alert) => alert.projectId === projectId && alert.category === 'Budget',
  )
  const recommendations = state.recommendations.filter((recommendation) =>
    budgetAlerts.some((alert) => alert.id === recommendation.alertId),
  )
  const canLogOutcome = hasAction(actor.role, 'outcomes.log')
  const utilization = budget
    ? Math.round((budget.actualSpending / Math.max(1, budget.plannedAmount)) * 100)
    : 0

  const openOutcome = (recommendation: RecommendationRecord, alertTitle: string) => {
    setRecommendationReview({ recommendation, alertTitle })
    setRecommendationOutcome(undefined)
    setOutcomeNote('')
    setMessage('')
  }

  const submitOutcome = () => {
    if (!recommendationReview || !recommendationOutcome) return
    try {
      decideRecommendation(
        recommendationReview.recommendation.id,
        recommendationOutcome,
        outcomeNote,
      )
      setMessage(`Outcome decision saved for ${recommendationReview.alertTitle}.`)
      setRecommendationReview(undefined)
      setRecommendationOutcome(undefined)
      setOutcomeNote('')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The outcome decision could not be saved.',
      )
    }
  }

  const ledgerExpenses = expenses.filter((expense) =>
    ['Verified', 'Approved', 'Partially Approved'].includes(expense.status),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget & Expense Ledger"
        description="Review project spending, budget risks, recommendations, and submitted expenses."
      />
      <ProjectWorkspaceHeader project={project} />

      <section aria-labelledby="budget-overview-title" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground" id="budget-overview-title">
            Budget overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved amounts affect spending once; submitted totals remain visible for review.
          </p>
        </div>
        <dl className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total budget', budget ? peso(budget.plannedAmount) : 'Unavailable'],
            ['Logged expenses', budget ? peso(budget.actualSpending) : 'Unavailable'],
            [
              'Remaining budget',
              budget ? peso(budget.plannedAmount - budget.actualSpending) : 'Unavailable',
            ],
            ['Efficiency', budget ? `${utilization}% utilized` : 'Unavailable'],
          ].map(([label, value], index) => (
            <div
              className={`p-4 ${index ? 'border-t border-border sm:border-l sm:border-t-0' : ''}`}
              key={label}
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <output className="block text-sm text-muted-foreground" aria-live="polite">
        {message}
      </output>
      <Tabs defaultValue="risks">
        <TabsList aria-label="Budget information">
          <TabsTrigger value="risks">Budget risks & recommendations</TabsTrigger>
          <TabsTrigger value="ledger">Expense ledger</TabsTrigger>
        </TabsList>
        <TabsContent value="risks">
          <SectionCard
            title="Budget risks, alerts & recommendations"
            description="Deterministic mock signals stay paired with a recommendation and a human-recorded outcome."
          >
            {budgetAlerts.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {budgetAlerts.map((alert) => {
                  const recommendation = recommendations.find(
                    (record) => record.alertId === alert.id,
                  )
                  return (
                    <article
                      className="rounded-md border border-border bg-surface-subtle p-4"
                      key={alert.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <AlertTriangle
                            className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                            aria-hidden="true"
                          />
                          <div>
                            <h3 className="font-semibold text-foreground">{alert.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {alert.description}
                            </p>
                          </div>
                        </div>
                        <StatusBadge tone={alert.severity === 'Critical' ? 'danger' : 'warning'}>
                          {alert.severity}
                        </StatusBadge>
                      </div>
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          System recommendation
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {recommendation?.text ?? 'No recommendation recorded for this alert.'}
                        </p>
                        {recommendation?.outcome ? (
                          <div className="mt-3 rounded-sm border border-border bg-background p-3 text-sm">
                            <p className="font-medium text-foreground">
                              {recommendation.outcome === 'Decline'
                                ? 'Reject'
                                : recommendation.outcome === 'Escalate'
                                  ? 'Escalate to Program Manager'
                                  : recommendation.outcome}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {recommendation.outcomeNote}
                            </p>
                          </div>
                        ) : canLogOutcome && recommendation ? (
                          <Button
                            className="mt-3"
                            onClick={() => openOutcome(recommendation, alert.title)}
                            size="sm"
                            type="button"
                          >
                            Log Outcome Decision
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No budget-specific risks or recommendations are recorded for this project.
              </p>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="ledger">
          <SectionCard
            title="Expense ledger"
            description="M&E-validated Project Officer expenses appear here automatically. Select a card to preview its exact record."
          >
            {ledgerExpenses.length ? (
              <div className="space-y-3">
                {ledgerExpenses.map((expense) => {
                  const submitter = state.accounts.find(
                    (account) => account.id === expense.submittedBy,
                  )
                  const activity = state.activities.find(
                    (record) => record.id === expense.activityId,
                  )
                  return (
                    <button
                      className="w-full rounded-md border border-border bg-card p-4 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      key={expense.id}
                      onClick={() => setPreviewExpense(expense)}
                      type="button"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">
                              {expense.category} · {peso(expense.amount)}
                            </h3>
                            <StatusBadge tone={expenseTone(expense.status)}>
                              {expense.status}
                            </StatusBadge>
                          </div>
                          <p className="text-sm text-foreground">{expense.description}</p>
                          <dl className="grid gap-x-6 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <dt>Activity</dt>
                              <dd className="font-medium text-foreground">
                                {activity?.title ?? 'Unavailable'}
                              </dd>
                            </div>
                            <div>
                              <dt>Submitted by</dt>
                              <dd className="font-medium text-foreground">
                                {submitter?.name ?? expense.submittedBy}
                              </dd>
                            </div>
                            <div>
                              <dt>Expense date</dt>
                              <dd className="font-medium text-foreground">{expense.date}</dd>
                            </div>
                            <div>
                              <dt>Submitted amount</dt>
                              <dd className="font-medium text-foreground">
                                {peso(expense.amount)}
                              </dd>
                            </div>
                          </dl>
                          {expense.approvedAmount !== undefined ? (
                            <p className="text-sm text-muted-foreground">
                              Approved {peso(expense.approvedAmount)} · Rejected balance{' '}
                              {peso(expense.rejectedAmount ?? 0)}
                            </p>
                          ) : null}
                          {expense.reason ? (
                            <p className="rounded-sm border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
                              Decision reason: {expense.reason}
                            </p>
                          ) : null}
                        </div>
                        <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
                          <Eye className="h-4 w-4" aria-hidden="true" /> Preview
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <ReceiptText className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 font-medium text-foreground">No validated expenses</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submitted expenses appear after M&E validation.
                </p>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(recommendationReview)}
        onOpenChange={(open) => !open && setRecommendationReview(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Outcome Decision</DialogTitle>
            <DialogDescription>
              {recommendationReview?.alertTitle ??
                'Record the human decision for this recommendation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recommendation-outcome">Outcome</Label>
            <Select
              onValueChange={(value) => setRecommendationOutcome(value as RecommendationOutcome)}
              value={recommendationOutcome}
            >
              <SelectTrigger id="recommendation-outcome">
                <SelectValue placeholder="Select an outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Accept">Accept</SelectItem>
                <SelectItem value="Decline">Reject</SelectItem>
                <SelectItem value="Partially Accept">Partially Accept</SelectItem>
                {actor.role !== 'Program Manager' ? (
                  <SelectItem value="Escalate">Escalate to Program Manager</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommendation-outcome-note">Decision note</Label>
            <Textarea
              id="recommendation-outcome-note"
              onChange={(event) => setOutcomeNote(event.target.value)}
              placeholder="Explain the decision and planned follow-up."
              value={outcomeNote}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRecommendationReview(undefined)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!recommendationOutcome || !outcomeNote.trim()}
              onClick={submitOutcome}
              type="button"
            >
              Submit decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewExpense)}
        onOpenChange={(open) => !open && setPreviewExpense(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expense record preview</DialogTitle>
            <DialogDescription>
              M&E-validated record from the selected activity and Project Officer submission.
            </DialogDescription>
          </DialogHeader>
          {previewExpense ? (
            <dl className="grid gap-4 rounded-sm border border-border bg-surface-subtle p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-medium text-foreground">{previewExpense.category}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-medium text-foreground">{peso(previewExpense.amount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expense date</dt>
                <dd className="font-medium text-foreground">{previewExpense.date}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium text-foreground">{previewExpense.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Activity</dt>
                <dd className="font-medium text-foreground">
                  {state.activities.find((activity) => activity.id === previewExpense.activityId)
                    ?.title ?? 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Submitted by</dt>
                <dd className="font-medium text-foreground">
                  {state.accounts.find((account) => account.id === previewExpense.submittedBy)
                    ?.name ?? previewExpense.submittedBy}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="font-medium text-foreground">{previewExpense.description}</dd>
              </div>
            </dl>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setPreviewExpense(undefined)} type="button">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const project = projectId ? state.projects.find((record) => record.id === projectId) : undefined
  const projects = visibleDemoProjects(state).filter((record) => !record.archived)
  const [draft, setDraft] = useState(blankIndicator)
  const [editing, setEditing] = useState<Indicator>()
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    projectId ? [projectId] : [],
  )
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const canManage = Boolean(actor && hasAction(actor.role, 'indicators.manage'))
  const rows = useMemo(
    () =>
      state.indicators.filter(
        (indicator) =>
          actor?.projectIds.includes(indicator.projectId) &&
          (!projectId || indicator.projectId === projectId) &&
          `${indicator.label} ${indicator.code}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [actor?.projectIds, projectId, query, state.indicators],
  )

  if (projectId && (!project || !actor?.projectIds.includes(projectId)))
    return <p role="alert">Project unavailable or outside your scope.</p>

  const startAdd = () => {
    setEditing(undefined)
    setDraft(blankIndicator)
    setSelectedProjectIds(projectId ? [projectId] : [])
    setMessage('')
    setDialogOpen(true)
  }

  const startEdit = (indicator: Indicator) => {
    setEditing(indicator)
    setDraft({
      label: indicator.label,
      description: indicator.description ?? '',
      unit: indicator.unit ?? '',
      disaggregation: indicator.disaggregation ?? '',
      dataSource: indicator.dataSource ?? '',
      target: String(indicator.target),
    })
    setSelectedProjectIds([indicator.projectId])
    setMessage('')
    setDialogOpen(true)
  }

  const toggleProject = (selectedProjectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(selectedProjectId)
        ? current.filter((id) => id !== selectedProjectId)
        : [...current, selectedProjectId],
    )
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const saved = saveIndicatorForProjects(
        { ...draft, target: Number(draft.target) },
        selectedProjectIds,
        editing?.id,
      )
      setDialogOpen(false)
      setEditing(undefined)
      setDraft(blankIndicator)
      setMessage(
        `${saved.length > 1 ? `${saved.length} project-local indicator copies` : 'Indicator'} saved.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Indicator could not be saved.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Target Indicators"
        description="Define measured targets in the current project context."
      />
      {project ? <ProjectWorkspaceHeader project={project} /> : null}

      <SectionCard
        title="Indicators"
        description={`${rows.length} indicator${rows.length === 1 ? '' : 's'} in this project.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <Input
              aria-label="Search indicators"
              className="w-full sm:w-72"
              id="indicator-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search indicators"
              type="search"
              value={query}
            />
            {canManage ? (
              <Button className="gap-2 whitespace-nowrap" onClick={startAdd} type="button">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add indicator
              </Button>
            ) : null}
          </div>
        }
      >
        <output className="mb-3 block text-sm text-muted-foreground" aria-live="polite">
          {message}
        </output>
        {rows.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((indicator) => (
              <article className="rounded-md border border-border bg-card p-4" key={indicator.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {indicator.code}
                    </p>
                    <h2 className="mt-1 font-semibold text-foreground">{indicator.label}</h2>
                  </div>
                  {canManage ? (
                    <Button
                      aria-label={`Edit ${indicator.label}`}
                      onClick={() => startEdit(indicator)}
                      size="icon"
                      title={`Edit ${indicator.label}`}
                      type="button"
                      variant="outline"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {indicator.description || 'No description recorded.'}
                </p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd className="font-medium text-foreground">{indicator.target}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Actual</dt>
                    <dd className="font-medium text-foreground">{indicator.actual}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Unit</dt>
                    <dd className="font-medium text-foreground">
                      {indicator.unit || 'Unavailable'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Source: {indicator.dataSource || 'Unavailable'} · Disaggregation:{' '}
                  {indicator.disaggregation || 'Unavailable'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No indicators match this project and search.
          </p>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit indicator' : 'Add indicator'}</DialogTitle>
            <DialogDescription>
              Select every authorized project that should receive its own local copy. Later edits do
              not propagate to unselected projects.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label id="indicator-projects-label">Projects</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-labelledby="indicator-projects-label indicator-projects-summary"
                    className="w-full justify-between font-normal"
                    id="indicator-projects-summary"
                    type="button"
                    variant="outline"
                  >
                    <span>
                      {selectedProjectIds.length
                        ? `${selectedProjectIds.length} project${selectedProjectIds.length === 1 ? '' : 's'} selected`
                        : 'Select authorized projects'}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                  {projects.map((record) => (
                    <DropdownMenuCheckboxItem
                      checked={selectedProjectIds.includes(record.id)}
                      key={record.id}
                      onCheckedChange={() => toggleProject(record.id)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      <span>
                        <span className="block font-medium text-foreground">{record.title}</span>
                        <span className="text-xs text-muted-foreground">{record.area}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(blankIndicator) as (keyof typeof blankIndicator)[]).map((key) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`indicator-${key}`}>
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
                  </Label>
                  <Input
                    id={`indicator-${key}`}
                    min={key === 'target' ? '0' : undefined}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    required
                    type={key === 'target' ? 'number' : 'text'}
                    value={draft[key]}
                  />
                </div>
              ))}
            </div>
            <output className="block text-sm text-danger" aria-live="polite">
              {message}
            </output>
            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)} type="button" variant="outline">
                <X className="mr-2 h-4 w-4" aria-hidden="true" /> Cancel
              </Button>
              <Button type="submit">
                <Check className="mr-2 h-4 w-4" aria-hidden="true" /> Save indicator
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
