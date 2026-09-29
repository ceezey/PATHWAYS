'use client'

import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DialogShell, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient } from '@/lib/services/core-feature-client'

export type PendingExpense = {
  id: string
  activityId: string
  projectId: string
  amount: number
  category: string
  date: string
  description: string
  status: 'For Verification'
  updatedAt: string
  receiptEvidenceId: string | null
}

const peso = (amount: number) =>
  amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

export function ActivityExpenseReviewDialog({
  expense,
  onOpenChange,
  onReviewed,
}: {
  expense: PendingExpense | null
  onOpenChange: (open: boolean) => void
  onReviewed: () => void
}) {
  const { profile } = useCurrentRole()
  const canVerify = principalHasAtomicPermission(profile, 'expenses.verify')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const missingReceipt = !expense?.receiptEvidenceId
  const receiptHintId = 'expense-review-receipt-hint'
  // aria-disabled (not native disabled) so Validate/Return stay reachable by
  // keyboard and screen readers, which then hear the persistent hint below
  // via aria-describedby instead of losing the control from the tab order.
  const blockMissingReceipt = (event: {
    preventDefault: () => void
    stopPropagation: () => void
  }) => {
    if (!missingReceipt) return
    event.preventDefault()
    event.stopPropagation()
  }

  useEffect(() => {
    if (!expense) return
    setReason('')
    setError('')
  }, [expense])

  if (!expense) return null

  const submit = async (verified: boolean) => {
    if (submitting || !canVerify) return
    if (!verified && !reason.trim()) {
      setError('A correction reason is required to return this expense.')
      return
    }
    if (!expense.receiptEvidenceId) {
      setError('A private receipt must be attached before this expense can be reviewed.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await coreDataClient.reviewExpense(expense.projectId, expense.id, {
        expectedUpdatedAt: expense.updatedAt,
        stage: 'VERIFY',
        decision: verified ? 'VERIFY' : 'REJECT',
        ...(verified ? {} : { reason: reason.trim() }),
      })
      onReviewed()
      onOpenChange(false)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Expense review is unavailable.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !submitting && onOpenChange(open)}>
      <DialogShell
        title="Review submitted expense"
        description="Validate the exact Project Officer submission before it enters the expense ledger."
      >
        <div className="space-y-4">
          <div className="rounded-sm border border-border bg-surface-subtle p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{expense.category}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {peso(expense.amount)}
                </p>
              </div>
              <StatusBadge tone="warning">{expense.status}</StatusBadge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Expense date</dt>
                <dd className="font-medium text-foreground">{expense.date}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="font-medium text-foreground">{expense.description}</dd>
              </div>
            </dl>
          </div>
          {!canVerify ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              Expense verification is outside your current permissions.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="expense-return-reason">Correction reason</Label>
            <Textarea
              id="expense-return-reason"
              onChange={(event) => {
                setReason(event.target.value)
                if (error) setError('')
              }}
              placeholder="Required only when returning this expense for correction."
              value={reason}
            />
          </div>
          {missingReceipt ? (
            <p className="text-sm font-medium text-muted-foreground" id={receiptHintId}>
              Attach a private receipt before review.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button
              aria-describedby={missingReceipt ? receiptHintId : undefined}
              aria-disabled={missingReceipt || undefined}
              className="gap-2"
              disabled={submitting || !canVerify || !reason.trim()}
              onClick={(event) => {
                blockMissingReceipt(event)
                if (missingReceipt) return
                void submit(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') blockMissingReceipt(event)
              }}
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Return for correction
            </Button>
            <Button
              aria-describedby={missingReceipt ? receiptHintId : undefined}
              aria-disabled={missingReceipt || undefined}
              className="gap-2"
              disabled={submitting || !canVerify}
              onClick={(event) => {
                blockMissingReceipt(event)
                if (missingReceipt) return
                void submit(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') blockMissingReceipt(event)
              }}
              type="button"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              Validate expense
            </Button>
          </DialogFooter>
        </div>
      </DialogShell>
    </Dialog>
  )
}
