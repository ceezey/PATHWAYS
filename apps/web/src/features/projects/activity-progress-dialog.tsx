'use client'

import { Loader2, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

/** A 4xx other than 408/429 means the server decided; the same payload will not succeed. */
export const definitiveRejection = (caught: unknown) =>
  caught instanceof PathwaysClientError &&
  typeof caught.status === 'number' &&
  caught.status >= 400 &&
  caught.status < 500 &&
  caught.status !== 408 &&
  caught.status !== 429

export const ActivityProgressDialog = ({
  activity,
  open,
  onOpenChange,
  onRecorded,
}: {
  activity: Activity
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecorded: (activity: Activity) => void
}) => {
  const [progress, setProgress] = useState(String(activity.progress))
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // Kept only after an indeterminate failure, so a retry replays the same request instead of
  // creating a second update. A definitive rejection clears it and unlocks the inputs.
  const [attemptId, setAttemptId] = useState<string | null>(null)

  const submit = async () => {
    if (submitting) return
    const value = Number(progress)
    if (value === 100) {
      setError('Completion requires proof. Use Submit Update & Proof to record 100% progress.')
      return
    }
    if (!Number.isInteger(value) || value < 0 || value > 99) {
      setError('Enter a whole-number progress between 0 and 99.')
      return
    }
    if (!note.trim()) {
      setError('Enter a progress note.')
      return
    }
    const clientUpdateId = attemptId ?? crypto.randomUUID()
    setAttemptId(clientUpdateId)
    setSubmitting(true)
    setError('')
    try {
      const updated = await pathwaysClient.recordActivityProgress({
        projectId: activity.projectId,
        activityId: activity.id,
        clientUpdateId,
        progress: value,
        note,
      })
      setAttemptId(null)
      toast.success('Progress recorded for review.')
      onRecorded(updated)
      onOpenChange(false)
    } catch (caught) {
      if (definitiveRejection(caught)) setAttemptId(null)
      setError(
        caught instanceof Error ? caught.message : 'Progress could not be recorded. Try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={(next) => !submitting && onOpenChange(next)} open={open}>
      <DialogShell
        title="Record progress"
        description="Record the current completion percentage and a short note for review."
      >
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="activity-progress-percent">Progress (%)</Label>
            <Input
              disabled={submitting || Boolean(attemptId)}
              id="activity-progress-percent"
              max={99}
              min={0}
              onChange={(event) => setProgress(event.target.value)}
              step={1}
              type="number"
              value={progress}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-progress-note">
              Progress note
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Textarea
              aria-required="true"
              className="min-h-28"
              disabled={submitting || Boolean(attemptId)}
              id="activity-progress-note"
              maxLength={4000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Summarize the work completed since the last update."
              value={note}
            />
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
                <TrendingUp className="h-4 w-4" aria-hidden="true" />
              )}
              Record progress
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
