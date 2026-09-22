'use client'

import { Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  registerProofFilePreviews,
  releaseProofFilePreviews,
} from '@/lib/files/proof-file-previews'
import { pathwaysClient } from '@/lib/services/pathways-client'
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
  const [beneficiariesReachedThisSession, setBeneficiariesReachedThisSession] = useState(0)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [clientUpdateId, setClientUpdateId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const noteError = error === 'Enter an update note before submitting proof.'
  const beneficiariesError = error.startsWith('Beneficiaries reached this session')
  const fileError = error.startsWith('Attach at least one') || error.includes('20 MB')

  useEffect(() => {
    if (!activity || !open) {
      return
    }

    setBeneficiariesReachedThisSession(0)
    setNote('')
    setFiles([])
    setClientUpdateId(crypto.randomUUID())
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
    if (beneficiariesReachedThisSession !== 0) {
      setError('Session beneficiary counts cannot be saved by the current API.')
      return
    }
    if (!files.length) {
      setError('Attach at least one proof-of-conduct file.')
      return
    }
    if (files.some((file) => file.size > 20 * 1024 * 1024)) {
      setError('Each proof-of-conduct file must be 20 MB or smaller.')
      return
    }

    const fileReferences = await registerProofFilePreviews(files)
    setSubmitting(true)
    setError('')

    try {
      const updatedActivity = await pathwaysClient.submitActivityProof({
        projectId: activity.projectId,
        activityId: activity.id,
        clientUpdateId: clientUpdateId || crypto.randomUUID(),
        progress: activity.progress,
        note,
        files,
      })

      toast.success('Progress update submitted.', {
        description:
          files.length > 0
            ? `${files.length} proof file${files.length === 1 ? '' : 's'} selected for review.`
            : 'Proof submitted for M&E review.',
      })
      onSubmitted(updatedActivity)
      onOpenChange(false)
    } catch (caught) {
      releaseProofFilePreviews(fileReferences)
      setError(
        caught instanceof Error
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
        description="Record a progress update and attach supporting evidence for review."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void submitUpdate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="activity-beneficiaries-reached">
              Beneficiaries reached this session
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Input
              aria-describedby={
                beneficiariesError ? 'activity-beneficiaries-reached-error' : undefined
              }
              aria-invalid={beneficiariesError}
              aria-required="false"
              disabled
              id="activity-beneficiaries-reached"
              min={0}
              onChange={(event) => {
                setBeneficiariesReachedThisSession(Number(event.target.value))
                if (beneficiariesError) setError('')
              }}
              type="number"
              step={1}
              value={beneficiariesReachedThisSession}
            />
            <p className="text-sm text-muted-foreground">
              Session beneficiary counts are unavailable until backend support is added. The
              submitted proof retains the current {activity?.progress ?? 0}% progress for M&E
              review.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-note">
              Narrative Notes
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Textarea
              aria-describedby={noteError ? 'activity-note-error' : undefined}
              aria-invalid={noteError}
              aria-required="true"
              className="min-h-28"
              id="activity-note"
              onChange={(event) => {
                setNote(event.target.value)
                if (noteError) setError('')
              }}
              placeholder="Summarize completed work, blockers, and submitted proof."
              value={note}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-proof">
              Upload proof of conduct
              <span aria-hidden="true" className="ml-1 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </Label>
            <Input
              aria-describedby={fileError ? 'activity-proof-error' : 'activity-proof-help'}
              aria-invalid={fileError}
              id="activity-proof"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []))
                if (fileError) setError('')
              }}
              type="file"
            />
            <p className="text-sm text-muted-foreground" id="activity-proof-help">
              Select one or more files. Maximum 20 MB per file; files are uploaded with the update.
            </p>
          </div>
          {files.length > 0 ? (
            <div className="rounded-sm border border-border bg-surface-subtle p-3">
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
          {error ? (
            <p
              className="text-sm font-medium text-destructive"
              id={
                noteError
                  ? 'activity-note-error'
                  : beneficiariesError
                    ? 'activity-beneficiaries-reached-error'
                    : fileError
                      ? 'activity-proof-error'
                      : undefined
              }
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="gap-2" disabled={submitting} type="submit">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
              )}
              Submit update & proof
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
