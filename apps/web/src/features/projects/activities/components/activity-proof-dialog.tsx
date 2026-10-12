'use client'

import { Loader2, RotateCcw, UploadCloud, X } from 'lucide-react'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import type { Activity } from '@/types/pathways'

import { megabytes, statusLabel } from '../activity-proof-upload.utils'
import { useActivityProofUpload } from '../hooks/use-activity-proof-upload'

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
  return <ActivityProofDialogContent key={scope.key + scope.generation} {...props} scope={scope} />
}

const ActivityProofDialogContent = ({
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
  const {
    note,
    setNote,
    files,
    submitting,
    error,
    setError,
    limits,
    locked,
    fileInputRef,
    lockedNoticeRef,
    resume,
    beneficiariesReachedThisSession,
    setBeneficiariesReachedThisSession,
    progressError,
    noteError,
    fileError,
    beneficiariesError,
    setProgressText,
    setProgressEdited,
    completes,
    setCompletes,
    suggestion,
    progressValue,
    lowerNotice,
    addFiles,
    removeFile,
    retryFile,
    submitUpdate,
    requestOpenChange,
    liveStatus,
  } = useActivityProofUpload({ activity, onOpenChange, onSubmitted, open, scope })

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogShell
        title="Submit proof"
        description="Record a progress update and attach supporting evidence for review."
      >
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submitUpdate()
          }}
        >
          <output aria-atomic="true" aria-live="polite" className="sr-only block">
            {liveStatus}
          </output>
          {resume ? (
            <p className="rounded-xl border border-warning/40 bg-warning-subtle p-3 text-sm text-foreground">
              An earlier upload for this update did not finish. Its note is kept below. Select the
              same proof files again to finish submitting it for review.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="activity-beneficiaries-reached">
              Beneficiaries reached this session
            </Label>
            <Input
              aria-describedby={
                beneficiariesError
                  ? 'activity-beneficiaries-reached-hint activity-beneficiaries-reached-error'
                  : 'activity-beneficiaries-reached-hint'
              }
              aria-invalid={beneficiariesError}
              disabled={submitting || locked || Boolean(resume)}
              id="activity-beneficiaries-reached"
              min={0}
              max={100000}
              onChange={(event) => {
                setBeneficiariesReachedThisSession(event.target.value)
                if (beneficiariesError) setError('')
              }}
              type="number"
              step={1}
              value={beneficiariesReachedThisSession}
            />
            <p className="text-sm text-muted-foreground" id="activity-beneficiaries-reached-hint">
              Counts toward the activity's beneficiaries reached once M&E approves this proof.
            </p>
          </div>
          <div className="space-y-2">
            {suggestion ? (
              // Derived from beneficiaries, so it is read-only and shown as a bar.
              <>
                <Label id="activity-proof-progress-label">Progress {suggestion.percent}%</Label>
                <div
                  aria-labelledby="activity-proof-progress-label"
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={suggestion.percent}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  tabIndex={0}
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${suggestion.percent}%` }}
                  />
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                  <input
                    checked={completes}
                    className="h-4 w-4 accent-primary"
                    disabled={submitting || locked}
                    onChange={(event) => setCompletes(event.target.checked)}
                    type="checkbox"
                  />
                  This proof completes the activity (100%)
                </label>
              </>
            ) : (
              <>
                <Label htmlFor="activity-proof-progress">Progress (%)</Label>
                <Input
                  aria-describedby={
                    [
                      lowerNotice ? 'activity-proof-progress-lower' : '',
                      progressError ? 'activity-proof-progress-error' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  aria-invalid={progressError}
                  disabled={submitting || locked || Boolean(resume)}
                  id="activity-proof-progress"
                  max={100}
                  min={0}
                  onChange={(event) => {
                    setProgressText(event.target.value)
                    setProgressEdited(true)
                    if (progressError) setError('')
                  }}
                  step={1}
                  type="number"
                  value={progressValue}
                />
              </>
            )}
            {lowerNotice && activity ? (
              <p className="text-sm text-muted-foreground" id="activity-proof-progress-lower">
                This is lower than the current progress ({activity.progress}%).
              </p>
            ) : null}
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
              disabled={submitting || locked || Boolean(resume)}
              aria-describedby={noteError ? 'activity-note-error' : undefined}
              aria-invalid={noteError}
              aria-required="true"
              className="min-h-28"
              id="activity-note"
              onChange={(event) => {
                if (submitting || locked) return
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
              disabled={submitting || locked}
              aria-invalid={fileError}
              id="activity-proof"
              accept={limits.contentTypes.join(',')}
              multiple
              onChange={(event) => addFiles(event.target.files)}
              ref={fileInputRef}
              type="file"
            />
            <p className="text-sm text-muted-foreground" id="activity-proof-help">
              Select up to {limits.maxFiles} PDF, JPEG, PNG, WebP, MP4, MOV or WebM files, up to{' '}
              {megabytes(limits.maxFileBytes)} each. Selecting more files adds to the list.
            </p>
          </div>
          {locked ? (
            <p className="text-sm font-medium text-foreground" ref={lockedNoticeRef} tabIndex={-1}>
              Files are locked while this submission is in progress. Retry failed files to finish.
            </p>
          ) : null}
          {files.length > 0 ? (
            <ul className="space-y-2" aria-label="Selected proof files">
              {files.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-subtle p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-medium text-foreground">
                      {item.file.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {statusLabel(item.status)}
                      {item.status === 'failed' && item.error ? `: ${item.error}` : ''}
                    </p>
                  </div>
                  {item.status === 'failed' ? (
                    <Button
                      className="h-11 w-11 shrink-0"
                      onClick={() => void retryFile(item.key)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only">Retry {item.file.name}</span>
                    </Button>
                  ) : (
                    <Button
                      className="h-11 w-11 shrink-0"
                      data-proof-remove-button="true"
                      disabled={submitting || locked}
                      onClick={() => removeFile(item.key)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only">Remove {item.file.name}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p
              className="text-sm font-medium text-destructive"
              id={
                noteError
                  ? 'activity-note-error'
                  : fileError
                    ? 'activity-proof-error'
                    : beneficiariesError
                      ? 'activity-beneficiaries-reached-error'
                      : progressError
                        ? 'activity-proof-progress-error'
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
              disabled={submitting}
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
              Submit proof
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  )
}
