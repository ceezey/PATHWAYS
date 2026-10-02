'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { DialogShell, SidePanel } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { coreDataClient } from '@/lib/services/core-feature-client'

import { formatCurrency } from '../activity-utils'

type Expense = Awaited<ReturnType<typeof coreDataClient.expenses>>[number]
export type ReviewAction = 'VERIFY' | 'APPROVE' | 'SIGNOFF'

const labels: Record<ReviewAction, string> = {
  VERIFY: 'Verify expense',
  APPROVE: 'Approve expense',
  SIGNOFF: 'Record final sign-off',
}

/** Detail drawer for one expense review step, with a named confirmation for rejection. */
export const ExpenseReviewDrawer = ({
  projectId,
  expense,
  action,
  onClose,
  onDone,
}: {
  projectId: string
  expense: Expense | null
  action: ReviewAction | null
  onClose: () => void
  onDone: () => Promise<void>
}) => {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)

  const run = async (decision: 'APPROVE' | 'REJECT') => {
    if (!expense || !action || busy) return
    setBusy(true)
    try {
      if (action === 'SIGNOFF') await coreDataClient.signoffExpense(projectId, expense.id)
      else
        await coreDataClient.reviewExpense(projectId, expense.id, {
          expectedUpdatedAt: expense.updatedAt,
          stage: action,
          decision: decision === 'REJECT' ? 'REJECT' : action,
          ...(decision === 'REJECT' ? { reason: reason.trim() } : {}),
        })
      toast.success('Expense review recorded.')
      setReason('')
      setConfirmReject(false)
      await onDone()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Expense review unavailable.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet onOpenChange={(open) => !open && !busy && onClose()} open={Boolean(expense && action)}>
        <SidePanel
          description="Check the details, then record your decision. Recommendations are advisory."
          title={action ? labels[action] : 'Review expense'}
        >
          {expense ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-surface-subtle p-4">
                <p className="font-semibold text-foreground">{expense.description}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatCurrency(Number(expense.amount))}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Dated {expense.expenseDate}</p>
              </div>
              {action === 'SIGNOFF' ? null : (
                <div className="space-y-2">
                  <Label htmlFor="budget-review-note">Note (required to reject)</Label>
                  <Textarea
                    id="budget-review-note"
                    maxLength={2000}
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {action === 'SIGNOFF' ? null : (
                  <Button
                    disabled={busy || !reason.trim()}
                    onClick={() => setConfirmReject(true)}
                    type="button"
                    variant="outline"
                  >
                    Reject
                  </Button>
                )}
                <Button disabled={busy} onClick={() => void run('APPROVE')} type="button">
                  {action ? labels[action] : 'Confirm'}
                </Button>
              </div>
            </div>
          ) : null}
        </SidePanel>
      </Sheet>
      <Dialog onOpenChange={(open) => !busy && setConfirmReject(open)} open={confirmReject}>
        <DialogShell
          description="The expense is returned to its submitter with your note. This cannot be undone here."
          title={`Reject "${expense?.description ?? 'expense'}"?`}
        >
          <DialogFooter>
            <Button onClick={() => setConfirmReject(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void run('REJECT')} type="button">
              Reject expense
            </Button>
          </DialogFooter>
        </DialogShell>
      </Dialog>
    </>
  )
}
