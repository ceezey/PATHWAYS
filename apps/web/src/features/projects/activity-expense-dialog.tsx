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
import { saveExpense } from '@/lib/demo-state/projects'
import type { Activity } from '@/types/pathways'

const emptyDraft = { amount: '', category: '', date: '', description: '' }

export const ActivityExpenseDialog = ({
  activity,
  open,
  onOpenChange,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const [draft, setDraft] = useState(emptyDraft)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(emptyDraft)
    setError('')
  }, [open])

  const submit = () => {
    if (submitting) return
    setSubmitting(true)
    setError('')

    try {
      saveExpense({
        activityId: activity.id,
        projectId: activity.projectId,
        amount: Number(draft.amount),
        category: draft.category,
        date: draft.date,
        description: draft.description,
      })
      toast.success('Expense submitted to M&E for validation.', {
        description: 'The pending local record is linked to this activity and project.',
      })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The expense could not be saved.')
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
            submit()
          }}
        >
          <div className="rounded-sm border border-border bg-surface-subtle p-3 text-sm">
            <p className="font-medium text-foreground">Linked activity</p>
            <p className="mt-1 text-muted-foreground">{activity.title}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label htmlFor="activity-expense-category">Category</Label>
              <Input
                id="activity-expense-category"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, category: event.target.value }))
                }
                required
                value={draft.category}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
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
            <Button className="gap-2" disabled={submitting} type="submit">
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
