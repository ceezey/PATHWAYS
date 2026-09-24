'use client'

import { BellRing, ClipboardCheck, FileText, Pencil, ReceiptText, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ProgressBar, SidePanel, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { Activity, ActivityProof, Indicator } from '@/types/pathways'

import { ActivityExpenseDialog } from './activity-expense-dialog'
import { ActivityExpenseReviewDialog, type PendingExpense } from './activity-expense-review-dialog'
import { ActivityProofFiles } from './activity-proof-files'
import { ActivityProofReviewDialog } from './activity-proof-review-dialog'
import { activityStatusTone, formatCurrency, formatDate } from './activity-utils'
import { describeTargetGoalComparison } from './target-goal-presentation'

const proofVersion = (activity: Activity, proof: ActivityProof) =>
  activity.submittedProof.indexOf(proof) + 1

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
  canDecideProof,
  canEdit,
  canLogExpense,
  canSubmitProof,
  canRequestExtension,
  canValidateExpense,
  canValidateProof,
  indicators,
  onActivityChanged,
  onEdit,
  onSubmitProof,
  requestedExpenseId,
  requestedProofId,
}: {
  activity: Activity
  canDecideProof: boolean
  canEdit: boolean
  canLogExpense: boolean
  canSubmitProof: boolean
  canRequestExtension: boolean
  canValidateExpense: boolean
  canValidateProof: boolean
  indicators: Indicator[]
  onActivityChanged: (activity: Activity) => void
  onEdit: (activity: Activity) => void
  onSubmitProof: (activity: Activity) => void
  requestedExpenseId?: string
  requestedProofId?: string
}) => {
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [expenseReviewTarget, setExpenseReviewTarget] = useState<PendingExpense | null>(null)
  const [reviewTarget, setReviewTarget] = useState<{
    mode: 'validate' | 'decide'
    proof: ActivityProof
  } | null>(null)
  const latestProof = activity.submittedProof.at(-1)
  const correctionRequired = latestProof?.status === 'Flagged'
  const pendingExpenses: PendingExpense[] = []

  const connectedIndicators = activity.indicatorIds.map((indicatorId) => {
    const indicator = indicators.find((item) => item.id === indicatorId)
    return indicator ?? { id: indicatorId, code: indicatorId, label: 'Linked indicator' }
  })

  return (
    <div className="space-y-5 pb-1">
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={activityStatusTone(activity.status)}>{activity.status}</StatusBadge>
        {latestProof ? (
          <StatusBadge tone={proofTone(latestProof.status)}>
            Proof v{proofVersion(activity, latestProof)} · {latestProof.status}
          </StatusBadge>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{activity.description}</p>
      {activity.status !== 'Completed' ? (
        <ProgressBar
          label="Activity progress"
          tone={
            activity.status === 'Overdue' ? 'danger' : activity.progress >= 80 ? 'success' : 'info'
          }
          value={activity.progress}
        />
      ) : null}
      <dl className="grid gap-4 rounded-sm border border-border bg-surface-subtle p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Dates</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatDate(activity.startDate)} to {formatDate(activity.dueDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Beneficiaries reached</dt>
          <dd className="mt-1 font-medium text-foreground">
            {activity.beneficiariesReached} of {activity.targetBeneficiaries}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Project target comparison</dt>
          <dd className="mt-1 font-medium text-foreground">
            {describeTargetGoalComparison(activity.projectGoalComparison)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Allocated budget</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatCurrency(activity.budgetAllocation)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Logged budget</dt>
          <dd className="mt-1 font-medium text-foreground">
            {formatCurrency(activity.budgetLogged)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Assigned users</dt>
          <dd className="mt-1 font-medium text-foreground">{activity.assignedTo.join(', ')}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Journey stage reference</dt>
          <dd className="mt-1 font-medium text-foreground">{activity.journeyStageId}</dd>
        </div>
      </dl>

      <section aria-labelledby={`connected-indicators-${activity.id}`}>
        <h3
          className="text-sm font-semibold text-foreground"
          id={`connected-indicators-${activity.id}`}
        >
          Connected Indicators
        </h3>
        <div className="mt-3 grid gap-3">
          {connectedIndicators.map((indicator) => (
            <article
              className="border-l-4 border-l-primary bg-primary-subtle px-4 py-3"
              key={indicator.id}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {indicator.code}
              </p>
              <p className="mt-1 text-sm font-medium leading-5 text-foreground">
                {indicator.label}
              </p>
            </article>
          ))}
        </div>
      </section>

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
                    {expense.category}
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
            {[...activity.submittedProof].reverse().map((proof, reverseIndex) => {
              const isLatest = reverseIndex === 0
              const highlighted = proof.id === requestedProofId
              const progress =
                activity.updateNotes.find((update) => update.id === proof.updateId)?.progress ??
                activity.progress
              return (
                <article
                  className={`rounded-sm border bg-background p-4 ${
                    highlighted ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                  }`}
                  id={`activity-proof-${proof.id}`}
                  key={proof.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Version {proofVersion(activity, proof)} · {progress}%
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
                    <ActivityProofFiles proof={proof} />
                  </div>
                  {proof.status === 'Flagged' ? (
                    <p className="mt-3 rounded-sm border border-danger/25 bg-danger-subtle p-3 text-sm text-danger">
                      This proof was returned for correction.
                    </p>
                  ) : null}
                  {isLatest && canValidateProof && proof.status === 'Submitted' ? (
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
          <p className="mt-3 rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
            No update or proof has been submitted.
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
                className="rounded-sm border border-border bg-surface-subtle px-3 py-2"
                key={update.id}
              >
                <span className="font-medium text-foreground">{update.progress}%</span> ·{' '}
                {update.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {correctionRequired && canSubmitProof ? (
        <p className="rounded-sm border border-danger/25 bg-danger-subtle p-3 text-sm text-danger">
          A correction is required. Review the return reason above, then submit a new proof version.
        </p>
      ) : null}
      <div className="sticky bottom-0 -mx-1 grid grid-cols-1 gap-2 border-t border-border bg-card/95 px-1 pb-1 pt-4 backdrop-blur">
        {canEdit ? (
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
        {canSubmitProof && activity.status !== 'Completed' ? (
          <Button className="gap-2" onClick={() => onSubmitProof(activity)} type="button">
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            Submit Update & Proof
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
        {canRequestExtension && activity.status !== 'Completed' ? (
          <Button className="gap-2" disabled type="button" variant="outline">
            <BellRing className="h-4 w-4" aria-hidden="true" />
            Request an extension
          </Button>
        ) : null}
      </div>

      <ActivityExpenseDialog activity={activity} onOpenChange={setExpenseOpen} open={expenseOpen} />
      <ActivityExpenseReviewDialog
        expense={expenseReviewTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setExpenseReviewTarget(null)
        }}
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
  canDecideProof,
  canEdit,
  canLogExpense,
  canSubmitProof,
  canRequestExtension,
  canValidateExpense,
  canValidateProof,
  indicators,
  onActivityChanged,
  onEdit,
  onOpenChange,
  onSubmitProof,
  open,
  requestedExpenseId,
  requestedProofId,
}: {
  activity: Activity | null
  canDecideProof: boolean
  canEdit: boolean
  canLogExpense: boolean
  canSubmitProof: boolean
  canRequestExtension: boolean
  canValidateExpense: boolean
  canValidateProof: boolean
  indicators: Indicator[]
  onActivityChanged: (activity: Activity) => void
  onEdit: (activity: Activity) => void
  onOpenChange: (open: boolean) => void
  onSubmitProof: (activity: Activity) => void
  open: boolean
  requestedExpenseId?: string
  requestedProofId?: string
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !requestedProofId) return
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`activity-proof-${requestedProofId}`)
        ?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, requestedProofId])

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
            canDecideProof={canDecideProof}
            canEdit={canEdit}
            canLogExpense={canLogExpense}
            canSubmitProof={canSubmitProof}
            canRequestExtension={canRequestExtension}
            canValidateExpense={canValidateExpense}
            canValidateProof={canValidateProof}
            indicators={indicators}
            onActivityChanged={onActivityChanged}
            onEdit={onEdit}
            onSubmitProof={onSubmitProof}
            requestedExpenseId={requestedExpenseId}
            requestedProofId={requestedProofId}
          />
        </SidePanel>
      ) : null}
    </Sheet>
  )
}
