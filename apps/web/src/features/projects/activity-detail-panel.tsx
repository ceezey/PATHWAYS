'use client'

import { AsyncState } from '@/components/pathways/async-state'

import {
  BellRing,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Pencil,
  ReceiptText,
  TrendingUp,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ProgressBar, SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  ActivityProof,
  Indicator,
  JourneyStageConfig,
  ProjectIndicator,
  ProjectTeamMember,
} from '@/types/pathways'

import {
  ActivityBudget,
  type ActivityExpenseEntry,
  ActivityExpenses,
  ActivityIndicators,
  ActivityProgress,
  ActivityTeam,
  PanelSection,
} from './activity-detail-sections'
import { ActivityExpenseDialog, type ExpenseBudgetReference } from './activity-expense-dialog'
import { ActivityExpenseReviewDialog, type PendingExpense } from './activity-expense-review-dialog'
import { ActivityExplainDelayDialog, categoryLabels } from './activity-explain-delay-dialog'
import { ActivityExtensionDialog } from './activity-extension-dialog'
import { ActivityExtensionPanel } from './activity-extension-panel'
import { ActivityProgressDialog } from './activity-progress-dialog'
import { ActivityProofFiles } from './activity-proof-files'
import { ActivityProofReviewDialog } from './activity-proof-review-dialog'
import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'
import { categoryLabel } from './budget-module/budget-math'

type ProofGroup = ActivityProof & { proofIds: string[]; items: ActivityProof[] }

// One card per submitted update: the API returns one proof row per uploaded file.
// The rows are kept so each file shows its own review state and reason.
const groupProofsByUpdate = (proofs: ActivityProof[]) => {
  const groups = new Map<string, ProofGroup>()
  for (const proof of proofs) {
    const names = proof.fileNames?.length ? proof.fileNames : [proof.fileName]
    const group = groups.get(proof.updateId)
    if (group) {
      group.fileNames = [...(group.fileNames ?? []), ...names]
      group.proofIds.push(proof.id)
      group.items.push(proof)
    } else {
      groups.set(proof.updateId, {
        ...proof,
        files: undefined,
        fileNames: names,
        proofIds: [proof.id],
        items: [proof],
      })
    }
  }
  return [...groups.values()]
}

const proofTone = (status: ActivityProof['status']) => {
  if (status === 'Accepted') return 'success'
  if (status === 'Flagged') return 'danger'
  if (status === 'Submitted') return 'warning'
  return 'neutral'
}

const formatProofDate = (value: string) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export const ActivityDetailContent = ({
  activity,
  activityExpenses = [],
  canReadExpenses = false,
  budgetReferences = [],
  canDecideProof,
  canDecideExtension = false,
  focusExtension = false,
  canEdit,
  canLogExpense,
  canReadBudgets = false,
  canRecordProgress = false,
  canSubmitProof,
  canRequestExtension,
  canOpenProof = false,
  canValidateExpense,
  canValidateProof,
  indicatorRows = [],
  indicators,
  journeyStages,
  onActivityChanged,
  onEdit,
  onExpensesChanged = () => {},
  onSubmitProof,
  pendingExpenses = [],
  projectTeam = [],
  requestedExpenseId,
  requestedProofId,
}: {
  activity: Activity
  activityExpenses?: ActivityExpenseEntry[]
  canReadExpenses?: boolean
  budgetReferences?: ExpenseBudgetReference[]
  canDecideProof: boolean
  canDecideExtension?: boolean
  focusExtension?: boolean
  canEdit: boolean
  canLogExpense: boolean
  canReadBudgets?: boolean
  canRecordProgress?: boolean
  canSubmitProof: boolean
  canRequestExtension: boolean
  canOpenProof?: boolean
  canValidateExpense: boolean
  canValidateProof: boolean
  indicatorRows?: ProjectIndicator[]
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  onActivityChanged: (activity: Activity) => void
  projectTeam?: ProjectTeamMember[]
  onEdit: (activity: Activity) => void
  onExpensesChanged?: () => void
  onSubmitProof: (activity: Activity) => void
  pendingExpenses?: PendingExpense[]
  requestedExpenseId?: string
  requestedProofId?: string
}) => {
  const [progressOpen, setProgressOpen] = useState(false)
  const [explainDelayOpen, setExplainDelayOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [extensionOpen, setExtensionOpen] = useState(false)
  const [extensionRefresh, setExtensionRefresh] = useState(0)
  const [expenseReviewTarget, setExpenseReviewTarget] = useState<PendingExpense | null>(null)
  const [reviewTarget, setReviewTarget] = useState<{
    mode: 'validate' | 'decide'
    proof: ActivityProof
  } | null>(null)
  // A role-level grant alone never shows a per-activity action: the server-computed
  // capability (update authority, personal assignment, editable state) must agree too.
  const showEdit = canEdit && activity.capabilities?.canEdit === true
  const showSubmitProof = canSubmitProof && activity.capabilities?.canSubmitProof === true
  const showRecordProgress = canRecordProgress && activity.capabilities?.canRecordProgress === true
  const showExplainDelay =
    activity.capabilities?.canExplainOverdue === true && activity.status === 'Overdue'
  const latestProof = activity.submittedProof.at(-1)
  const correctionRequired = latestProof?.status === 'Flagged'
  const incompleteProof = activity.updateNotes.find((update) => update.proofIncomplete)
  const ownIncompleteProof = Boolean(incompleteProof?.resumeClientUpdateId)

  const connectedIndicators = activity.indicatorIds.map((indicatorId) => {
    const indicator = indicators.find((item) => item.id === indicatorId)
    return {
      id: indicatorId,
      code: indicator?.code ?? indicatorId,
      label: indicator?.label ?? 'Linked indicator',
      row: indicatorRows.find((item) => item.id === indicatorId),
    }
  })
  const journeyStage = journeyStages.find((stage) => stage.id === activity.journeyStageId)
  // Summed from the expenses listed below, so the card and the list cannot disagree.
  const inReviewTotal = canReadExpenses
    ? activityExpenses
        .filter((entry) => entry.status === 'PENDING' || entry.status === 'VERIFIED')
        .reduce((total, entry) => total + entry.amount, 0)
    : null

  return (
    <div className="space-y-5 pb-1">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
        {activity.overdueExplanationNeeded ? (
          <StatusBadge tone="warning">Overdue: explanation needed</StatusBadge>
        ) : null}
        {latestProof ? (
          <StatusBadge tone={proofTone(latestProof.status)}>
            Proof v{groupProofsByUpdate(activity.submittedProof).length} · {latestProof.status}
          </StatusBadge>
        ) : null}
      </div>
      {correctionRequired && showSubmitProof ? (
        <p className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm text-warning">
          <span className="font-semibold">Action needed: </span>A reviewer flagged a document as
          insufficient. Review the proof submissions below and resubmit.
        </p>
      ) : null}
      <PanelSection id={`description-${activity.id}`} title="Description">
        <p className="text-sm leading-6 text-muted-foreground">{activity.description}</p>
      </PanelSection>
      <dl className="grid gap-4 rounded-xl border border-border bg-surface-subtle p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Dates</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(activity.startDate)} to {formatDate(activity.dueDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Beneficiaries reached</dt>
          <dd className="mt-1 font-medium text-foreground">
            {Number.isFinite(activity.beneficiariesReached)
              ? `${activity.beneficiariesReached} of ${activity.targetBeneficiaries}`
              : 'Unavailable'}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Journey stage reference</dt>
          <dd className="mt-1 font-medium text-foreground">
            {journeyStage
              ? `${journeyStage.code} - ${journeyStage.name}`
              : activity.journeyStageId || 'No journey stage linked'}
          </dd>
        </div>
      </dl>
      {activity.status === 'Completed' ? null : (
        <PanelSection id={`progress-${activity.id}`} title="Progress">
          <ActivityProgress activity={activity} />
        </PanelSection>
      )}

      <PanelSection id={`assigned-team-${activity.id}`} title="Project team">
        <ActivityTeam
          assignedTo={activity.assignedTo}
          assignedUserIds={activity.assignedUserIds}
          team={projectTeam}
        />
      </PanelSection>

      <PanelSection
        id={`connected-indicators-${activity.id}`}
        title={`Connected indicators (${connectedIndicators.length})`}
      >
        <ActivityIndicators rows={connectedIndicators} />
      </PanelSection>

      <PanelSection id={`activity-budget-${activity.id}`} title="Activity budget">
        <ActivityBudget
          activity={activity}
          canReadBudgets={canReadBudgets}
          pending={inReviewTotal}
        />
      </PanelSection>

      {canReadExpenses ? (
        <PanelSection id={`activity-expenses-${activity.id}`} title="Logged expenses">
          <ActivityExpenses activityTitle={activity.title} expenses={activityExpenses} />
        </PanelSection>
      ) : null}

      {canValidateExpense && pendingExpenses.length ? (
        <section aria-labelledby={`expense-submissions-${activity.id}`}>
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3
              className="text-sm font-semibold text-foreground"
              id={`expense-submissions-${activity.id}`}
            >
              Submitted expenses for validation
            </h3>
          </div>
          <div className="mt-3 space-y-2">
            {pendingExpenses.map((expense) => (
              <button
                className="flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-background p-3 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={expense.id}
                onClick={() => setExpenseReviewTarget(expense)}
                type="button"
              >
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {categoryLabel(expense.category, activity.title)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {expense.description}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(expense.amount)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby={`proof-history-${activity.id}`}>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground" id={`proof-history-${activity.id}`}>
            Submitted update & proof history
          </h3>
        </div>
        {activity.submittedProof.length > 0 ? (
          <div className="mt-3 space-y-3">
            {groupProofsByUpdate(activity.submittedProof)
              .map((proof, index) => ({ proof, version: index + 1 }))
              .reverse()
              .map(({ proof, version }, reverseIndex) => {
                const isLatest = reverseIndex === 0
                const highlighted = Boolean(
                  requestedProofId &&
                    (proof.proofIds.includes(requestedProofId) ||
                      proof.updateId === requestedProofId),
                )
                const proofUpdate = activity.updateNotes.find(
                  (update) => update.id === proof.updateId,
                )
                const returnedUpdate = proof.status === 'Flagged' ? proofUpdate : undefined
                const progress = proofUpdate?.progress ?? activity.progress
                return (
                  <article
                    className={`rounded-xl border bg-background p-4 ${
                      highlighted ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                    }`}
                    data-update-id={proof.updateId}
                    id={`activity-proof-${proof.id}`}
                    key={proof.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Version {version} · {progress}%
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Submitted {formatProofDate(proof.submittedAt)}
                        </p>
                      </div>
                      <StatusBadge tone={proofTone(proof.status)}>{proof.status}</StatusBadge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {proof.note || 'No update note recorded.'}
                    </p>
                    <div className="mt-3">
                      <ActivityProofFiles
                        activityId={activity.id}
                        canOpen={canOpenProof}
                        projectId={activity.projectId}
                        proof={proof}
                      />
                    </div>
                    {proof.status === 'Flagged' ? (
                      <div className="mt-3 rounded-xl border border-danger/25 bg-danger-subtle p-3 text-sm text-danger">
                        <p>This proof was returned for correction.</p>
                        {returnedUpdate?.reviewReason ? (
                          <p className="mt-1">
                            {returnedUpdate.reviewedBy
                              ? `Returned by ${returnedUpdate.reviewedBy}: `
                              : 'Return reason: '}
                            {returnedUpdate.reviewReason}
                          </p>
                        ) : null}
                        {isLatest && showSubmitProof && activity.status !== 'Completed' ? (
                          <Button
                            className="mt-3 gap-2"
                            onClick={() => onSubmitProof(activity)}
                            size="sm"
                            type="button"
                          >
                            <UploadCloud className="h-4 w-4" aria-hidden="true" />
                            Submit correction
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {isLatest &&
                    canValidateProof &&
                    proof.status === 'Submitted' &&
                    activity.storedStatus !== 'FOR_REVIEW' ? (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Waiting for the officer to finish uploading this proof. It can be reviewed
                        once every file is submitted.
                      </p>
                    ) : null}
                    {isLatest &&
                    canValidateProof &&
                    proof.status === 'Submitted' &&
                    activity.storedStatus === 'FOR_REVIEW' ? (
                      <Button
                        className="mt-4 gap-2"
                        onClick={() => setReviewTarget({ mode: 'validate', proof })}
                        size="sm"
                        type="button"
                      >
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        Review & validate proof
                      </Button>
                    ) : null}
                    {isLatest && canDecideProof && proof.status === 'Accepted' ? (
                      <Button
                        className="mt-4 gap-2"
                        onClick={() => setReviewTarget({ mode: 'decide', proof })}
                        size="sm"
                        type="button"
                      >
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                        Review decision
                      </Button>
                    ) : null}
                  </article>
                )
              })}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {activity.updateNotes.length > 0
              ? 'No proof has been submitted.'
              : 'No update or proof has been submitted.'}
          </p>
        )}
      </section>

      {activity.updateNotes.length > 0 ? (
        <section aria-labelledby={`update-history-${activity.id}`}>
          <h3
            className="text-sm font-semibold text-foreground"
            id={`update-history-${activity.id}`}
          >
            Notes
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[...activity.updateNotes].reverse().map((update) => (
              <li
                className="relative border-l-2 border-border py-1 pl-4 before:absolute before:-left-[5px] before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-primary"
                key={update.id}
              >
                <span className="font-medium text-foreground">{update.progress}%</span> ·{' '}
                {update.note}
                {update.kind === 'progress' ? (
                  <span className="ml-1 text-xs">
                    (progress note{update.status === 'Submitted' ? ', awaiting review' : ''})
                  </span>
                ) : null}
                {update.kind === 'progress' &&
                canValidateProof &&
                update.status === 'Submitted' &&
                activity.storedStatus === 'IN_PROGRESS' ? (
                  <Button
                    className="mt-2 gap-2"
                    onClick={() =>
                      setReviewTarget({
                        mode: 'validate',
                        proof: {
                          id: update.id,
                          updateId: update.id,
                          fileName: '',
                          status: 'Submitted',
                          submittedAt: update.submittedAt,
                          submittedBy: update.submittedBy,
                          updateUpdatedAt: update.updatedAt,
                          note: update.note,
                        },
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    Review progress
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activity.overdueExplanations.length > 0 || activity.status === 'Overdue' ? (
        <section aria-labelledby={`overdue-explanations-${activity.id}`}>
          <h3
            className="text-sm font-semibold text-foreground"
            id={`overdue-explanations-${activity.id}`}
          >
            Overdue explanations
          </h3>
          {activity.overdueExplanations.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {activity.overdueExplanations.map((entry) => (
                <li
                  className="relative border-l-2 border-border py-1 pl-4 before:absolute before:-left-[5px] before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-primary"
                  key={entry.id}
                >
                  <span className="font-medium text-foreground">
                    {categoryLabels[entry.category]}
                  </span>{' '}
                  · {formatDate(entry.recordedAt)} · {entry.actorName}
                  <p className="mt-1 leading-6">{entry.explanation}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              None yet.
            </p>
          )}
        </section>
      ) : null}

      {incompleteProof && ownIncompleteProof && showSubmitProof ? (
        <output className="block rounded-xl border border-warning/40 bg-warning-subtle p-3 text-sm text-foreground">
          Your proof upload was not finished, so this update is not with M&E yet. Choose Resume
          proof upload, then select the same files again.
        </output>
      ) : null}
      {incompleteProof && !ownIncompleteProof && canValidateProof ? (
        <output className="block rounded-xl border border-border bg-surface-subtle p-3 text-sm text-muted-foreground">
          Proof upload not finished. {incompleteProof.submittedBy} has an update waiting for its
          files to upload. It can be reviewed once every file is submitted.
        </output>
      ) : null}
      {correctionRequired && showSubmitProof ? (
        <p className="rounded-xl border border-danger/25 bg-danger-subtle p-3 text-sm text-danger">
          A correction is required. Review the return reason above, then submit a new proof version.
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-1 grid grid-cols-1 gap-2 border-t border-border bg-card/95 px-1 pb-1 pt-4 backdrop-blur">
        {showEdit ? (
          <Button
            className="gap-2"
            onClick={() => onEdit(activity)}
            type="button"
            variant="outline"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit activity
          </Button>
        ) : null}
        {showSubmitProof && activity.status !== 'Completed' ? (
          <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            {ownIncompleteProof ? 'Resume proof upload' : 'Submit Update & Proof'}
          </Button>
        ) : null}
        {showRecordProgress && activity.storedStatus === 'IN_PROGRESS' ? (
          <Button
            className="gap-2"
            onClick={() => setProgressOpen(true)}
            type="button"
            variant="outline"
          >
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Record progress
          </Button>
        ) : null}
        {showExplainDelay ? (
          <Button
            className="gap-2"
            onClick={() => setExplainDelayOpen(true)}
            type="button"
            variant="outline"
          >
            <BellRing className="h-4 w-4" aria-hidden="true" />
            Explain delay
          </Button>
        ) : null}
        {canLogExpense ? (
          <Button
            className="gap-2"
            onClick={() => setExpenseOpen(true)}
            type="button"
            variant="outline"
          >
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
            Log expense
          </Button>
        ) : null}
        {canRequestExtension &&
        activity.status !== 'Completed' &&
        activity.storedStatus !== 'CANCELLED' ? (
          <Button
            className="gap-2"
            onClick={() => setExtensionOpen(true)}
            type="button"
            variant="outline"
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Request an extension
          </Button>
        ) : null}
      </div>

      <ActivityExtensionPanel
        activity={activity}
        canDecide={canDecideExtension}
        canVerify={canValidateProof}
        focus={focusExtension}
        onDecided={() => {
          void pathwaysClient
            .getActivity(activity.projectId, activity.id)
            .then(onActivityChanged)
            .catch(() => {})
        }}
        refreshKey={extensionRefresh}
      />
      {extensionOpen ? (
        <ActivityExtensionDialog
          activity={activity}
          onOpenChange={setExtensionOpen}
          onRequested={() => setExtensionRefresh((value) => value + 1)}
          open={extensionOpen}
        />
      ) : null}
      {progressOpen ? (
        <ActivityProgressDialog
          activity={activity}
          onOpenChange={setProgressOpen}
          onRecorded={onActivityChanged}
          open={progressOpen}
        />
      ) : null}
      {explainDelayOpen ? (
        <ActivityExplainDelayDialog
          activity={activity}
          onOpenChange={setExplainDelayOpen}
          onRecorded={onActivityChanged}
          open={explainDelayOpen}
        />
      ) : null}
      <ActivityExpenseDialog
        activity={activity}
        budgetReferences={budgetReferences}
        onOpenChange={setExpenseOpen}
        onSubmitted={onExpensesChanged}
        open={expenseOpen}
      />
      <ActivityExpenseReviewDialog
        expense={expenseReviewTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setExpenseReviewTarget(null)
        }}
        onReviewed={onExpensesChanged}
      />
      <ActivityProofReviewDialog
        activity={activity}
        mode={reviewTarget?.mode ?? 'validate'}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReviewTarget(null)
        }}
        onUpdated={onActivityChanged}
        open={Boolean(reviewTarget)}
        proof={reviewTarget?.proof ?? null}
      />
    </div>
  )
}

export const ActivityDetailPanel = ({
  activity,
  activityExpenses = [],
  canReadExpenses = false,
  budgetReferences = [],
  canDecideProof,
  canDecideExtension = false,
  focusExtension = false,
  canEdit,
  canLogExpense,
  canReadBudgets = false,
  loading = false,
  canRecordProgress = false,
  canSubmitProof,
  canRequestExtension,
  canOpenProof = false,
  canValidateExpense,
  canValidateProof,
  indicatorRows = [],
  indicators,
  journeyStages,
  onActivityChanged,
  onEdit,
  onExpensesChanged = () => {},
  onOpenChange,
  onSubmitProof,
  open,
  pendingExpenses = [],
  projectTeam = [],
  requestedExpenseId,
  requestedProofId,
}: {
  activity: Activity | null
  activityExpenses?: ActivityExpenseEntry[]
  canReadExpenses?: boolean
  budgetReferences?: ExpenseBudgetReference[]
  canDecideProof: boolean
  canDecideExtension?: boolean
  focusExtension?: boolean
  canEdit: boolean
  canLogExpense: boolean
  canReadBudgets?: boolean
  loading?: boolean
  canRecordProgress?: boolean
  canSubmitProof: boolean
  canRequestExtension: boolean
  canOpenProof?: boolean
  canValidateExpense: boolean
  canValidateProof: boolean
  indicatorRows?: ProjectIndicator[]
  indicators: Indicator[]
  journeyStages: JourneyStageConfig[]
  onActivityChanged: (activity: Activity) => void
  onEdit: (activity: Activity) => void
  onExpensesChanged?: () => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
  open: boolean
  pendingExpenses?: PendingExpense[]
  projectTeam?: ProjectTeamMember[]
  requestedExpenseId?: string
  requestedProofId?: string
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedActivityId = activity?.id

  useEffect(() => {
    if (!open || !requestedProofId || !loadedActivityId) return
    const frame = window.requestAnimationFrame(() => {
      document
      const target =
        document.getElementById(`activity-proof-${requestedProofId}`) ??
        document.querySelector(`[data-update-id="${CSS.escape(requestedProofId)}"]`)
      target?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, requestedProofId, loadedActivityId])

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      {activity ? (
        <SidePanel
          containedScroll
          description={`${activity.status} activity detail`}
          onOverlayWheel={(event) => {
            const scrollArea = scrollRef.current
            if (!scrollArea || scrollArea.scrollHeight <= scrollArea.clientHeight) return
            event.preventDefault()
            scrollArea.scrollBy({ top: event.deltaY, behavior: 'auto' })
          }}
          scrollRef={scrollRef}
          title={activity.title}
        >
          <ActivityDetailContent
            activity={activity}
            activityExpenses={activityExpenses}
            canReadExpenses={canReadExpenses}
            budgetReferences={budgetReferences}
            canDecideProof={canDecideProof}
            canDecideExtension={canDecideExtension}
            focusExtension={focusExtension}
            canEdit={canEdit}
            canLogExpense={canLogExpense}
            canReadBudgets={canReadBudgets}
            canRecordProgress={canRecordProgress}
            canSubmitProof={canSubmitProof}
            canRequestExtension={canRequestExtension}
            canOpenProof={canOpenProof}
            canValidateExpense={canValidateExpense}
            canValidateProof={canValidateProof}
            indicatorRows={indicatorRows}
            indicators={indicators}
            journeyStages={journeyStages}
            onActivityChanged={onActivityChanged}
            onEdit={onEdit}
            onExpensesChanged={onExpensesChanged}
            onSubmitProof={onSubmitProof}
            pendingExpenses={pendingExpenses}
            projectTeam={projectTeam}
            requestedExpenseId={requestedExpenseId}
            requestedProofId={requestedProofId}
          />
        </SidePanel>
      ) : loading ? (
        <SidePanel description="Loading the current activity record." title="Activity detail">
          <AsyncState
            description="Fetching the activity record, proofs and expenses."
            status="loading"
            title="Loading activity"
          />
        </SidePanel>
      ) : null}
    </Sheet>
  )
}
