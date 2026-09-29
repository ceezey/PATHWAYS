'use client'

import { Loader2, ReceiptText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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

const maxReceiptBytes = 10485760
const receiptTypes = ['application/pdf', 'image/png', 'image/jpeg']

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
  const [notice, setNotice] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const canAttachReceipt = principalHasAtomicPermission(profile, 'expenses.evidence.submit')

  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft)
    setError('')
    setNotice('')
    setReceiptFile(null)
    setFileKey((key) => key + 1)
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
    if (!canAttachReceipt) {
      setError('A receipt is required, and this account cannot attach receipts.')
      return
    }
    if (!receiptFile) {
      setError('Attach the receipt (PDF, PNG or JPEG) before submitting.')
      return
    }
    if (receiptFile.size > maxReceiptBytes || !receiptTypes.includes(receiptFile.type)) {
      setError('Receipt must be a PDF, PNG or JPEG of at most 10 MiB.')
      return
    }
    setSubmitting(true)
    setError('')
    setNotice('')
    const body = {
      budgetRecordId: draft.budgetRecordId,
      description: draft.description.trim(),
      amount: draft.amount.trim(),
      expenseDate: draft.date,
    }
    const clientRequestId = requests.forBody(`activity-expense:${activity.id}`, body)
    try {
      const ack = await coreDataClient.submitExpense(activity.projectId, {
        clientRequestId,
        ...body,
      })
      requests.acknowledge(clientRequestId)
      setDraft(emptyDraft)
      try {
        await coreDataClient.uploadReceipt(activity.projectId, ack.id, ack.updatedAt, receiptFile)
      } catch {
        // The expense is already saved; keep the dialog open so the message is read.
        setReceiptFile(null)
        setFileKey((key) => key + 1)
        setNotice('Expense saved; receipt not attached. Attach it from the Budget tab.')
        toast.warning('Expense saved without its receipt.')
        onSubmitted()
        return
      }
      toast.success('Expense submitted for validation.')
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
            <output className="text-sm text-muted-foreground">
              No budget allocation is linked to this activity yet. Ask a Program or Grant Manager to
              record one before submitting an expense.
            </output>
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
          {canSubmit && activityReferences.length > 0 && canAttachReceipt ? (
            <div className="space-y-2">
              <Label htmlFor="activity-expense-receipt">
                Private receipt (required; PDF, PNG or JPEG; maximum 10 MiB)
              </Label>
              <Input
                accept="application/pdf,image/png,image/jpeg"
                aria-required="true"
                aria-describedby={error ? 'activity-expense-error' : undefined}
                aria-invalid={error ? true : undefined}
                disabled={submitting}
                id="activity-expense-receipt"
                key={fileKey}
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
          ) : null}
          {notice ? (
            <output className="block text-sm font-medium text-foreground">{notice}</output>
          ) : null}
          {error ? (
            <p
              className="text-sm font-medium text-destructive"
              id="activity-expense-error"
              role="alert"
            >
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
              {notice ? 'Close' : 'Cancel'}
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
