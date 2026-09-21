'use client'

import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

export const ActivityReviewDialog = ({
  activity,
  decision,
  open,
  onOpenChange,
  onReviewed,
}: {
  activity: Activity | null
  decision: 'APPROVE' | 'RETURN'
  open: boolean
  onOpenChange: (open: boolean) => void
  onReviewed: (activity: Activity) => void
}) => {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pendingUpdate = useMemo(
    () =>
      activity?.updateNotes
        .slice()
        .reverse()
        .find((update) => update.status === 'Submitted'),
    [activity],
  )

  useEffect(() => {
    if (!open) return
    setReason('')
    setError('')
  }, [open])

  const submit = async () => {
    if (!activity || !pendingUpdate) {
      setError('No pending activity update is available for review.')
      return
    }
    if (!reason.trim()) {
      setError('Enter a review reason before continuing.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const updated = await pathwaysClient.reviewActivityUpdate(
        activity.projectId,
        activity.id,
        pendingUpdate.id,
        decision,
        reason.trim(),
        pendingUpdate.updatedAt,
      )
      toast.success(
        decision === 'APPROVE' ? 'Activity update approved.' : 'Activity update returned.',
        {
          description:
            decision === 'APPROVE'
              ? 'The activity is now completed and the submitted proof is verified.'
              : 'The activity is back In Progress for revision and resubmission.',
        },
      )
      onReviewed(updated)
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof PathwaysClientError ? caught.message : 'The review could not be saved.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogShell
        title={decision === 'APPROVE' ? 'Approve activity update' : 'Return activity update'}
        description="Review decisions are persisted with the reviewer, reason, and timestamp."
      >
        <div className="space-y-4">
          {pendingUpdate ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-foreground">{pendingUpdate.progress}% progress</p>
              <p className="mt-1 text-muted-foreground">{pendingUpdate.note}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Submitted by {pendingUpdate.submittedBy} on{' '}
                {new Date(pendingUpdate.submittedAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="text-sm text-destructive">No pending update is available for review.</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="activity-review-reason">Review reason</Label>
            <textarea
              id="activity-review-reason"
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                decision === 'APPROVE'
                  ? 'State why the submitted update and proof are accepted.'
                  : 'State what must be corrected before resubmission.'
              }
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={decision === 'APPROVE' ? 'default' : 'outline'}
              className="gap-2"
              disabled={submitting || !pendingUpdate}
              onClick={submit}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : decision === 'APPROVE' ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              )}
              {decision === 'APPROVE' ? 'Approve' : 'Return for revision'}
            </Button>
          </DialogFooter>
        </div>
      </DialogShell>
    </Dialog>
  )
}
