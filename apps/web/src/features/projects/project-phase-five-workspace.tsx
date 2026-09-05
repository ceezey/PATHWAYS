'use client'

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileText,
  Flag,
  Loader2,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
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
  LiquidationStatus,
  ProjectDetail,
  ProjectIndicator,
  RecommendationOutcome,
  RecommendationOutcomeRecord,
  RecommendationRecord,
  ReportRecord,
  TransparencyApprovalState,
  TransparencySection,
} from '@/types/pathways'

import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'
import { BudgetEditorDialog } from './budget-editor-dialog'
import {
  addIndicatorSchema,
  annotationSchema,
  calculateBudgetUtilization,
  calculateExpenseTotal,
  calculateRemainingBudget,
  formalEvaluationSchema,
  logExpenseSchema,
  recommendationOutcomeSchema,
  rejectionReasonSchema,
} from './phase-five-utils'
import { ProjectWorkspaceHeader } from './project-workspace-header'

export type PhaseFiveWorkspaceView =
  | 'evidence'
  | 'indicators'
  | 'monitor-evaluate'
  | 'budget'
  | 'transparency'

const viewTitles: Record<PhaseFiveWorkspaceView, { title: string; description: string }> = {
  evidence: {
    title: 'Evidence & Reports',
    description: 'Review activity proof, file placeholders, and report records.',
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
  transparency: {
    title: 'Transparency',
    description: 'Configure public project sections without beneficiary-sensitive information.',
  },
}

const viewLabelKeys: Record<PhaseFiveWorkspaceView, PrototypeLabelKey> = {
  evidence: 'projectEvidence',
  indicators: 'projectIndicators',
  'monitor-evaluate': 'projectMonitorEvaluate',
  budget: 'projectBudget',
  transparency: 'projectPublicDashboard',
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

export const ProjectPhaseFiveWorkspace = ({
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
  const [budgets, setBudgets] = useState<BudgetRecord[]>([])
  const [actualSpending, setActualSpending] = useState(0)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([])
  const [outcomes, setOutcomes] = useState<RecommendationOutcomeRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [transparencySections, setTransparencySections] = useState<TransparencySection[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>(
    'loading',
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(null)
  const [addIndicatorOpen, setAddIndicatorOpen] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [basisOpen, setBasisOpen] = useState(false)
  const [formalEvaluationOpen, setFormalEvaluationOpen] = useState(false)
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
      pathwaysClient.getBudgets(projectId),
      pathwaysClient.getAlerts(projectId),
      pathwaysClient.getRecommendations(),
      pathwaysClient.getRecommendationOutcomes(projectId),
      pathwaysClient.getExpenses(projectId),
      pathwaysClient.getReports(projectId),
      pathwaysClient.getTransparencySections(projectId),
    ])
      .then(
        ([
          projectRecord,
          activityRecords,
          evidenceRecords,
          indicatorRecords,
          evaluationRecord,
          budgetRecords,
          alertRecords,
          recommendationRecords,
          outcomeRecords,
          expenseRecords,
          reportRecords,
          transparencyRecords,
        ]) => {
          if (!mounted) {
            return
          }

          setProject(projectRecord)
          setActivities(activityRecords)
          setEvidence(evidenceRecords)
          setIndicators(indicatorRecords)
          setEvaluation(evaluationRecord)
          setBudgets(budgetRecords)
          setActualSpending(budgetRecords[0]?.actualSpending ?? 0)
          setAlerts(alertRecords)
          setRecommendations(recommendationRecords)
          setOutcomes(outcomeRecords)
          setExpenses(expenseRecords)
          setReports(reportRecords)
          setTransparencySections(transparencyRecords)
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
  const canConfigureWeights = can(role, 'monitor_evaluate.full')
  const canReviewEvidence = can(role, 'evidence.review')
  const canAddIndicator = can(role, 'indicators.manage')
  const canSubmitFormalEvaluation = can(role, 'evaluation.formal.submit')
  const canLogRecommendationOutcome = can(role, 'alerts.outcome.log')
  const canLogExpense = can(role, 'budget.expense.log')
  const canVerifyExpense = can(role, 'budget.expense.verify')
  const canApproveExpense = can(role, 'budget.expense.approve')
  const canModifyBudget = can(role, 'budget.full') && canAccessProjectForRole(role, projectId)
  const canPublishTransparency = can(role, 'transparency.publish')
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
    toast.success(`Evidence marked ${status.toLowerCase()}.`, {
      description: 'Prototype status transition only; no server enforcement occurred.',
    })
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
    toast.success('Prototype indicator added.', {
      description: 'The indicator is available in local workspace state only.',
    })
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
    toast.success('Annotation added.', {
      description: 'This is a local human-review note for the prototype.',
    })
  }

  const saveFormalEvaluation = () => {
    if (!canSubmitFormalEvaluation) {
      toast.error('Formal evaluation submission is not available for this role.')
      return
    }

    const result = formalEvaluationSchema.safeParse(formState)

    if (!result.success || !evaluation) {
      fieldError(result.error?.issues[0]?.message ?? 'Invalid evaluation.')
      return
    }

    // TODO(BACKEND): Save formal evaluation, annotations, and evaluation weights.
    setEvaluation({
      ...evaluation,
      currentScore: result.data.score,
      history: [
        {
          id: `evaluation-${Date.now().toString(36)}`,
          score: result.data.score,
          reviewer: role,
          reviewedAt: today(),
          note: result.data.note,
        },
        ...evaluation.history,
      ],
    })
    setFormState({})
    setFormalEvaluationOpen(false)
    toast.success('Formal evaluation saved locally.', {
      description: 'The score is progress-based and human-reviewed in this prototype.',
    })
  }

  const updateWeight = (weightId: string, value: number) => {
    if (!evaluation) {
      return
    }

    // TODO(BACKEND): Save formal evaluation, annotations, and evaluation weights.
    setEvaluation({
      ...evaluation,
      components: evaluation.components.map((component) =>
        component.id === weightId ? { ...component, value } : component,
      ),
    })
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
    toast.success('Recommendation outcome logged.', {
      description: 'Lifecycle status changed visibly in prototype state only.',
    })
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
    toast.success('Expense logged locally.', {
      description: 'Receipt files are previewed by name only and are not uploaded.',
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
    toast.success(`Expense marked ${liquidationStatus.toLowerCase()}.`, {
      description: 'Prototype transition only; no server authorization was enforced.',
    })
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

  const updateTransparency = (
    section: TransparencySection,
    patch: Partial<Pick<TransparencySection, 'approvalState' | 'visible'>>,
  ) => {
    if (!canPublishTransparency) {
      toast.error('Transparency publishing is not available for this role.')
      return
    }

    // TODO(DATABASE): Load transparency visibility configuration.
    // TODO(RBAC): Enforce reviewer, verifier, approver, and publisher roles.
    setTransparencySections((current) =>
      current.map((item) => (item.id === section.id ? { ...item, ...patch } : item)),
    )
  }

  if (loadStatus === 'loading') {
    return (
      <AsyncState
        description="Loading the project workspace tab."
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
          eyebrow={labels.projectWorkspace}
          title="Workspace unavailable"
          description="This project tab is not available in the current prototype session."
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
          eyebrow={labels.projectWorkspace}
          title="Project not found"
          description="This project is not available in the current prototype session."
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
          title="No project workspace"
        />
      </>
    )
  }

  return (
    <>
      <StatusMessage>Project workspace loaded.</StatusMessage>
      <PageHeader
        eyebrow={labels.projectWorkspace}
        title={heading.title}
        description={heading.description}
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
          canConfigureWeights={canConfigureWeights}
          evaluation={evaluation}
          evidenceCount={evidence.length}
          canSubmitFormalEvaluation={canSubmitFormalEvaluation}
          onAddAnnotation={() => {
            setFormState({})
            setAnnotationOpen(true)
          }}
          onFormalEvaluation={() => {
            setFormState({ score: String(evaluation.currentScore), note: '' })
            setFormalEvaluationOpen(true)
          }}
          onViewBasis={() => setBasisOpen(true)}
          onWeightChange={updateWeight}
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
      {view === 'transparency' ? (
        <TransparencyView
          indicators={indicators}
          plannedAmount={plannedAmount}
          project={project}
          sections={transparencySections}
          utilization={utilization}
          canPublishTransparency={canPublishTransparency}
          onUpdate={updateTransparency}
        />
      ) : null}

      <SimpleDialog
        description="File preview placeholders do not fetch remote storage files."
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
              Placeholder preview for {previewEvidence.fileName}
            </div>
          </div>
        ) : null}
      </SimpleDialog>

      <SimpleDialog
        description="Add a temporary local indicator configuration for this project."
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
        description="Evaluation basis is progress-based, evidence-supported, and human-reviewed."
        onOpenChange={setBasisOpen}
        open={basisOpen}
        title="Evaluation Basis"
      >
        {evaluation ? (
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              Current score blends journey progression, indicator achievement, and supporting
              evidence quality. The score is a prototype review aid and is not server-enforced.
            </p>
            {evaluation.components.map((component) => (
              <div
                key={component.id}
                className="rounded-sm border border-border bg-surface-subtle p-3"
              >
                <p className="font-medium text-foreground">{component.label}</p>
                <p>{component.value}% weight in the current role-preview model.</p>
              </div>
            ))}
          </div>
        ) : null}
      </SimpleDialog>

      <SimpleDialog
        description="Save a formal progress review in local prototype state."
        onOpenChange={setFormalEvaluationOpen}
        open={formalEvaluationOpen}
        title="Formal Evaluation"
      >
        <div className="space-y-4">
          <LabeledInput
            label="Evaluation score"
            name="score"
            type="number"
            value={formState.score}
            onChange={setFormState}
          />
          <Label htmlFor="formal-evaluation-note">Evaluation note</Label>
          <TextArea
            id="formal-evaluation-note"
            onChange={(note) => setFormState((current) => ({ ...current, note }))}
            placeholder="Summarize the human-reviewed progress basis."
            value={formState.note ?? ''}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormalEvaluationOpen(false)} type="button">
              Cancel
            </Button>
            <Button onClick={saveFormalEvaluation} type="button">
              Save Evaluation
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
        description="Project Officer expense logging is local to this prototype session."
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
        description="Provide a visible prototype reason for rejecting this expense."
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
}) => (
  <section className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
    <SectionCard
      title="Activity evidence list"
      description="Proof review actions are prototype transitions."
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
                <>
                  <Button
                    onClick={() => onStatusChange(record, 'Validated')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Validate
                  </Button>
                  <Button
                    onClick={() => onStatusChange(record, 'Flagged')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Flag
                  </Button>
                  <Button
                    onClick={() => onStatusChange(record, 'Approved')}
                    size="sm"
                    type="button"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => onStatusChange(record, 'Returned')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Return for Revision
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
    <SectionCard title="Report records" description="Generated report references for the project.">
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
  canConfigureWeights,
  canSubmitFormalEvaluation,
  evaluation,
  evidenceCount,
  onAddAnnotation,
  onFormalEvaluation,
  onViewBasis,
  onWeightChange,
}: {
  canConfigureWeights: boolean
  canSubmitFormalEvaluation: boolean
  evaluation: EvaluationRecord
  evidenceCount: number
  onAddAnnotation: () => void
  onFormalEvaluation: () => void
  onViewBasis: () => void
  onWeightChange: (weightId: string, value: number) => void
}) => (
  <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
    <SectionCard
      title="Current evaluation score"
      description="Progress-based and human-reviewed."
      actions={
        <StatusBadge tone={evaluation.currentScore >= 75 ? 'success' : 'warning'}>
          {evaluation.currentScore}%
        </StatusBadge>
      }
    >
      <div className="space-y-4">
        <ProgressBar label="Journey progression" value={evaluation.journeyProgression} />
        <ProgressBar
          label="Indicator achievement"
          tone="success"
          value={evaluation.indicatorAchievement}
        />
        <ProgressBar
          label="Supporting evidence"
          tone="warning"
          value={evaluation.supportingEvidence}
        />
        <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
          Supporting evidence records:{' '}
          <span className="font-medium text-foreground">{evidenceCount}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={onViewBasis} type="button" variant="outline">
            <Eye className="h-4 w-4" aria-hidden="true" />
            View Basis
          </Button>
          <Button onClick={onAddAnnotation} type="button" variant="outline">
            Add Annotation
          </Button>
          {canSubmitFormalEvaluation ? (
            <Button onClick={onFormalEvaluation} type="button">
              Formal Evaluation
            </Button>
          ) : null}
        </div>
      </div>
    </SectionCard>
    <div className="space-y-4">
      <SectionCard
        title="Evaluation weights"
        description={
          canConfigureWeights
            ? 'Role preview allows local weight adjustment.'
            : 'View-only for this role preview.'
        }
      >
        <div className="space-y-3">
          {evaluation.components.map((component) => (
            <div
              key={component.id}
              className="grid gap-3 rounded-sm border border-border bg-surface-subtle p-3 sm:grid-cols-[1fr_120px]"
            >
              <div>
                <p className="font-medium text-foreground">{component.label}</p>
                <p className="text-sm text-muted-foreground">Weight: {component.value}%</p>
              </div>
              <Input
                disabled={!canConfigureWeights}
                max={100}
                min={0}
                onChange={(event) => onWeightChange(component.id, Number(event.target.value))}
                type="number"
                value={component.value}
              />
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Annotations" description="Human review notes.">
        <div className="space-y-3">
          {evaluation.annotations.length > 0 ? (
            evaluation.annotations.map((annotation) => (
              <div
                key={annotation.id}
                className="rounded-sm border border-border bg-surface-subtle p-3 text-sm"
              >
                <p className="font-medium text-foreground">{annotation.author}</p>
                <p className="mt-1 text-muted-foreground">{annotation.note}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No annotations yet.</p>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Evaluation History" description="Formal review entries.">
        <div className="space-y-3">
          {evaluation.history.length > 0 ? (
            evaluation.history.map((entry) => (
              <div
                key={entry.id}
                className="rounded-sm border border-border bg-surface-subtle p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{entry.score}%</p>
                  <span className="text-muted-foreground">{formatDate(entry.reviewedAt)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{entry.note}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No formal evaluations yet.</p>
          )}
        </div>
      </SectionCard>
    </div>
  </section>
)

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
            Planned allocation changes are saved in this browser for this prototype.
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
      description="Budget records remain local and internally consistent."
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
        description="Outcome lifecycle is local prototype state."
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
      description="Liquidation status transitions are demonstrated without server enforcement."
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

const TransparencyView = ({
  canPublishTransparency,
  indicators,
  plannedAmount,
  project,
  sections,
  utilization,
  onUpdate,
}: {
  canPublishTransparency: boolean
  indicators: ProjectIndicator[]
  plannedAmount: number
  project: ProjectDetail
  sections: TransparencySection[]
  utilization: number
  onUpdate: (
    section: TransparencySection,
    patch: Partial<Pick<TransparencySection, 'approvalState' | 'visible'>>,
  ) => void
}) => (
  <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
    <SectionCard
      title="Project information sections"
      description="Toggle public visibility for safe aggregate content."
    >
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.id} className="rounded-sm border border-border bg-surface-subtle p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium text-foreground">{section.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={statusTone(section.approvalState)}>
                  {section.approvalState}
                </StatusBadge>
                {canPublishTransparency ? (
                  <Button
                    className="gap-2"
                    onClick={() => onUpdate(section, { visible: !section.visible })}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {section.visible ? (
                      <ToggleRight className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                    )}
                    {section.visible ? 'Visible' : 'Hidden'}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {canPublishTransparency
                ? (['Draft', 'Pending Review', 'Approved'] as TransparencyApprovalState[]).map(
                    (state) => (
                      <Button
                        key={state}
                        onClick={() => onUpdate(section, { approvalState: state })}
                        size="sm"
                        type="button"
                        variant={section.approvalState === state ? 'default' : 'outline'}
                      >
                        {state}
                      </Button>
                    ),
                  )
                : null}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
    <SectionCard
      title="Preview public content"
      description="No beneficiary-sensitive information is displayed."
      actions={
        <Button asChild className="gap-2" size="sm">
          <Link href={`/projects/${project.id}/transparency/preview`}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Open staff preview
          </Link>
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-sm border border-border bg-surface-subtle p-3">
          <p className="font-medium text-foreground">{project.title}</p>
          <p className="mt-1 text-muted-foreground">
            {project.area} - {project.sector} - {project.period}
          </p>
        </div>
        <div className="rounded-sm border border-border bg-surface-subtle p-3">
          <p className="font-medium text-foreground">Aggregate indicator progress</p>
          <p className="mt-1 text-muted-foreground">
            {indicators.filter((indicator) => indicator.status === 'Met').length} of{' '}
            {indicators.length} indicators met.
          </p>
        </div>
        <div className="rounded-sm border border-border bg-surface-subtle p-3">
          <p className="font-medium text-foreground">Budget summary</p>
          <p className="mt-1 text-muted-foreground">
            {formatCurrency(plannedAmount)} planned allocation; {utilization}% utilization.
          </p>
        </div>
        <p className="rounded-sm border border-dashed border-border bg-surface-subtle p-3 text-muted-foreground">
          Public preview intentionally excludes names, individual beneficiary records, contact
          details, and proof files.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Program Manager and Project Manager can customize the browser-local staff preview. The
          approved anonymous page remains unchanged until a real publishing workflow is connected.
        </p>
      </div>
    </SectionCard>
  </section>
)
