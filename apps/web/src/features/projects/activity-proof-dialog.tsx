'use client'

import { Loader2, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import {
  registerProofFilePreviews,
  releaseProofFilePreviews,
} from '@/lib/files/proof-file-previews'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { isSourceReplay, sourceMutationTickets } from '@/lib/services/source-mutation'
import type { Activity } from '@/types/pathways'

export const ActivityProofDialog = (props: {
  activity: Activity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (activity: Activity) => void
}) => {
  const { profile } = useCurrentRole()
  const scope = useSensitiveDraftOwner(
    profile,
    'proof',
    'activities.proof.submit',
    props.activity?.projectId ?? null,
    props.activity?.id ?? null,
    props.open && Boolean(props.activity),
  )
  if (!scope || !props.activity || !props.open) return null
  return <ScopedActivityProofDialog key={scope.key + scope.generation} {...props} scope={scope} />
}
const ScopedActivityProofDialog = ({
  activity,
  open,
  onOpenChange,
  onSubmitted,
  scope,
}: {
  activity: Activity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (activity: Activity) => void
  scope: SensitiveDraftOwner
}) => {
  const { profile } = useCurrentRole()
  const mutationContext = useSourceMutationContext(
    profile,
    'activities.proof.submit',
    activity?.projectId ?? null,
    activity?.id ?? null,
    open,
  )
  const attempt = useRef<{ id: string; progress: number; note: string; files: File[] } | null>(null)
  const committed = useRef<string | null>(null)
  const [beneficiariesReachedThisSession, setBeneficiariesReachedThisSession] = useState(0)
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const noteError = error === 'Enter an update note before submitting proof.'
  const beneficiariesError = error.startsWith('Beneficiaries reached this session')
  const fileError = error.includes('proof file') || error.startsWith('Attach at least one')

  useEffect(() => {
    if (!activity || !open) {
      return
    }

    const retained = mutationContext
      ? sourceMutationTickets.proofSnapshot(
          mutationContext,
          `POST:/projects/${activity.projectId}/activities/${activity.id}/updates`,
        )
      : null
    if (retained)
      attempt.current = {
        id: retained.requestId,
        progress: retained.body.progressPercent,
        note: retained.body.note,
        files: retained.files,
      }
    committed.current = retained?.committed ? retained.requestId : null
    setBeneficiariesReachedThisSession(0)
    setNote(retained?.body.note ?? '')
    setFiles(retained?.files ?? [])
    setError('')
  }, [activity, mutationContext, open])

  const submitUpdate = async () => {
    if (!activity || submitting || !scope.isCurrent() || !mutationContext?.isCurrent()) {
      return
    }
    if (committed.current) {
      setSubmitting(true)
      try {
        const record = await pathwaysClient.getActivity(activity.projectId, activity.id)
        if (!scope.isCurrent() || !mutationContext.isCurrent()) return
        if (committed.current !== 'fresh')
          sourceMutationTickets.finishAcknowledgement(mutationContext, committed.current)
        onSubmitted(record)
        onOpenChange(false)
      } catch {
        if (scope.isCurrent() && mutationContext.isCurrent())
          setError(
            'The proof is committed. Reloading its current record failed; retry to reload without resubmitting.',
          )
      } finally {
        if (scope.isCurrent() && mutationContext.isCurrent()) setSubmitting(false)
      }
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
    if (
      files.length > 5 ||
      files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024 ||
      files.some(
        (file) =>
          file.size < 1 ||
          file.size > 10 * 1024 * 1024 ||
          file.name.trim().length > 128 ||
          /[\\/]/.test(file.name) ||
          !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(
            file.type.toLowerCase(),
          ),
      )
    ) {
      setError(
        'Select up to five PDF, JPEG, PNG, WebP or MP4 proof files: 10 MB per file and 25 MB total, with valid names.',
      )
      return
    }

    const prior = attempt.current
    if (
      prior &&
      (prior.note !== note ||
        prior.files.length !== files.length ||
        prior.files.some((file, index) => file !== files[index]))
    ) {
      setError(
        'The earlier proof outcome is unresolved. Retry the original note and files unchanged.',
      )
      return
    }
    const captured = prior ?? {
      id: crypto.randomUUID(),
      progress: activity.progress,
      note,
      files: [...files],
    }
    attempt.current = captured
    setSubmitting(true)
    setError('')
    let fileReferences: Awaited<ReturnType<typeof registerProofFilePreviews>> = []
    let dispatched = false
    const previouslyUnresolved = sourceMutationTickets.pendingRecovery(
      mutationContext,
      `POST:/projects/${activity.projectId}/activities/${activity.id}/updates`,
    )

    try {
      fileReferences = await registerProofFilePreviews(captured.files)
      if (!scope.isCurrent() || !mutationContext.isCurrent()) return
      dispatched = true
      const updatedActivity = await pathwaysClient.submitActivityProof(
        {
          projectId: activity.projectId,
          activityId: activity.id,
          clientUpdateId: captured.id,
          progress: captured.progress,
          note: captured.note,
          files: captured.files,
        },
        mutationContext,
      )

      if (!scope.isCurrent() || !mutationContext.isCurrent()) return
      committed.current = isSourceReplay(updatedActivity) ? updatedActivity.requestId : 'fresh'
      attempt.current = null
      toast.success('Progress update submitted.', {
        description:
          files.length > 0
            ? `${files.length} proof file${files.length === 1 ? '' : 's'} selected for review.`
            : 'Proof submitted for M&E review.',
      })
      const record = isSourceReplay(updatedActivity)
        ? await pathwaysClient.getActivity(activity.projectId, activity.id)
        : updatedActivity
      if (!scope.isCurrent() || !mutationContext.isCurrent()) return
      if (isSourceReplay(updatedActivity))
        sourceMutationTickets.finishAcknowledgement(mutationContext, updatedActivity.requestId)
      attempt.current = null
      onSubmitted(record)
      onOpenChange(false)
    } catch (caught) {
      if (!scope.isCurrent()) return
      if (!dispatched && !previouslyUnresolved) attempt.current = null
      setError(
        committed.current
          ? 'The proof is committed. Reloading its current record failed; retry to reload without resubmitting.'
          : caught instanceof Error
            ? caught.message
            : 'The activity update could not be completed. Review the details and try again.',
      )
    } finally {
      releaseProofFilePreviews(fileReferences)
      if (scope.isCurrent()) setSubmitting(false)
    }
  }

  const requestOpenChange = (next: boolean) => {
    if (!next && (submitting || attempt.current)) {
      setError(
        'The proof outcome is unresolved. Keep the original note and files and retry before closing.',
      )
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
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
              disabled={submitting || Boolean(attempt.current) || Boolean(committed.current)}
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
              disabled={submitting || Boolean(attempt.current) || Boolean(committed.current)}
              aria-invalid={fileError}
              id="activity-proof"
              accept="application/pdf,image/jpeg,image/png,image/webp,video/mp4"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []))
                if (fileError) setError('')
              }}
              type="file"
            />
            <p className="text-sm text-muted-foreground" id="activity-proof-help">
              Select up to five PDF, JPEG, PNG, WebP or MP4 files, with 10 MB per file and 25 MB
              total. Files and notes stay unchanged while a save is unresolved.
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
            <Button
              type="button"
              variant="outline"
              disabled={submitting || Boolean(attempt.current)}
              onClick={() => requestOpenChange(false)}
            >
              Cancel
            </Button>
            <Button className="gap-2" disabled={submitting} type="submit">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
              )}
              {committed.current ? 'Reload committed proof' : 'Submit update & proof'}
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
