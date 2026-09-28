'use client'

import { Loader2, TrendingUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

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
  // Reused on retry so an unresolved request replays instead of creating a second update.
  const attemptId = useRef<string | null>(null)

  const submit = async () => {
    if (submitting) return
    const value = Number(progress)
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setError('Enter a whole-number progress between 0 and 100.')
      return
    }
    if (!note.trim()) {
      setError('Enter a progress note.')
      return
    }
    attemptId.current ??= crypto.randomUUID()
    setSubmitting(true)
    setError('')
    try {
      const updated = await pathwaysClient.recordActivityProgress({
        projectId: activity.projectId,
        activityId: activity.id,
        clientUpdateId: attemptId.current,
        progress: value,
        note,
      })
      attemptId.current = null
      toast.success('Progress recorded for review.')
      onRecorded(updated)
      onOpenChange(false)
    } catch (caught) {
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
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="activity-progress-percent">Progress (%)</Label>
            <Input
              disabled={submitting || Boolean(attemptId.current)}
              id="activity-progress-percent"
              max={100}
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
              disabled={submitting || Boolean(attemptId.current)}
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
