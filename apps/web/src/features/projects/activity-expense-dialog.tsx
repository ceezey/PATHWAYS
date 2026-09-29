'use client'

import { Loader2, ReceiptText } from 'lucide-react'
import { useEffect, useState } from 'react'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useOperationRequestId } from '@/lib/auth/operation-request-id'
import { principalHasAtomicPermission } from '@/lib/rbac/route-access'
import { coreDataClient } from '@/lib/services/core-feature-client'
import type { Activity } from '@/types/pathways'

/** A submitter-safe budget reference: the amount stays hidden, only the linkage is exposed. */
export type ExpenseBudgetReference = {
  id: string
  category: string
  activityId: string | null
}

const emptyDraft = { amount: '', budgetRecordId: '', date: '', description: '' }

export const ActivityExpenseDialog = ({
  activity,
  budgetReferences,
  open,
  onOpenChange,
  onSubmitted,
}: {
  activity: Activity
  budgetReferences: ExpenseBudgetReference[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
}) => {
  const { profile } = useCurrentRole()
  const canSubmit = principalHasAtomicPermission(profile, 'expenses.submit')
  const requests = useOperationRequestId()
  const [draft, setDraft] = useState(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft)
    setError('')
  }, [open])

  const activityReferences = budgetReferences.filter((row) => row.activityId === activity.id)

  const submit = async () => {
    if (submitting || !canSubmit) return
    if (
      !draft.budgetRecordId ||
      !activityReferences.some((row) => row.id === draft.budgetRecordId) ||
      !draft.amount.trim() ||
      !draft.date ||
      !draft.description.trim()
    ) {
      setError('Choose a linked budget allocation and complete every field.')
      return
    }
    setSubmitting(true)
    setError('')
    const body = {
      budgetRecordId: draft.budgetRecordId,
      description: draft.description.trim(),
      amount: draft.amount.trim(),
      expenseDate: draft.date,
    }
    const clientRequestId = requests.forBody(`activity-expense:${activity.id}`, body)
    try {
      await coreDataClient.submitExpense(activity.projectId, { clientRequestId, ...body })
      requests.acknowledge(clientRequestId)
      setDraft(emptyDraft)
      onSubmitted()
      onOpenChange(false)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Expense submission unavailable.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen)
      }}
      open={open}
    >
      <DialogShell
        title="Log expense"
        description={`Create a pending expense record for ${activity.title}.`}
      >
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm">
            <p className="font-medium text-foreground">Linked activity</p>
            <p className="mt-1 text-muted-foreground">{activity.title}</p>
          </div>
          {!canSubmit ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              Expense submission is outside your current permissions.
            </p>
          ) : activityReferences.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">
              No budget allocation is linked to this activity yet. Ask a Program or Grant Manager
              to record one before submitting an expense.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="activity-expense-budget">Budget allocation</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  id="activity-expense-budget"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, budgetRecordId: event.target.value }))
                  }
                  required
                  value={draft.budgetRecordId}
                >
                  <option value="">Choose a linked allocation</option>
                  {activityReferences.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-expense-amount">Amount (PHP)</Label>
                <Input
                  id="activity-expense-amount"
                  min="0.01"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, amount: event.target.value }))
                  }
                  required
                  step="0.01"
                  type="number"
                  value={draft.amount}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-expense-date">Date</Label>
                <Input
                  id="activity-expense-date"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, date: event.target.value }))
                  }
                  required
                  type="date"
                  value={draft.date}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="activity-expense-description">Description</Label>
                <Textarea
                  className="min-h-24"
                  id="activity-expense-description"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  required
                  value={draft.description}
                />
              </div>
            </div>
          )}
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={submitting || !canSubmit || activityReferences.length === 0}
              type="submit"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ReceiptText className="h-4 w-4" aria-hidden="true" />
              )}
              Save expense
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
