'use client'

import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DialogShell, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
export type PendingExpense = {
  id: string
  activityId: string
  projectId: string
  amount: number
  category: string
  date: string
  description: string
  status: 'For Verification'
}

const peso = (amount: number) =>
  amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

export function ActivityExpenseReviewDialog({
  expense,
  onOpenChange,
}: {
  expense: PendingExpense | null
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!expense) return
    setReason('')
    setError('')
  }, [expense])

  if (!expense) return null

  const submit = (verified: boolean) => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    setError('Expense review is unavailable until a server-backed expense service is available.')
    setSubmitting(false)
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
              className="gap-2"
              disabled={submitting || !reason.trim()}
              onClick={() => submit(false)}
              type="button"
              variant="outline"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Return for correction
            </Button>
            <Button
              className="gap-2"
              disabled={submitting}
              onClick={() => submit(true)}
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
