'use client'

import { Loader2, RotateCcw, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { DialogShell } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { sha256Hex } from '@/lib/files/proof-file-hash'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  Activity,
  ActivityProofFileDeclaration,
  ActivityProofUploadLimits,
} from '@/types/pathways'

// Advisory-only defaults shown before the server's own limits load
// (cr-pathways-activity-progress-media 3.2). The server is authoritative either way.
const fallbackLimits: ActivityProofUploadLimits = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  contentTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
}

type FileStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed'

interface ProofFileItem {
  key: string
  file: File
  status: FileStatus
  error?: string
  evidenceId?: string
  uploadUrl?: string | null
  sha256?: string
}

const megabytes = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`

const statusLabel = (status: FileStatus) =>
  status === 'waiting'
    ? 'Waiting'
    : status === 'uploading'
      ? 'Uploading'
      : status === 'uploaded'
        ? 'Uploaded'
        : 'Failed'

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
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<ProofFileItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [limits, setLimits] = useState<ActivityProofUploadLimits>(fallbackLimits)
  // locked mirrors reservation.current once a reservation exists: the reserved file set and note
  // must never diverge from what the server has recorded, so both stay locked (only per-file
  // Retry remains available) until the update fully commits or the dialog is reopened.
  const [locked, setLocked] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lockedNoticeRef = useRef<HTMLParagraphElement | null>(null)
  const reservation = useRef<{ updateId: string; clientUpdateId: string } | null>(null)
  // committed marks the update as durably committed server-side (retries after this point must
  // only retry the post-commit reload, never reserve a second update). finishing guards against
  // overlapping finish() calls without blocking a later retry after a failed reload.
  const committed = useRef(false)
  const finishing = useRef(false)
  const noteError = error === 'Enter an update note before submitting proof.'
  const fileError = error.startsWith('Attach') || error.startsWith('Select up to')

  // biome-ignore lint/correctness/useExhaustiveDependencies: scope is stable per instance key.
  useEffect(() => {
    if (!activity || !open) return
    setNote('')
    setFiles([])
    setError('')
    setLocked(false)
    reservation.current = null
    committed.current = false
    finishing.current = false
    let cancelled = false
    pathwaysClient
      .getActivityProofUploadLimits(activity.projectId)
      .then((value) => {
        if (!cancelled && scope.isCurrent()) setLimits(value)
      })
      .catch(() => {
        // Advisory only; the fallback stays in place and the server still enforces its own limit.
      })
    return () => {
      cancelled = true
    }
  }, [activity, open])

  // Once the file set locks, disabling the note, add-files and Remove controls can strand focus
  // on an element that no longer accepts it; move focus to the visible explanation instead.
  useEffect(() => {
    if (!locked) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active.hasAttribute('disabled')) {
      lockedNoticeRef.current?.focus()
    }
  }, [locked])

  const addFiles = (selected: FileList | null) => {
    if (locked) return
    if (!selected || !selected.length) return
    const rejected: string[] = []
    const additions: ProofFileItem[] = []
    const existingSignature = new Set(files.map((item) => `${item.file.name}:${item.file.size}`))
    for (const file of Array.from(selected)) {
      const signature = `${file.name}:${file.size}`
      if (existingSignature.has(signature)) continue
      if (!limits.contentTypes.includes(file.type)) {
        rejected.push(`${file.name} (unsupported type)`)
        continue
      }
      if (file.size < 1 || file.size > limits.maxFileBytes) {
        rejected.push(`${file.name} (exceeds ${megabytes(limits.maxFileBytes)})`)
        continue
      }
      existingSignature.add(signature)
      additions.push({ key: crypto.randomUUID(), file, status: 'waiting' })
    }
    const room = limits.maxFiles - files.length
    const accepted = additions.slice(0, Math.max(0, room))
    if (additions.length > accepted.length)
      rejected.push(`only ${limits.maxFiles} files may be attached in total`)
    if (accepted.length) {
      setFiles((current) => [...current, ...accepted])
      setError('')
    }
    if (rejected.length)
      setError(
        `Some files were not added: ${rejected.join(', ')}. Accepted types are PDF, JPEG, PNG, WebP, MP4, MOV and WebM, up to ${megabytes(limits.maxFileBytes)} each.`,
      )
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (key: string) => {
    if (submitting || locked) return
    const index = files.findIndex((item) => item.key === key)
    setFiles((current) => current.filter((item) => item.key !== key))
    // Focus moves to the next remaining remove control, or back to the add-files control.
    requestAnimationFrame(() => {
      const remaining = document.querySelectorAll<HTMLButtonElement>(
        '[data-proof-remove-button="true"]',
      )
      const next = remaining[Math.min(index, remaining.length - 1)]
      if (next) next.focus()
      else fileInputRef.current?.focus()
    })
  }

  const setFileState = (key: string, patch: Partial<ProofFileItem>) => {
    setFiles((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const finish = async (committedActivity?: Activity) => {
    if (!activity || finishing.current) return
    finishing.current = true
    committed.current = true
    try {
      const record =
        committedActivity ?? (await pathwaysClient.getActivity(activity.projectId, activity.id))
      if (!scope.isCurrent()) return
      toast.success('Progress update submitted.', {
        description: `${files.length} proof file${files.length === 1 ? '' : 's'} submitted for review.`,
      })
      onSubmitted(record)
      onOpenChange(false)
    } catch {
      if (scope.isCurrent())
        setError(
          'The proof is committed. Reloading its current record failed; submit again to retry the reload only.',
        )
    } finally {
      finishing.current = false
      if (scope.isCurrent()) setSubmitting(false)
    }
  }

  // Uploads (when the reservation issued a signed URL) and always finalizes: a file that the
  // reservation already reported storageReady still needs its finalize call to trigger the
  // update's commit, so this never skips straight to a local 'uploaded' status.
  const processFile = async (item: ProofFileItem) => {
    if (!activity || !reservation.current || !item.evidenceId) return
    if (item.uploadUrl) {
      setFileState(item.key, { status: 'uploading', error: undefined })
      try {
        await pathwaysClient.uploadActivityProofFile(item.uploadUrl, item.file)
      } catch (caught) {
        if (!scope.isCurrent()) return
        setFileState(item.key, {
          status: 'failed',
          error:
            caught instanceof PathwaysClientError
              ? caught.message
              : 'This file could not be uploaded. Retry it.',
        })
        return
      }
    }
    if (!scope.isCurrent()) return
    try {
      const result = await pathwaysClient.finalizeActivityProofFile(
        activity.projectId,
        activity.id,
        reservation.current.updateId,
        item.evidenceId,
      )
      if (!scope.isCurrent()) return
      setFileState(item.key, { status: 'uploaded' })
      if (result.status === 'COMMITTED') {
        await finish('activity' in result ? result.activity : undefined)
      }
    } catch (caught) {
      if (!scope.isCurrent()) return
      setFileState(item.key, {
        status: 'failed',
        error:
          caught instanceof PathwaysClientError
            ? caught.message
            : 'This file could not be finalized. Retry it.',
      })
    }
  }

  const retryFile = async (key: string) => {
    const item = files.find((entry) => entry.key === key)
    if (!item || item.status === 'uploading') return
    await processFile(item)
  }

  const submitUpdate = async () => {
    if (!activity || submitting || !scope.isCurrent()) return
    if (!note.trim()) {
      setError('Enter an update note before submitting proof.')
      return
    }
    if (!files.length) {
      setError('Attach at least one proof file.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      // The update already committed on a prior attempt; only the post-commit reload needs a
      // retry here, never a second reservation.
      if (committed.current) {
        await finish()
        return
      }
      let workingFiles = files
      if (!reservation.current) {
        // First attempt for this note/file set: mint the reservation's clientUpdateId once and
        // reuse it for every later retry so a resubmit is idempotent on the server.
        const clientUpdateId = crypto.randomUUID()
        // Hash sequentially: files can total up to 250 MB, and hashing them all in parallel would
        // hold every buffer in memory at once.
        const declarations: ActivityProofFileDeclaration[] = []
        for (const item of files) {
          declarations.push({
            fileName: item.file.name,
            contentType: item.file.type,
            byteSize: item.file.size,
            sha256: item.sha256 ?? (await sha256Hex(item.file)),
          })
        }
        if (!scope.isCurrent()) return
        files.forEach((item, index) => {
          setFileState(item.key, { sha256: declarations[index].sha256 })
        })
        const reserved = await pathwaysClient.reserveActivityProofUpload({
          projectId: activity.projectId,
          activityId: activity.id,
          clientUpdateId,
          progressPercent: activity.progress,
          note: note.trim(),
          files: declarations,
        })
        if (!scope.isCurrent()) return
        if (reserved.status === 'COMMITTED') {
          await finish()
          return
        }
        reservation.current = { updateId: reserved.updateId, clientUpdateId }
        setLocked(true)
        const byName = new Map(
          reserved.files.map((row) => [`${row.fileName}:${row.byteSize}`, row]),
        )
        workingFiles = files.map((item) => {
          const row = byName.get(`${item.file.name}:${item.file.size}`)
          if (!row) return item
          setFileState(item.key, {
            evidenceId: row.evidenceId,
            uploadUrl: row.uploadUrl,
            status: 'waiting',
          })
          return {
            ...item,
            evidenceId: row.evidenceId,
            uploadUrl: row.uploadUrl,
            status: 'waiting' as FileStatus,
          }
        })
      }
      // Every reserved file needs processing, including one the reservation already reported as
      // storageReady (a READY_TO_COMMIT reply): it still needs its finalize call to commit.
      const targets = workingFiles.filter((item) => item.status !== 'uploaded' && item.evidenceId)
      await Promise.all(targets.map((item) => processFile(item)))
      if (scope.isCurrent() && !committed.current) setSubmitting(false)
    } catch (caught) {
      if (!scope.isCurrent()) return
      setError(
        caught instanceof Error
          ? caught.message
          : 'The activity update could not be completed. Review the details and try again.',
      )
      setSubmitting(false)
    }
  }

  const requestOpenChange = (next: boolean) => {
    if (!next && submitting) {
      setError('An upload is unresolved. Wait for it to finish, or retry a failed file, first.')
      return
    }
    onOpenChange(next)
  }

  const uploadedCount = files.filter((item) => item.status === 'uploaded').length
  const liveStatus = submitting
    ? `Submitting proof: ${uploadedCount} of ${files.length} file${files.length === 1 ? '' : 's'} uploaded.`
    : files.length
      ? `${files.length} file${files.length === 1 ? '' : 's'} selected.`
      : 'No files selected.'

  return (
    <Dialog onOpenChange={requestOpenChange} open={open}>
      <DialogShell
        title="Submit proof"
        description="Record a progress update and attach supporting evidence for review."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            void submitUpdate()
          }}
        >
          <output aria-atomic="true" aria-live="polite" className="sr-only block">
            {liveStatus}
          </output>
          <div className="space-y-2">
            <Label htmlFor="activity-beneficiaries-reached">Beneficiaries reached this session</Label>
            <Input
              aria-describedby="activity-beneficiaries-reached-hint"
              aria-invalid={beneficiariesError}
              disabled
              id="activity-beneficiaries-reached"
              min={0}
              onChange={(event) => {
                setBeneficiariesReachedThisSession(Number(event.target.value))
                if (beneficiariesError) setError('')
              }}
              title="Not available yet"
              type="number"
              step={1}
              value={beneficiariesReachedThisSession}
            />
            <p className="text-sm text-muted-foreground" id="activity-beneficiaries-reached-hint">
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
              disabled={submitting || locked}
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
                  className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-subtle p-3"
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
                noteError ? 'activity-note-error' : fileError ? 'activity-proof-error' : undefined
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
