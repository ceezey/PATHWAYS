'use client'

import { Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import type { Activity } from '@/types/pathways'

export const ActivityProofDialog = ({
  activity,
  open,
  onOpenChange,
  onSubmitted,
}: {
  activity: Activity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (activity: Activity) => void
}) => {
  const [progress, setProgress] = useState(0)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activity || !open) {
      return
    }

    setProgress(activity.progress)
    setNote('')
    setFiles([])
    setError('')
  }, [activity, open])

  const submitUpdate = async () => {
    if (!activity) {
      return
    }

    if (!note.trim()) {
      setError('Enter an update note before submitting proof.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // TODO(STORAGE): Upload proof files to Supabase Storage.
      // TODO(BACKEND): Save activity progress and proof submission.
      const updatedActivity = await pathwaysClient.submitActivityProof({
        activityId: activity.id,
        progress,
        note,
        fileNames: files.map((file) => file.name),
      })

      toast.success('Update submitted for prototype review.', {
        description:
          files.length > 0
            ? `${files.length} proof file${files.length === 1 ? '' : 's'} selected locally.`
            : 'Progress note submitted without a remote upload.',
      })
      onSubmitted(updatedActivity)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogShell
        title="Submit Update & Proof"
        description="Record a local prototype progress update. Files are previewed only and are not uploaded remotely."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="activity-progress">Completion percentage</Label>
            <Input
              id="activity-progress"
              max={100}
              min={0}
              onChange={(event) => setProgress(Number(event.target.value))}
              type="number"
              value={progress}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-note">Update note</Label>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              id="activity-note"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Summarize completed work, blockers, and submitted proof."
              value={note}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-proof">Evidence files</Label>
            <Input
              id="activity-proof"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              type="file"
            />
            <p className="text-sm text-muted-foreground">
              Prototype submission status: selected locally, not uploaded.
            </p>
          </div>
          {files.length > 0 ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-sm font-medium text-foreground">Selected file preview</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="break-all">
                    {file.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="gap-2" disabled={submitting} onClick={submitUpdate} type="button">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
              )}
              Submit Update
            </Button>
          </DialogFooter>
        </div>
      </DialogShell>
    </Dialog>
  )
}
