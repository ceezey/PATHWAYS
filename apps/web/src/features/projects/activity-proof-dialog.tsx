'use client'

import { Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity } from '@/types/pathways'

const allowedProofTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])
const maxProofFiles = 5
const maxProofFileBytes = 10 * 1024 * 1024
const maxProofTotalBytes = 25 * 1024 * 1024

function validateProofFiles(files: File[]) {
  if (files.length === 0) return 'Select at least one proof file.'
  if (files.length > maxProofFiles) return `Select no more than ${maxProofFiles} proof files.`
  if (files.some((file) => file.size > maxProofFileBytes)) {
    return 'Each proof file must be 10 MiB or smaller.'
  }
  if (files.reduce((total, file) => total + file.size, 0) > maxProofTotalBytes) {
    return 'The combined proof files must be 25 MiB or smaller.'
  }
  if (files.some((file) => !allowedProofTypes.has(file.type))) {
    return 'Proof files must be PDF, JPEG, PNG, WEBP, or MP4.'
  }
  return null
}

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
  const [clientUpdateId, setClientUpdateId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activity || !open) return
    setProgress(activity.progress)
    setNote('')
    setFiles([])
    setClientUpdateId(crypto.randomUUID())
    setError('')
  }, [activity, open])

  const submitUpdate = async () => {
    if (!activity) return
    if (activity.storedStatus !== 'IN_PROGRESS') {
      setError('The activity must be In Progress before proof can be submitted.')
      return
    }
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      setError('Completion percentage must be a whole number from 0 to 100.')
      return
    }
    if (!note.trim()) {
      setError('Enter an update note before submitting proof.')
      return
    }
    const fileError = validateProofFiles(files)
    if (fileError) {
      setError(fileError)
      return
    }
    if (!clientUpdateId) {
      setError('The retry-safe update identifier is unavailable. Close and reopen this dialog.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const updatedActivity = await pathwaysClient.submitActivityProof({
        projectId: activity.projectId,
        activityId: activity.id,
        clientUpdateId,
        progress,
        note: note.trim(),
        files,
      })
      toast.success('Activity update and private proof submitted.', {
        description: `${files.length} proof file${files.length === 1 ? '' : 's'} stored for M&E review.`,
      })
      onSubmitted(updatedActivity)
      onOpenChange(false)
    } catch (caught) {
      setError(
        caught instanceof PathwaysClientError
          ? caught.message
          : 'The activity update could not be completed. Review the details and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogShell
        title="Submit Update & Proof"
        description="Submit a persisted progress update with private evidence for independent M&E review."
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
              maxLength={4000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Summarize completed work, blockers, and submitted proof."
              value={note}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-proof">Evidence files</Label>
            <Input
              accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,application/pdf,image/jpeg,image/png,image/webp,video/mp4"
              id="activity-proof"
              multiple
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? [])
                setFiles(nextFiles)
                setError(validateProofFiles(nextFiles) ?? '')
              }}
              type="file"
            />
            <p className="text-sm text-muted-foreground">
              Required. Up to 5 private PDF/JPEG/PNG/WEBP/MP4 files; 10 MiB each and 25 MiB total.
            </p>
          </div>
          {files.length > 0 ? (
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-sm font-medium text-foreground">Selected files</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="break-all">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MiB
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
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
