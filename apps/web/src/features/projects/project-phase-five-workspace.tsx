'use client'

import { ArrowLeft, Eye, FileText, Loader2, Plus, Receipt, Save } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/page-header'
import {
  AsyncState,
  DialogShell,
  EmptyState,
  ProgressBar,
  SectionCard,
  StatusBadge,
  StatusMessage,
} from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
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
import type { PrototypeLabelKey } from '@/constants/prototype-labels'
import { usePrototypeLabels } from '@/hooks/use-prototype-labels'
import { usePrototypeRole } from '@/hooks/use-prototype-role'
import { can } from '@/lib/rbac/can'
import { canAccessProjectForRole } from '@/lib/rbac/data-scope'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'
import type {
  Activity,
  AlertRecord,
  BudgetRecord,
  EvaluationRecord,
  EvidenceRecord,
  EvidenceReviewStatus,
  ExpenseRecord,
  IndicatorStatus,
  JourneyStageConfig,
  LiquidationStatus,
  ProjectDetail,
  ProjectIndicator,
  RecommendationOutcome,
  RecommendationOutcomeRecord,
  RecommendationRecord,
  ReportRecord,
} from '@/types/pathways'

import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'
import { BudgetEditorDialog } from './budget-editor-dialog'
import {
  addIndicatorSchema,
  annotationSchema,
  calculateBudgetUtilization,
  calculateExpenseTotal,
  calculateRemainingBudget,
  logExpenseSchema,
  recommendationOutcomeSchema,
  rejectionReasonSchema,
} from './phase-five-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

export type PhaseFiveWorkspaceView = 'evidence' | 'indicators' | 'monitor-evaluate' | 'budget'

const viewTitles: Record<PhaseFiveWorkspaceView, { title: string; description: string }> = {
  evidence: {
    title: 'Evidence & Reports',
    description: 'Review activity evidence and report records.',
  },
  indicators: {
    title: 'Target Indicators',
    description: 'Track baselines, targets, current values, and connected activities.',
  },
  'monitor-evaluate': {
    title: 'Monitor & Evaluate',
    description: 'Human-reviewed progress scoring, annotations, and formal evaluation history.',
  },
  budget: {
    title: 'Budget & Expense Ledger',
    description: 'Review allocations, recommendation outcomes, expenses, and liquidation status.',
  },
}

const viewLabelKeys: Record<PhaseFiveWorkspaceView, PrototypeLabelKey> = {
  evidence: 'projectEvidence',
  indicators: 'projectIndicators',
  'monitor-evaluate': 'projectMonitorEvaluate',
  budget: 'projectBudget',
}

const statusTone = (status: string) => {
  if (['Approved', 'Accepted', 'Met', 'Verified', 'Validated', 'On Track'].includes(status)) {
    return 'success'
  }

  if (['Flagged', 'Rejected', 'Critical', 'Needs Review', 'Returned'].includes(status)) {
    return 'danger'
  }

  if (['Pending', 'Pending Review', 'Warning', 'Submitted'].includes(status)) {
    return 'warning'
  }

  if (['Draft', 'Information'].includes(status)) {
    return 'info'
  }

  return 'neutral'
}

const progressForIndicator = (indicator: ProjectIndicator) =>
  Math.min(100, Math.round((indicator.actual / indicator.target) * 100))

const statusForIndicator = (indicator: ProjectIndicator): IndicatorStatus => {
  const progress = progressForIndicator(indicator)

  if (progress >= 100) {
    return 'Met'
  }

  if (progress >= 60) {
    return 'On Track'
  }

  return 'Needs Review'
}

const today = () => new Date().toISOString().slice(0, 10)

const fieldError = (message: string) =>
  toast.error('Check the form fields.', {
    description: message,
  })

const TextArea = ({
  id,
  onChange,
  placeholder,
  value,
}: {
  id?: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) => (
  <Textarea
    className="min-h-28"
    id={id}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    value={value}
  />
)

const SimpleDialog = ({
  children,
  description,
  open,
  title,
  onOpenChange,
}: {
  children: ReactNode
  description: string
  open: boolean
  title: string
  onOpenChange: (open: boolean) => void
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogShell title={title} description={description}>
      {children}
    </DialogShell>
  </Dialog>
)

import {
  ConnectedBudgetWorkspace,
  ConnectedIndicatorWorkspace,
} from './connected-delivery-workspace'

export const ProjectPhaseFiveWorkspace = (props: {
  projectId: string
  view: PhaseFiveWorkspaceView
}) =>
  props.view === 'budget' ? (
    <ConnectedBudgetWorkspace projectId={props.projectId} />
  ) : props.view === 'indicators' ? (
    <ConnectedIndicatorWorkspace projectId={props.projectId} />
  ) : (
    <LegacyProjectPhaseFiveWorkspace {...props} />
  )

const LegacyProjectPhaseFiveWorkspace = ({
  projectId,
  view,
}: {
  projectId: string
  view: PhaseFiveWorkspaceView
}) => {
  const { labels } = usePrototypeLabels()
  const { role } = usePrototypeRole()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([])
  const [indicators, setIndicators] = useState<ProjectIndicator[]>([])
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null)
  const [journeyStages, setJourneyStages] = useState<JourneyStageConfig[]>([])
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [actualSpending, setActualSpending] = useState(0)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([])
  const [outcomes, setOutcomes] = useState<RecommendationOutcomeRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    'loading',
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(null)
  const [addIndicatorOpen, setAddIndicatorOpen] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [outcomeRecommendation, setOutcomeRecommendation] = useState<RecommendationRecord | null>(
    null,
  )
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [rejectExpense, setRejectExpense] = useState<ExpenseRecord | null>(null)
  const [formState, setFormState] = useState<Record<string, string>>({})
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])

  useEffect(() => {
    void loadAttempt
    let mounted = true
    setLoadStatus('loading')

    Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getEvidence(projectId),
      pathwaysClient.getProjectIndicators(projectId),
      pathwaysClient.getEvaluation(projectId),
      pathwaysClient.getJourneyStages(projectId),
      pathwaysClient.getBudgets(projectId),
      pathwaysClient.getAlerts(projectId),
      pathwaysClient.getRecommendations(),
      pathwaysClient.getRecommendationOutcomes(projectId),
      pathwaysClient.getExpenses(projectId),
      pathwaysClient.getReports(projectId),
    ])
      .then(
        ([
          projectRecord,
          activityRecords,
          evidenceRecords,
          indicatorRecords,
          evaluationRecord,
          journeyStageRecords,
          budgetRecords,
          alertRecords,
          recommendationRecords,
          outcomeRecords,
          expenseRecords,
          reportRecords,
        ]) => {
          if (!mounted) {
            return
          }

          setProject(projectRecord)
          setActivities(activityRecords)
          setEvidence(evidenceRecords)
          setIndicators(indicatorRecords)
          setEvaluation(evaluationRecord)
          setJourneyStages(journeyStageRecords)
          setBudgets(budgetRecords)
          setActualSpending(budgetRecords[0]?.actualSpending ?? 0)
          setAlerts(alertRecords)
          setRecommendations(recommendationRecords)
          setOutcomes(outcomeRecords)
          setExpenses(expenseRecords)
          setReports(reportRecords)
          setLoadStatus('ready')
        },
      )
      .catch((error) => {
        if (mounted) {
          setLoadStatus(
            error instanceof PathwaysClientError && error.code === 'not_found'
              ? 'not-found'
              : 'error',
          )
        }
      })

    return () => {
      mounted = false
    }
  }, [loadAttempt, projectId])

  const projectAlerts = alerts
  const projectRecommendations = useMemo(() => {
    const projectAlertIds = new Set(projectAlerts.map((alert) => alert.id))
    return recommendations.filter((recommendation) => projectAlertIds.has(recommendation.alertId))
  }, [projectAlerts, recommendations])

  const plannedAmount = budgets[0]?.plannedAmount ?? 0
  const remainingBudget = calculateRemainingBudget(plannedAmount, actualSpending)
  const utilization = calculateBudgetUtilization(plannedAmount, actualSpending)
  const expenseTotal = calculateExpenseTotal(expenses)
  const canReviewEvidence = can(role, 'evidence.review')
  const canAddEvaluationAnnotation = can(role, 'monitor_evaluate.full')
  const canAddIndicator = can(role, 'indicators.manage')
  const canLogRecommendationOutcome = can(role, 'alerts.outcome.log')
  const canLogExpense = can(role, 'budget.expense.log')
  const canVerifyExpense = can(role, 'budget.expense.verify')
  const canApproveExpense = can(role, 'budget.expense.approve')
  const canModifyBudget = can(role, 'budget.full') && canAccessProjectForRole(role, projectId)
  const heading = {
    ...viewTitles[view],
    title: labels[viewLabelKeys[view]],
  }

  const updateEvidenceStatus = (record: EvidenceRecord, status: EvidenceReviewStatus) => {
    if (!canReviewEvidence) {
      toast.error('Evidence review is not available for this role.')
      return
    }

    setEvidence((current) =>
      current.map((item) => (item.id === record.id ? { ...item, status } : item)),
    )
    toast.success(`Evidence marked ${status.toLowerCase()}.`)
  }

  const addIndicator = () => {
    if (!canAddIndicator) {
      toast.error('Indicator configuration is not available for this role.')
      return
    }

    const result = addIndicatorSchema.safeParse(formState)

    if (!result.success) {
      fieldError(result.error.issues[0]?.message ?? 'Invalid indicator.')
      return
    }

    // TODO(BACKEND): Save indicator configuration and updates.
    const indicator: ProjectIndicator = {
      id: `prototype-indicator-${Date.now().toString(36)}`,
      projectId,
      code: result.data.code,
      label: result.data.label,
      baseline: result.data.baseline,
      target: result.data.target,
      actual: result.data.actual,
      status: statusForIndicator({
        id: 'preview',
        projectId,
        code: result.data.code,
        label: result.data.label,
        baseline: result.data.baseline,
        target: result.data.target,
        actual: result.data.actual,
        status: 'Needs Review',
        connectedActivityIds: [],
      }),
      connectedActivityIds: activities[0] ? [activities[0].id] : [],
    }
    setIndicators((current) => [...current, indicator])
    setFormState({})
    setAddIndicatorOpen(false)
    toast.success('Indicator added.')
  }

  const addAnnotation = () => {
    const result = annotationSchema.safeParse(formState)

    if (!result.success || !evaluation) {
      fieldError(result.error?.issues[0]?.message ?? 'Invalid annotation.')
      return
    }

    // TODO(BACKEND): Save formal evaluation, annotations, and evaluation weights.
    setEvaluation({
      ...evaluation,
      annotations: [
        ...evaluation.annotations,
        {
          id: `annotation-${Date.now().toString(36)}`,
          author: role,
          note: result.data.note,
          createdAt: today(),
        },
      ],
    })
    setFormState({})
    setAnnotationOpen(false)
    toast.success('Annotation added.')
  }

  const logOutcome = () => {
    if (!canLogRecommendationOutcome) {
      toast.error('Recommendation outcome logging is not available for this role.')
      return
    }

    const result = recommendationOutcomeSchema.safeParse(formState)

    if (!result.success || !outcomeRecommendation) {
      fieldError(result.error?.issues[0]?.message ?? 'Invalid recommendation outcome.')
      return
    }

    // TODO(BACKEND): Save recommendation outcome lifecycle.
    setOutcomes((current) => [
      {
        id: `outcome-${Date.now().toString(36)}`,
        recommendationId: outcomeRecommendation.id,
        outcome: result.data.outcome,
        note: result.data.note,
        loggedAt: today(),
      },
      ...current.filter((outcome) => outcome.recommendationId !== outcomeRecommendation.id),
    ])
    setRecommendations((current) =>
      current.map((recommendation) =>
        recommendation.id === outcomeRecommendation.id
          ? { ...recommendation, reviewStatus: 'Actioned' }
          : recommendation,
      ),
    )
    setFormState({})
    setOutcomeRecommendation(null)
    toast.success('Recommendation outcome logged.')
  }

  const logExpense = () => {
    if (!canLogExpense) {
      toast.error('Expense logging is not available for this role.')
      return
    }

    const result = logExpenseSchema.safeParse(formState)

    if (!result.success) {
      fieldError(result.error.issues[0]?.message ?? 'Invalid expense.')
      return
    }

    // TODO(BACKEND): Persist expense and liquidation workflow.
    // TODO(STORAGE): Upload and retrieve receipts.
    const expense: ExpenseRecord = {
      id: `expense-${Date.now().toString(36)}`,
      projectId,
      description: result.data.description,
      amount: result.data.amount,
      submitter: result.data.submitter,
      submittedDate: today(),
      expenseDate: result.data.expenseDate,
      hasReceipt: receiptFiles.length > 0,
      receiptFileName: receiptFiles[0]?.name,
      liquidationStatus: 'Pending',
    }
    setExpenses((current) => [expense, ...current])
    setActualSpending((current) => current + expense.amount)
    setReceiptFiles([])
    setFormState({})
    setExpenseOpen(false)
    toast.success('Expense logged.', {
      description: 'Receipt file names are available for review.',
    })
  }

  const updateExpenseStatus = (
    expense: ExpenseRecord,
    liquidationStatus: LiquidationStatus,
    rejectionReason?: string,
  ) => {
    if (liquidationStatus === 'Verified' && !canVerifyExpense) {
      toast.error('Expense verification is not available for this role.')
      return
    }

    if (['Approved', 'Rejected'].includes(liquidationStatus) && !canApproveExpense) {
      toast.error('Expense approval or rejection is not available for this role.')
      return
    }

    // TODO(RBAC): Enforce reviewer, verifier, approver, and publisher roles.
    // TODO(BACKEND): Persist expense and liquidation workflow.
    setExpenses((current) =>
      current.map((item) =>
        item.id === expense.id ? { ...item, liquidationStatus, rejectionReason } : item,
      ),
    )
    toast.success(`Expense marked ${liquidationStatus.toLowerCase()}.`)
  }

  const rejectExpenseWithReason = () => {
    const result = rejectionReasonSchema.safeParse(formState)

    if (!result.success || !rejectExpense) {
      fieldError(result.error?.issues[0]?.message ?? 'Invalid rejection reason.')
      return
    }

    updateExpenseStatus(rejectExpense, 'Rejected', result.data.reason)
    setRejectExpense(null)
    setFormState({})
  }

  if (loadStatus === 'loading') {
    return (
      <AsyncState
        description="Loading project information."
        icon={Loader2}
        status="loading"
        title="Loading workspace"
      />
    )
  }

  if (loadStatus === 'error') {
    return (
      <>
        <PageHeader
          title="Workspace unavailable"
          description="This project is currently unavailable."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="The project tab could not be loaded. Check your connection and try again."
          icon={FileText}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          status="error"
          title="Workspace data unavailable"
        />
      </>
    )
  }

  if (loadStatus === 'not-found' || !project) {
    return (
      <>
        <PageHeader
          title="Project not found"
          description="This project is not available to the current account."
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <AsyncState
          description="Return to the project directory and choose an available project."
          icon={FileText}
          status="empty"
          title="Project unavailable"
        />
      </>
    )
  }

  return (
    <>
      <StatusMessage>Project information loaded.</StatusMessage>
      <PageHeader
        title={heading.title}
        actions={
          <Button asChild className="gap-2" variant="outline">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Projects
            </Link>
          </Button>
        }
      />
      <ProjectWorkspaceHeader project={project} />
      {view === 'evidence' ? (
        <EvidenceView
          canReviewEvidence={canReviewEvidence}
          evidence={evidence}
          reports={reports}
          onPreview={setPreviewEvidence}
          onStatusChange={updateEvidenceStatus}
        />
      ) : null}
      {view === 'indicators' ? (
        <IndicatorsView
          activities={activities}
          canAddIndicator={canAddIndicator}
          indicators={indicators}
          onAdd={() => {
            setFormState({})
            setAddIndicatorOpen(true)
          }}
        />
      ) : null}
      {view === 'monitor-evaluate' && evaluation ? (
        <EvaluationView
          activities={activities}
          budget={budgets[0] ?? null}
          canAddAnnotation={canAddEvaluationAnnotation}
          evaluation={evaluation}
          onAddAnnotation={() => {
            setFormState({})
            setAnnotationOpen(true)
          }}
          project={project}
        />
      ) : null}
      {view === 'budget' ? (
        <BudgetView
          actualSpending={actualSpending}
          alerts={projectAlerts}
          budgetRecord={budgets[0] ?? null}
          expenseTotal={expenseTotal}
          expenses={expenses}
          outcomes={outcomes}
          plannedAmount={plannedAmount}
          recommendations={projectRecommendations}
          remainingBudget={remainingBudget}
          utilization={utilization}
          onApproveExpense={(expense) => updateExpenseStatus(expense, 'Approved')}
          canApproveExpense={canApproveExpense}
          canLogExpense={canLogExpense}
          canLogRecommendationOutcome={canLogRecommendationOutcome}
          canModifyBudget={canModifyBudget}
          canVerifyExpense={canVerifyExpense}
          onLogExpense={() => {
            setFormState({ submitter: 'Project Officer A', expenseDate: today() })
            setReceiptFiles([])
            setExpenseOpen(true)
          }}
          onBudgetSaved={(updatedBudget) => {
            setBudgets((current) => [
              ...current.filter((budget) => budget.id !== updatedBudget.id),
              updatedBudget,
            ])
          }}
          onOutcome={(recommendation) => {
            setFormState({ outcome: 'Accept', note: '' })
            setOutcomeRecommendation(recommendation)
          }}
          onRejectExpense={(expense) => {
            setFormState({})
            setRejectExpense(expense)
          }}
          onVerifyExpense={(expense) => updateExpenseStatus(expense, 'Verified')}
        />
      ) : null}
      <SimpleDialog
        description="Review the available evidence summary and file details."
        onOpenChange={(open) => {
          if (!open) {
            setPreviewEvidence(null)
          }
        }}
        open={Boolean(previewEvidence)}
        title={previewEvidence?.reportTitle ?? 'Evidence preview'}
      >
        {previewEvidence ? (
          <div className="space-y-4">
            <StatusBadge tone={statusTone(previewEvidence.status)}>
              {previewEvidence.status}
            </StatusBadge>
            <p className="text-sm leading-6 text-muted-foreground">
              {previewEvidence.previewSummary}
            </p>
            <div className="rounded-sm border border-dashed border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
              File preview unavailable for {previewEvidence.fileName}
            </div>
          </div>
        ) : null}
      </SimpleDialog>

      <SimpleDialog
        description="Add an indicator configuration for this project."
        onOpenChange={setAddIndicatorOpen}
        open={addIndicatorOpen}
        title="Add Indicator"
      >
        <div className="grid gap-4">
          <LabeledInput label="Code" name="code" value={formState.code} onChange={setFormState} />
          <LabeledInput
            label="Label"
            name="label"
            value={formState.label}
            onChange={setFormState}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <LabeledInput
              label="Baseline"
              name="baseline"
              type="number"
              value={formState.baseline}
              onChange={setFormState}
            />
            <LabeledInput
              label="Target"
              name="target"
              type="number"
              value={formState.target}
              onChange={setFormState}
            />
            <LabeledInput
              label="Actual/current value"
              name="actual"
              type="number"
              value={formState.actual}
              onChange={setFormState}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIndicatorOpen(false)} type="button">
              Cancel
            </Button>
            <Button className="gap-2" onClick={addIndicator} type="button">
              <Save className="h-4 w-4" aria-hidden="true" />
              Add Indicator
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>

      <SimpleDialog
        description="Document a human review note for the project evaluation."
        onOpenChange={setAnnotationOpen}
        open={annotationOpen}
        title="Add Annotation"
      >
        <div className="space-y-4">
          <Label htmlFor="annotation-note">Annotation note</Label>
          <TextArea
            id="annotation-note"
            onChange={(note) => setFormState((current) => ({ ...current, note }))}
            placeholder="Add progress context, review notes, or evidence interpretation."
            value={formState.note ?? ''}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnotationOpen(false)} type="button">
              Cancel
            </Button>
            <Button onClick={addAnnotation} type="button">
              Add Annotation
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>

      <SimpleDialog
        description="Log an outcome for the recommendation prompt."
        onOpenChange={(open) => {
          if (!open) {
            setOutcomeRecommendation(null)
          }
        }}
        open={Boolean(outcomeRecommendation)}
        title="Log Outcome"
      >
        <div className="space-y-4">
          <Select
            value={formState.outcome ?? 'Accept'}
            onValueChange={(outcome) => setFormState((current) => ({ ...current, outcome }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                ['Accept', 'Partially Accept', 'Decline', 'Escalate'] as RecommendationOutcome[]
              ).map((outcome) => (
                <SelectItem key={outcome} value={outcome}>
                  {outcome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="outcome-note">Outcome note</Label>
          <TextArea
            id="outcome-note"
            onChange={(note) => setFormState((current) => ({ ...current, note }))}
            placeholder="Explain the recommendation outcome."
            value={formState.note ?? ''}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeRecommendation(null)} type="button">
              Cancel
            </Button>
            <Button onClick={logOutcome} type="button">
              Log Outcome
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>

      <SimpleDialog
        description="Record a project expense and its supporting receipt details."
        onOpenChange={setExpenseOpen}
        open={expenseOpen}
        title="Project Officer Log Expense"
      >
        <div className="space-y-4">
          <LabeledInput
            label="Description"
            name="description"
            value={formState.description}
            onChange={setFormState}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <LabeledInput
              label="Amount"
              name="amount"
              type="number"
              value={formState.amount}
              onChange={setFormState}
            />
            <LabeledInput
              label="Expense date"
              name="expenseDate"
              type="date"
              value={formState.expenseDate}
              onChange={setFormState}
            />
            <LabeledInput
              label="Submitter"
              name="submitter"
              value={formState.submitter}
              onChange={setFormState}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receipt-file">Receipt</Label>
            <Input
              id="receipt-file"
              multiple
              onChange={(event) => setReceiptFiles(Array.from(event.target.files ?? []))}
              type="file"
            />
            <p className="text-sm text-muted-foreground">
              Selected receipts are previewed by name only and are not uploaded.
            </p>
          </div>
          {receiptFiles.length > 0 ? (
            <ul className="rounded-sm border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
              {receiptFiles.map((file) => (
                <li key={`${file.name}-${file.size}`} className="break-all">
                  {file.name}
                </li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} type="button">
              Cancel
            </Button>
            <Button onClick={logExpense} type="button">
              Log Expense
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>

      <SimpleDialog
        description="Provide the reason this expense requires correction."
        onOpenChange={(open) => {
          if (!open) {
            setRejectExpense(null)
          }
        }}
        open={Boolean(rejectExpense)}
        title="Reject Expense"
      >
        <div className="space-y-4">
          <Label htmlFor="rejection-reason">Rejection reason</Label>
          <TextArea
            id="rejection-reason"
            onChange={(reason) => setFormState((current) => ({ ...current, reason }))}
            placeholder="Explain what must be corrected."
            value={formState.reason ?? ''}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectExpense(null)} type="button">
              Cancel
            </Button>
            <Button onClick={rejectExpenseWithReason} type="button" variant="destructive">
              Reject
            </Button>
          </DialogFooter>
        </div>
      </SimpleDialog>
    </>
  )
}

const LabeledInput = ({
  label,
  name,
  onChange,
  type = 'text',
  value,
}: {
  label: string
  name: string
  onChange: (value: (current: Record<string, string>) => Record<string, string>) => void
  type?: string
  value?: string
}) => (
  <div className="space-y-2">
    <Label htmlFor={name}>{label}</Label>
    <Input
      id={name}
      onChange={(event) =>
        onChange((current) => ({
          ...current,
          [name]: event.target.value,
        }))
      }
      type={type}
      value={value ?? ''}
    />
  </div>
)

const EvidenceView = ({
  canReviewEvidence,
  evidence,
  reports,
  onPreview,
  onStatusChange,
}: {
  canReviewEvidence: boolean
  evidence: EvidenceRecord[]
  reports: ReportRecord[]
  onPreview: (record: EvidenceRecord) => void
  onStatusChange: (record: EvidenceRecord, status: EvidenceReviewStatus) => void
}) => {
  const [decisions, setDecisions] = useState<Record<string, EvidenceReviewStatus | ''>>({})

  return (
    <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <SectionCard
        title="Activity evidence list"
        description="Review submitted activity evidence and record its status."
      >
        <div className="space-y-3">
          {evidence.map((record) => (
            <div key={record.id} className="rounded-sm border border-border bg-surface-subtle p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{record.reportTitle}</p>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{record.fileName}</p>
                </div>
                <StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Submitter</dt>
                  <dd className="mt-1 font-medium text-foreground">{record.submitter}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Submitted date</dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {formatDate(record.submittedDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Proof review</dt>
                  <dd className="mt-1 font-medium text-foreground">{record.previewSummary}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  className="gap-2"
                  onClick={() => onPreview(record)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Preview
                </Button>
                {canReviewEvidence ? (
                  <div className="flex min-w-[260px] flex-wrap items-center gap-2">
                    <Select
                      onValueChange={(value) =>
                        setDecisions((current) => ({
                          ...current,
                          [record.id]: value as EvidenceReviewStatus,
                        }))
                      }
                      value={decisions[record.id] || undefined}
                    >
                      <SelectTrigger
                        aria-label={`Proof decision for ${record.reportTitle}`}
                        className="min-w-[190px] flex-1"
                      >
                        <SelectValue placeholder="Select decision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Validated">Validate</SelectItem>
                        <SelectItem value="Flagged">Flag as insufficient</SelectItem>
                        <SelectItem value="Approved">Approve</SelectItem>
                        <SelectItem value="Returned">Return for submission</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={!decisions[record.id]}
                      onClick={() => {
                        const decision = decisions[record.id]
                        if (!decision) return
                        onStatusChange(record, decision)
                        setDecisions((current) => ({ ...current, [record.id]: '' }))
                      }}
                      size="sm"
                      type="button"
                    >
                      Save
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Report records"
        description="Generated report references for the project."
      >
        <div className="space-y-3">
          {reports.length > 0 ? (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-sm border border-border bg-surface-subtle p-3 text-sm"
              >
                <p className="font-medium text-foreground">{report.title}</p>
                <p className="mt-1 text-muted-foreground">{report.reportingPeriod}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No report records are linked yet.</p>
          )}
        </div>
      </SectionCard>
    </section>
  )
}

const IndicatorsView = ({
  activities,
  canAddIndicator,
  indicators,
  onAdd,
}: {
  activities: Activity[]
  canAddIndicator: boolean
  indicators: ProjectIndicator[]
  onAdd: () => void
}) => (
  <SectionCard
    title="Indicator cards"
    description="Baseline, target, actual, progress, status, and connected activity context."
    actions={
      canAddIndicator ? (
        <Button className="gap-2" onClick={onAdd} type="button">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Indicator
        </Button>
      ) : null
    }
  >
    <div className="grid gap-4 xl:grid-cols-2">
      {indicators.map((indicator) => (
        <div key={indicator.id} className="rounded-sm border border-border bg-surface-subtle p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">{indicator.code}</p>
              <h2 className="mt-1 break-words text-lg font-semibold text-foreground">
                {indicator.label}
              </h2>
            </div>
            <StatusBadge tone={statusTone(indicator.status)}>{indicator.status}</StatusBadge>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Baseline</dt>
              <dd className="mt-1 font-medium text-foreground">{indicator.baseline}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="mt-1 font-medium text-foreground">{indicator.target}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actual/current value</dt>
              <dd className="mt-1 font-medium text-foreground">{indicator.actual}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <ProgressBar label="Indicator progress" value={progressForIndicator(indicator)} />
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Connected activities:{' '}
            <span className="font-medium text-foreground">
              {indicator.connectedActivityIds
                .map(
                  (activityId) =>
                    activities.find((activity) => activity.id === activityId)?.title ?? activityId,
                )
                .join(', ') || 'None linked yet'}
            </span>
          </div>
        </div>
      ))}
    </div>
  </SectionCard>
)

const EvaluationView = ({
  activities,
  budget,
  canAddAnnotation,
  evaluation,
  onAddAnnotation,
  project,
}: {
  activities: Activity[]
  budget: BudgetRecord | null
  canAddAnnotation: boolean
  evaluation: EvaluationRecord
  onAddAnnotation: () => void
  project: ProjectDetail
}) => {
  const [basisOpen, setBasisOpen] = useState(false)
  const completedActivities = activities.filter(
    (activity) => activity.status === 'Completed',
  ).length
  const utilization = budget
    ? Math.round((budget.actualSpending / Math.max(1, budget.plannedAmount)) * 100)
    : null
  const reach =
    project.targetBeneficiaries > 0
      ? Math.round((project.beneficiariesReached / project.targetBeneficiaries) * 100)
      : null
  const dimensions = [
    {
      label: 'Effectiveness',
      value: evaluation.indicatorAchievement,
      description: 'Indicator achievement against recorded targets.',
      tone: 'success' as const,
    },
    {
      label: 'Efficiency',
      value: utilization,
      description: `${completedActivities} of ${activities.length} activities completed; recorded budget utilization shown.`,
      tone: 'warning' as const,
    },
    {
      label: 'Reach',
      value: reach,
      description: `${project.beneficiariesReached.toLocaleString()} of ${project.targetBeneficiaries.toLocaleString()} target beneficiaries reached.`,
      tone: 'info' as const,
    },
    {
      label: 'Journey progress',
      value: evaluation.journeyProgression,
      description: 'Recorded progress through the configured beneficiary journey.',
      tone: 'info' as const,
    },
  ]
  const updates = [
    ...evaluation.history.map((entry) => ({
      id: entry.id,
      at: entry.reviewedAt,
      actor: entry.reviewer,
      kind: 'Formal review record',
      note: entry.note,
    })),
    ...activities.flatMap((activity) =>
      activity.updateNotes.map((entry) => ({
        id: `${activity.id}-${entry.id}`,
        at: entry.submittedAt,
        actor: activity.assignedTo.join(', ') || 'Project team',
        kind: activity.title,
        note: `${entry.note} Recorded progress: ${entry.progress}%.`,
      })),
    ),
  ].sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
  const latestEvaluationDate = evaluation.history
    .map((entry) => entry.reviewedAt)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]

  return (
    <>
      <section
        className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"
        aria-labelledby="overall-evaluation-title"
      >
        <SectionCard
          title="Overall evaluation score"
          description="OECD (2021) basis with PATHWAYS project dimensions."
          actions={
            <StatusBadge tone={evaluation.currentScore >= 75 ? 'success' : 'warning'}>
              {latestEvaluationDate
                ? `Updated ${formatDate(latestEvaluationDate)}`
                : 'No dated evaluation'}
            </StatusBadge>
          }
        >
          <div className="rounded-md border-l-4 border-primary bg-primary-subtle p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Latest recorded evaluation
            </p>
            <div className="mt-2 flex items-end gap-2">
              <p
                className="text-5xl font-semibold leading-none tabular-nums text-foreground"
                id="overall-evaluation-title"
              >
                {evaluation.currentScore}
              </p>
              <p className="pb-1 text-sm font-medium text-muted-foreground">/ 100</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Latest stored human-reviewed score; this view does not calculate a new composite.
            </p>
          </div>

          <div className="mt-5 space-y-5" aria-label="Evaluation dimension scores">
            {dimensions.map((dimension) => (
              <div className="space-y-2" key={dimension.label}>
                {dimension.value === null ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">{dimension.label}</span>
                    <span className="text-muted-foreground">Unavailable</span>
                  </div>
                ) : (
                  <ProgressBar
                    label={dimension.label}
                    tone={dimension.tone}
                    value={dimension.value}
                  />
                )}
                <p className="text-xs leading-5 text-muted-foreground">{dimension.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              className="gap-2"
              onClick={() => setBasisOpen(true)}
              type="button"
              variant="outline"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              View Basis
            </Button>
            {canAddAnnotation ? (
              <Button onClick={onAddAnnotation} type="button" variant="outline">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Add annotation
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Annotations" description="Human review notes.">
            {evaluation.annotations.length ? (
              <div className="space-y-3">
                {evaluation.annotations.map((annotation) => (
                  <article
                    className="rounded-sm border border-border bg-surface-subtle p-4"
                    key={annotation.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{annotation.author}</p>
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={annotation.createdAt}
                      >
                        {formatDate(annotation.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {annotation.note}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No annotations yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Evaluation update history"
            description="Dated project updates and formal review records."
          >
            {updates.length ? (
              <ol className="space-y-3">
                {updates.map((update) => (
                  <li
                    className="rounded-sm border border-border bg-surface-subtle p-4"
                    key={update.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{update.kind}</p>
                        <p className="text-xs text-muted-foreground">{update.actor}</p>
                      </div>
                      <time className="text-sm text-muted-foreground" dateTime={update.at}>
                        {formatDate(update.at)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{update.note}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                No dated evaluation updates are recorded.
              </p>
            )}
          </SectionCard>
        </div>
      </section>

      <SimpleDialog
        description="How the four PATHWAYS dimensions relate to the OECD evaluation criteria."
        onOpenChange={setBasisOpen}
        open={basisOpen}
        title="OECD (2021) basis"
      >
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Effectiveness and Efficiency use the corresponding OECD evaluation criteria. Reach and
            Journey progress are PATHWAYS product dimensions used alongside them.
          </p>
          <p>
            Each bar uses available recorded project facts. The overall value is the latest stored
            human-reviewed evaluation score; no new weighting formula is calculated on this page.
          </p>
        </div>
      </SimpleDialog>
    </>
  )
}

const BudgetView = ({
  actualSpending,
  alerts,
  budgetRecord,
  canApproveExpense,
  canLogExpense,
  canLogRecommendationOutcome,
  canModifyBudget,
  canVerifyExpense,
  expenseTotal,
  expenses,
  outcomes,
  plannedAmount,
  recommendations,
  remainingBudget,
  utilization,
  onApproveExpense,
  onBudgetSaved,
  onLogExpense,
  onOutcome,
  onRejectExpense,
  onVerifyExpense,
}: {
  actualSpending: number
  alerts: AlertRecord[]
  budgetRecord: BudgetRecord | null
  canApproveExpense: boolean
  canLogExpense: boolean
  canLogRecommendationOutcome: boolean
  canModifyBudget: boolean
  canVerifyExpense: boolean
  expenseTotal: number
  expenses: ExpenseRecord[]
  outcomes: RecommendationOutcomeRecord[]
  plannedAmount: number
  recommendations: RecommendationRecord[]
  remainingBudget: number
  utilization: number
  onApproveExpense: (expense: ExpenseRecord) => void
  onBudgetSaved: (budget: BudgetRecord) => void
  onLogExpense: () => void
  onOutcome: (recommendation: RecommendationRecord) => void
  onRejectExpense: (expense: ExpenseRecord) => void
  onVerifyExpense: (expense: ExpenseRecord) => void
}) => (
  <div className="space-y-4">
    <section aria-labelledby="budget-summary-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground" id="budget-summary-title">
            Budget summary
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Current project allocation and spending.
          </p>
        </div>
        {canModifyBudget && budgetRecord ? (
          <BudgetEditorDialog
            budget={{ ...budgetRecord, actualSpending }}
            onSaved={onBudgetSaved}
          />
        ) : null}
      </div>
      <div className="grid gap-3 border-y border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Planned allocation', formatCurrency(plannedAmount)],
          ['Actual spending', formatCurrency(actualSpending)],
          ['Remaining balance', formatCurrency(remainingBudget)],
          ['Expense ledger total', formatCurrency(expenseTotal)],
        ].map(([label, value], index) => (
          <div
            key={label}
            className={`p-4 ${index > 0 ? 'border-t border-border sm:border-t-0 sm:border-l' : ''}`}
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
    <SectionCard
      title="Budget utilization"
      description="Current utilization against the planned allocation."
    >
      <ProgressBar
        label="Utilization"
        tone={utilization > 85 ? 'warning' : 'info'}
        value={utilization}
      />
    </SectionCard>
    <section className="grid gap-4 xl:grid-cols-2">
      <SectionCard
        title="Budget alerts"
        description="Alerts and recommendation prompts for review."
      >
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-sm border border-border bg-surface-subtle p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{alert.title}</p>
                <StatusBadge tone={statusTone(alert.severity)}>{alert.severity}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{alert.category}</p>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard
        title="Recommendation prompts"
        description="Record the reviewed outcome for each recommendation."
      >
        <div className="space-y-3">
          {recommendations.length > 0 ? (
            recommendations.map((recommendation) => {
              const outcome = outcomes.find((item) => item.recommendationId === recommendation.id)

              return (
                <div
                  key={recommendation.id}
                  className="rounded-sm border border-border bg-surface-subtle p-3"
                >
                  <p className="text-sm text-muted-foreground">{recommendation.text}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge tone={outcome ? 'success' : 'warning'}>
                      {outcome ? outcome.outcome : recommendation.reviewStatus}
                    </StatusBadge>
                    {canLogRecommendationOutcome ? (
                      <Button onClick={() => onOutcome(recommendation)} size="sm" type="button">
                        Log Outcome
                      </Button>
                    ) : null}
                  </div>
                  {outcome ? (
                    <p className="mt-2 text-sm text-muted-foreground">{outcome.note}</p>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No recommendation prompts for this project.
            </p>
          )}
        </div>
      </SectionCard>
    </section>
    <SectionCard
      title="Expense Ledger"
      description="Review expense submission and liquidation status."
      actions={
        canLogExpense ? (
          <Button className="gap-2" onClick={onLogExpense} type="button">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Log Expense
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        {expenses.map((expense) => (
          <div
            key={expense.id}
            className="grid gap-4 rounded-sm border border-border bg-surface-subtle p-4 lg:grid-cols-[1fr_0.6fr_0.6fr_0.5fr_auto]"
          >
            <div className="min-w-0">
              <p className="break-words font-medium text-foreground">{expense.description}</p>
              <p className="mt-1 text-sm text-muted-foreground">{expense.submitter}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Dates</p>
              <p className="mt-1 font-medium text-foreground">{formatDate(expense.expenseDate)}</p>
              <p className="text-muted-foreground">Submitted {formatDate(expense.submittedDate)}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Amount</p>
              <p className="mt-1 font-medium text-foreground">{formatCurrency(expense.amount)}</p>
            </div>
            <div className="space-y-2">
              <StatusBadge tone={statusTone(expense.liquidationStatus)}>
                {expense.liquidationStatus}
              </StatusBadge>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <Receipt className="h-4 w-4" aria-hidden="true" />
                {expense.hasReceipt
                  ? (expense.receiptFileName ?? 'Receipt attached')
                  : 'No receipt'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canVerifyExpense && expense.liquidationStatus === 'Pending' ? (
                <Button
                  onClick={() => onVerifyExpense(expense)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Verify
                </Button>
              ) : null}
              {canApproveExpense && expense.liquidationStatus === 'Verified' ? (
                <>
                  <Button onClick={() => onApproveExpense(expense)} size="sm" type="button">
                    Approve
                  </Button>
                  <Button
                    onClick={() => onRejectExpense(expense)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reject
                  </Button>
                </>
              ) : null}
            </div>
            {expense.rejectionReason ? (
              <p className="text-sm text-danger lg:col-span-5">Reason: {expense.rejectionReason}</p>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  </div>
)
