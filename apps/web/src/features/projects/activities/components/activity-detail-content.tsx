'use client'

import { ReceiptText } from 'lucide-react'
import { useState } from 'react'

import { StatusBadge } from '@/components/pathways'
import { activitiesClient } from '@/lib/api/activities'
import type {
  Activity,
  ActivityProof,
  Indicator,
  JourneyStageConfig,
  ProjectTeamMember,
} from '@/types/pathways'
import type { IndicatorResponse } from '@pathways/shared'

import { categoryLabel } from '../../budget/budget.utils'
import {
  ActivityExpenseDialog,
  type ExpenseBudgetReference,
} from '../../budget/components/activity-expense-dialog'
import {
  ActivityExpenseReviewDialog,
  type PendingExpense,
} from '../../budget/components/activity-expense-review-dialog'
import { activityStatusTone, formatCurrency, formatDate } from '../activities.utils'
import {
  ActivityBudget,
  type ActivityExpenseEntry,
  ActivityExpenses,
  ActivityIndicators,
  ActivityProgress,
  ActivityTeam,
  PanelSection,
} from './activity-detail-sections'
import { ActivityExplainDelayDialog } from './activity-explain-delay-dialog'
import { ActivityExtensionDialog } from './activity-extension-dialog'
import { ActivityExtensionPanel } from './activity-extension-panel'
import { ActivityProgressDialog } from './activity-progress-dialog'
import { ActivityProofReviewDialog } from './activity-proof-review-dialog'

import { groupProofsByUpdate, proofTone } from '../activity-proof.utils'
import { ActivityDetailActions } from './activity-detail-actions'
import { ActivityHistory } from './activity-history'

export const ActivityDetailContent = ({
  activity,
  activityExpenses = [],
  canReadExpenses = false,
  budgetReferences = [],
  budgetReferencesLoading = false,
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
  budgetReferencesLoading?: boolean
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
  indicatorRows?: IndicatorResponse[]
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

      {canReadBudgets ? (
        <PanelSection id={`activity-budget-${activity.id}`} title="Activity budget">
          <ActivityBudget activity={activity} canReadBudgets pending={inReviewTotal} />
        </PanelSection>
      ) : null}

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

      <ActivityHistory
        activity={activity}
        canDecideProof={canDecideProof}
        canOpenProof={canOpenProof}
        canValidateProof={canValidateProof}
        onSubmitProof={onSubmitProof}
        requestedProofId={requestedProofId}
        setReviewTarget={setReviewTarget}
        showSubmitProof={showSubmitProof}
      />
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
      <ActivityDetailActions
        activity={activity}
        canLogExpense={canLogExpense}
        canRequestExtension={canRequestExtension}
        onEdit={onEdit}
        onSubmitProof={onSubmitProof}
        ownIncompleteProof={ownIncompleteProof}
        setExpenseOpen={setExpenseOpen}
        setExplainDelayOpen={setExplainDelayOpen}
        setExtensionOpen={setExtensionOpen}
        setProgressOpen={setProgressOpen}
        showEdit={showEdit}
        showExplainDelay={showExplainDelay}
        showRecordProgress={showRecordProgress}
        showSubmitProof={showSubmitProof}
      />

      <ActivityExtensionPanel
        activity={activity}
        canDecide={canDecideExtension}
        canVerify={canValidateProof}
        focus={focusExtension}
        onDecided={() => {
          void activitiesClient
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
        budgetReferencesLoading={budgetReferencesLoading}
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
