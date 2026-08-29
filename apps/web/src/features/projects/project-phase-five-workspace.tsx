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
  DialogShell,
  EmptyState,
  ProgressBar,
  SectionCard,
  StatusBadge,
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
import type { DisplayLabelKey } from '@/constants/display-labels'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useDisplayLabels } from '@/hooks/use-display-labels'
import { can } from '@/lib/rbac/can'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  AlertRecord,
  BudgetRecord,
  EvaluationRecord,
  EvidenceRecord,
  EvidenceReviewStatus,
  ExpenseRecord,
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
import {
  addIndicatorSchema,
  annotationSchema,
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

const viewLabelKeys: Record<PhaseFiveWorkspaceView, DisplayLabelKey> = {
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
  indicator.target > 0 ? Math.min(100, Math.round((indicator.actual / indicator.target) * 100)) : 0

const today = () => new Date().toISOString().slice(0, 10)

const fieldError = (message: string) =>
  toast.error('Check the form fields.', {
    description: message,
  })

const backendNotConfigured = (action: string) =>
  toast.error(`${action} is not configured.`, {
    description: 'Connect the corresponding backend service before saving this change.',
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
  <textarea
    className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
  const { labels } = useDisplayLabels()
  const { role } = useCurrentRole()
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
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
    let mounted = true
    setLoading(true)
    setError(false)

    if (!role) {
      setLoading(false)
      setError(true)
      return () => {
        mounted = false
      }
    }

    Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getEvidence(projectId),
      pathwaysClient.getProjectIndicators(projectId),
      pathwaysClient.getEvaluation(projectId).catch((evaluationError) => {
        if (
          evaluationError instanceof PathwaysClientError &&
          ['not_configured', 'not_found'].includes(evaluationError.code)
        ) {
          return null
        }

        throw evaluationError
      }),
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
        },
      )
      .catch(() => {
        if (mounted) {
          setError(true)
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [projectId, role])

  const projectAlerts = alerts
  const projectRecommendations = useMemo(() => {
    const projectAlertIds = new Set(projectAlerts.map((alert) => alert.id))
    return recommendations.filter((recommendation) => projectAlertIds.has(recommendation.alertId))
  }, [projectAlerts, recommendations])

  const plannedAmount = budgets[0]?.plannedAmount ?? 0
  const remainingBudget = calculateRemainingBudget(plannedAmount, actualSpending)
  const utilization = plannedAmount > 0 ? Math.round((actualSpending / plannedAmount) * 100) : 0
  const expenseTotal = calculateExpenseTotal(expenses)
  const canConfigureWeights = role ? can(role, 'monitor_evaluate.full') : false
  const canReviewEvidence = role ? can(role, 'evidence.review') : false
  const canAddIndicator = role ? can(role, 'indicators.manage') : false
  const canSubmitFormalEvaluation = role ? can(role, 'evaluation.formal.submit') : false
  const canLogRecommendationOutcome = role ? can(role, 'alerts.outcome.log') : false
  const canLogExpense = role ? can(role, 'budget.expense.log') : false
  const canVerifyExpense = role ? can(role, 'budget.expense.verify') : false
  const canApproveExpense = role ? can(role, 'budget.expense.approve') : false
  const canPublishTransparency = role ? can(role, 'transparency.publish') : false
  const heading = {
    ...viewTitles[view],
    title: labels[viewLabelKeys[view]],
  }

  const updateEvidenceStatus = (record: EvidenceRecord, status: EvidenceReviewStatus) => {
    if (!canReviewEvidence) {
      toast.error('Evidence review is not available for this role.')
      return
    }

    void record
    void status
    backendNotConfigured('Evidence review')
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

    backendNotConfigured('Indicator creation')
  }

  const addAnnotation = () => {
    const result = annotationSchema.safeParse(formState)

    if (!result.success || !evaluation) {
      fieldError(result.error?.issues[0]?.message ?? 'Invalid annotation.')
      return
    }

    backendNotConfigured('Evaluation annotation')
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

    backendNotConfigured('Formal evaluation submission')
  }

  const updateWeight = (weightId: string, value: number) => {
    if (!evaluation) {
      return
    }

    void weightId
    void value
    backendNotConfigured('Evaluation weight updates')
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

    backendNotConfigured('Recommendation outcome logging')
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

    backendNotConfigured('Expense logging')
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

    void expense
    void rejectionReason
    backendNotConfigured(`Expense ${liquidationStatus.toLowerCase()}`)
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

    void section
    void patch
    backendNotConfigured('Transparency publishing')
  }

  if (loading) {
    return (
      <EmptyState
        description="Loading the project workspace tab."
        icon={Loader2}
        title="Loading workspace"
      />
    )
  }

  if (error || !project) {
    return (
      <>
        <PageHeader
          eyebrow={labels.projectWorkspace}
          title="Workspace unavailable"
          description={
            role
              ? 'This project tab could not be loaded. The backend may not be configured yet.'
              : 'A verified staff identity is required before project workspace data can be loaded.'
          }
          actions={
            <Button asChild variant="outline">
              <Link href="/projects">Back to Projects</Link>
            </Button>
          }
        />
        <EmptyState
          description="Return to the project directory and open another project."
          icon={FileText}
          title="No workspace data"
        />
      </>
    )
  }

  return (
    <>
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
      {view === 'monitor-evaluate' && !evaluation ? (
        <EmptyState
          description="Evaluation data will appear after an evaluation record is available from the backend."
          icon={FileText}
          title="No evaluation record"
        />
      ) : null}
      {view === 'budget' ? (
        <BudgetView
          actualSpending={actualSpending}
          alerts={projectAlerts}
          expenseTotal={expenseTotal}
          expenses={expenses}
          hasBudget={budgets.length > 0}
          outcomes={outcomes}
          plannedAmount={plannedAmount}
          recommendations={projectRecommendations}
          remainingBudget={remainingBudget}
          utilization={utilization}
          onApproveExpense={(expense) => updateExpenseStatus(expense, 'Approved')}
          canApproveExpense={canApproveExpense}
          canLogExpense={canLogExpense}
          canLogRecommendationOutcome={canLogRecommendationOutcome}
          canVerifyExpense={canVerifyExpense}
          onLogExpense={() => {
            setFormState({ expenseDate: today() })
            setReceiptFiles([])
            setExpenseOpen(true)
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
        description="File content is unavailable until approved storage retrieval is configured."
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
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Placeholder preview for {previewEvidence.fileName}
            </div>
          </div>
        ) : null}
      </SimpleDialog>

      <SimpleDialog
        description="Define an indicator for this project. Saving requires backend configuration."
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
              evidence quality. The score remains human-reviewed and requires backend persistence.
            </p>
            {evaluation.components.map((component) => (
              <div key={component.id} className="rounded-lg border border-border bg-background p-3">
                <p className="font-medium text-foreground">{component.label}</p>
                <p>{component.value}% weight in the current evaluation model.</p>
              </div>
            ))}
          </div>
        ) : null}
      </SimpleDialog>

      <SimpleDialog
        description="Save a formal progress review after evaluation persistence is configured."
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
        description="Record an expense after budget persistence and receipt storage are configured."
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
            <ul className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
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
        description="Provide a rejection reason. Saving requires budget workflow persistence."
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
      description="Review submitted proof. Status changes require backend persistence."
    >
      <div className="space-y-3">
        {evidence.length > 0 ? (
          evidence.map((record) => (
            <div key={record.id} className="rounded-lg border border-border bg-background p-4">
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
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No evidence records are available for this project.
          </p>
        )}
      </div>
    </SectionCard>
    <SectionCard title="Report records" description="Generated report references for the project.">
      <div className="space-y-3">
        {reports.length > 0 ? (
          reports.map((report) => (
            <div
              key={report.id}
              className="rounded-lg border border-border bg-background p-3 text-sm"
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
      {indicators.length > 0 ? (
        indicators.map((indicator) => (
          <div key={indicator.id} className="rounded-lg border border-border bg-background p-4">
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
                      activities.find((activity) => activity.id === activityId)?.title ??
                      activityId,
                  )
                  .join(', ') || 'None linked yet'}
              </span>
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground xl:col-span-2">
          No indicator records are available for this project.
        </p>
      )}
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
        <div className="rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
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
            ? 'Weight changes require evaluation backend persistence.'
            : 'View-only for this role.'
        }
      >
        <div className="space-y-3">
          {evaluation.components.length > 0 ? (
            evaluation.components.map((component) => (
              <div
                key={component.id}
                className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_120px]"
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
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No evaluation weights are configured.</p>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Annotations" description="Human review notes.">
        <div className="space-y-3">
          {evaluation.annotations.length > 0 ? (
            evaluation.annotations.map((annotation) => (
              <div
                key={annotation.id}
                className="rounded-lg border border-border bg-background p-3 text-sm"
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
                className="rounded-lg border border-border bg-background p-3 text-sm"
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
  canApproveExpense,
  canLogExpense,
  canLogRecommendationOutcome,
  canVerifyExpense,
  expenseTotal,
  expenses,
  hasBudget,
  outcomes,
  plannedAmount,
  recommendations,
  remainingBudget,
  utilization,
  onApproveExpense,
  onLogExpense,
  onOutcome,
  onRejectExpense,
  onVerifyExpense,
}: {
  actualSpending: number
  alerts: AlertRecord[]
  canApproveExpense: boolean
  canLogExpense: boolean
  canLogRecommendationOutcome: boolean
  canVerifyExpense: boolean
  expenseTotal: number
  expenses: ExpenseRecord[]
  hasBudget: boolean
  outcomes: RecommendationOutcomeRecord[]
  plannedAmount: number
  recommendations: RecommendationRecord[]
  remainingBudget: number
  utilization: number
  onApproveExpense: (expense: ExpenseRecord) => void
  onLogExpense: () => void
  onOutcome: (recommendation: RecommendationRecord) => void
  onRejectExpense: (expense: ExpenseRecord) => void
  onVerifyExpense: (expense: ExpenseRecord) => void
}) => (
  <div className="space-y-4">
    {hasBudget ? (
      <>
        <section className="grid gap-4 lg:grid-cols-4">
          {[
            ['Planned allocation', formatCurrency(plannedAmount)],
            ['Actual spending', formatCurrency(actualSpending)],
            ['Remaining balance', formatCurrency(remainingBudget)],
            ['Expense ledger total', formatCurrency(expenseTotal)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </section>
        <SectionCard
          title="Budget utilization"
          description="Actual spending against the available planned allocation."
        >
          <ProgressBar
            label="Utilization"
            tone={utilization > 85 ? 'warning' : 'info'}
            value={utilization}
          />
        </SectionCard>
      </>
    ) : (
      <EmptyState
        description="Budget totals will appear after an allocation is available from the backend."
        icon={Receipt}
        title="No budget record"
      />
    )}
    <section className="grid gap-4 xl:grid-cols-2">
      <SectionCard
        title="Budget alerts"
        description="Alerts and recommendation prompts for review."
      >
        <div className="space-y-3">
          {alerts.length > 0 ? (
            alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{alert.title}</p>
                  <StatusBadge tone={statusTone(alert.severity)}>{alert.severity}</StatusBadge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{alert.category}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No budget alerts for this project.</p>
          )}
        </div>
      </SectionCard>
      <SectionCard
        title="Recommendation prompts"
        description="Human-reviewed recommendation outcomes."
      >
        <div className="space-y-3">
          {recommendations.length > 0 ? (
            recommendations.map((recommendation) => {
              const outcome = outcomes.find((item) => item.recommendationId === recommendation.id)

              return (
                <div
                  key={recommendation.id}
                  className="rounded-lg border border-border bg-background p-3"
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
      description="Expense and liquidation records supplied by the budget service."
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
        {expenses.length > 0 ? (
          expenses.map((expense) => (
            <div
              key={expense.id}
              className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[1fr_0.6fr_0.6fr_0.5fr_auto]"
            >
              <div className="min-w-0">
                <p className="break-words font-medium text-foreground">{expense.description}</p>
                <p className="mt-1 text-sm text-muted-foreground">{expense.submitter}</p>
              </div>
              <div className="text-sm">
                <p className="text-muted-foreground">Dates</p>
                <p className="mt-1 font-medium text-foreground">
                  {formatDate(expense.expenseDate)}
                </p>
                <p className="text-muted-foreground">
                  Submitted {formatDate(expense.submittedDate)}
                </p>
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
                <p className="text-sm text-danger lg:col-span-5">
                  Reason: {expense.rejectionReason}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No expense records are available for this project.
          </p>
        )}
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
        {sections.length > 0 ? (
          sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-border bg-background p-4">
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
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No public information sections are configured for this project.
          </p>
        )}
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
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="font-medium text-foreground">{project.title}</p>
          <p className="mt-1 text-muted-foreground">
            {project.area} - {project.sector} - {project.period}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="font-medium text-foreground">Aggregate indicator progress</p>
          <p className="mt-1 text-muted-foreground">
            {indicators.filter((indicator) => indicator.status === 'Met').length} of{' '}
            {indicators.length} indicators met.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="font-medium text-foreground">Budget summary</p>
          <p className="mt-1 text-muted-foreground">
            {formatCurrency(plannedAmount)} planned allocation; {utilization}% utilization.
          </p>
        </div>
        <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-muted-foreground">
          Public preview intentionally excludes names, individual beneficiary records, contact
          details, and proof files.
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          Program Manager and Project Manager can customize a temporary unsaved staff preview. The
          approved anonymous page remains unchanged until a publishing workflow is connected.
        </p>
      </div>
    </SectionCard>
  </section>
)
