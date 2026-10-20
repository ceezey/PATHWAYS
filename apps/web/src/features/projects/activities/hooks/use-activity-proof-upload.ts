import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import type { SensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { sha256Hex } from '@/lib/files/proof-file-hash'
import type {
  Activity,
  ActivityProofFileDeclaration,
  ActivityProofUploadLimits,
} from '@/types/pathways'

import {
  type FileStatus,
  type ProofFileItem,
  conflictMessage,
  fallbackLimits,
  megabytes,
} from '../activity-proof-upload.utils'

export const useActivityProofUpload = ({
  activity,
  onOpenChange,
  onSubmitted,
  open,
  scope,
}: {
  activity: Activity | null
  onOpenChange: (open: boolean) => void
  onSubmitted: (activity: Activity) => void
  open: boolean
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
  // An earlier reservation of the current user whose bytes never finished uploading. Reserving
  // again with its clientUpdateId is idempotent on the server, so the officer re-selects the
  // same files and finishes it instead of being blocked by a second reservation.
  const resume = activity?.updateNotes?.find((item) => item.resumeClientUpdateId) ?? null
  // committed marks the update as durably committed server-side (retries after this point must
  // only retry the post-commit reload, never reserve a second update). finishing guards against
  // overlapping finish() calls without blocking a later retry after a failed reload.
  const committed = useRef(false)
  const finishing = useRef(false)
  // Keys of files whose signed-URL upload succeeded: the URL is single-use, so a retry of any
  // later step (finalize, Submit) must never upload the file again.
  const uploadedKeys = useRef(new Set<string>())
  const [beneficiariesReachedThisSession, setBeneficiariesReachedThisSession] = useState('')
  const progressError = error.startsWith('Progress must')
  const noteError = error === 'Enter an update note before submitting proof.'
  const fileError = error.startsWith('Attach') || error.startsWith('Select up to')
  const beneficiariesError = error.startsWith('Beneficiaries reached this session')

  // Empty is allowed; otherwise a whole number from 0 to 100000. Returns null when the field
  // should not be sent at all (empty), a number when valid, or undefined when invalid.
  const parsedBeneficiariesReachedThisSession = (): number | null | undefined => {
    const trimmed = beneficiariesReachedThisSession.trim()
    if (!trimmed) return null
    if (!/^\d+$/.test(trimmed)) return undefined
    const value = Number(trimmed)
    if (!Number.isInteger(value) || value < 0 || value > 100000) return undefined
    return value
  }

  // The progress field follows the beneficiary-based suggestion until the officer edits it.
  const [progressText, setProgressText] = useState('')
  const [progressEdited, setProgressEdited] = useState(false)
  // Completion is an explicit officer choice; the derived bar alone never reaches 100.
  const [completes, setCompletes] = useState(false)
  const suggestion = (() => {
    if (resume || !activity) return null
    const target = activity.targetBeneficiaries
    const reached = activity.beneficiariesReached
    if (typeof target !== 'number' || !(target > 0) || typeof reached !== 'number') return null
    const session = parsedBeneficiariesReachedThisSession()
    const total = reached + (typeof session === 'number' ? session : 0)
    const percent = Math.floor((total / target) * 100)
    // Automatic suggestions never reach 100: completion is only ever an explicit choice.
    return {
      percent: completes ? 100 : Math.min(99, Math.max(activity.progress, percent)),
      total,
      target,
      includesSession: typeof session === 'number',
    }
  })()
  const progressValue = resume
    ? String(resume.progress)
    : suggestion
      ? String(suggestion.percent)
      : progressEdited
        ? progressText
        : String(activity?.progress ?? 0)

  const numericProgress = progressValue.trim() === '' ? Number.NaN : Number(progressValue)
  const lowerNotice =
    !resume &&
    progressEdited &&
    activity !== null &&
    activity !== undefined &&
    Number.isInteger(numericProgress) &&
    numericProgress >= 0 &&
    numericProgress < activity.progress

  // biome-ignore lint/correctness/useExhaustiveDependencies: scope is stable per instance key.
  useEffect(() => {
    if (!activity || !open) return
    setProgressText('')
    setProgressEdited(false)
    setCompletes(false)
    setNote(resume?.note ?? '')
    setFiles([])
    setError('')
    setLocked(false)
    setBeneficiariesReachedThisSession(
      resume?.beneficiariesReachedThisSession == null
        ? ''
        : String(resume.beneficiariesReachedThisSession),
    )
    reservation.current = null
    committed.current = false
    finishing.current = false
    uploadedKeys.current = new Set()
    let cancelled = false
    activitiesClient
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
        committedActivity ?? (await activitiesClient.getActivity(activity.projectId, activity.id))
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
  const processFile = async (item: ProofFileItem): Promise<boolean> => {
    if (!activity || !reservation.current || !item.evidenceId) return false
    if (item.uploadUrl && !uploadedKeys.current.has(item.key)) {
      setFileState(item.key, { status: 'uploading', error: undefined })
      try {
        await activitiesClient.uploadActivityProofFile(item.uploadUrl, item.file)
        uploadedKeys.current.add(item.key)
      } catch (caught) {
        if (!scope.isCurrent()) return false
        setFileState(item.key, {
          status: 'failed',
          error:
            caught instanceof PathwaysClientError
              ? caught.message
              : 'This file could not be uploaded. Retry it.',
        })
        return false
      }
    }
    if (!scope.isCurrent()) return false
    try {
      const result = await activitiesClient.finalizeActivityProofFile(
        activity.projectId,
        activity.id,
        reservation.current.updateId,
        item.evidenceId,
      )
      if (!scope.isCurrent()) return false
      setFileState(item.key, { status: 'uploaded' })
      if (result.status === 'COMMITTED') {
        await finish('activity' in result ? result.activity : undefined)
      }
      return true
    } catch (caught) {
      if (!scope.isCurrent()) return false
      setFileState(item.key, {
        status: 'failed',
        error:
          caught instanceof PathwaysClientError
            ? caught.message
            : 'This file could not be finalized. Retry it.',
      })
      return false
    }
  }

  const retryFile = async (key: string) => {
    const item = files.find((entry) => entry.key === key)
    if (!item || item.status === 'uploading') return
    setError('')
    const ok = await processFile(item)
    // Once this was the last file to land, an UPLOADING reply can still mean the update is ready:
    // one more idempotent finalize commits it, and a miss is reported rather than left silent.
    const allUploaded = files.every((entry) => entry.key === key || entry.status === 'uploaded')
    if (ok && allUploaded && scope.isCurrent() && !committed.current) {
      await processFile(item)
      if (scope.isCurrent() && !committed.current)
        setError(
          'The proof files are uploaded, but the update was not submitted for review. Select Submit proof to retry.',
        )
    }
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
    const beneficiaries = parsedBeneficiariesReachedThisSession()
    if (beneficiaries === undefined) {
      setError('Beneficiaries reached this session must be a whole number from 0 to 100000.')
      return
    }
    const progressPercent = resume ? resume.progress : Number(progressValue)
    if (
      !progressValue.trim() ||
      !Number.isInteger(progressPercent) ||
      progressPercent < 0 ||
      progressPercent > 100
    ) {
      setError('Progress must be a whole number from 0 to 100.')
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
        const clientUpdateId = resume?.resumeClientUpdateId ?? crypto.randomUUID()
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
        const reserved = await activitiesClient.reserveActivityProofUpload({
          projectId: activity.projectId,
          activityId: activity.id,
          clientUpdateId,
          progressPercent,
          note: note.trim(),
          files: declarations,
          ...(beneficiaries === null ? {} : { beneficiariesReachedThisSession: beneficiaries }),
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
      const pendingTargets = workingFiles.filter(
        (item) => item.status !== 'uploaded' && item.evidenceId,
      )
      // Every file already finalized but the update never committed: the retry is one finalize of
      // a reserved file, which is idempotent and commits an update whose files are all ready.
      const lastReserved = workingFiles.filter((item) => item.evidenceId).at(-1)
      const targets = pendingTargets.length ? pendingTargets : lastReserved ? [lastReserved] : []
      const outcomes = await Promise.all(targets.map((item) => processFile(item)))
      // Finalizes that ran together can each report UPLOADING while the update is in fact ready.
      // One more finalize, after all of them settled, is idempotent and commits it.
      if (
        scope.isCurrent() &&
        !committed.current &&
        outcomes.every(Boolean) &&
        pendingTargets.length
      ) {
        await processFile(targets[targets.length - 1])
      }
      if (scope.isCurrent() && !committed.current) {
        setSubmitting(false)
        // Never leave an unfinished submission silent: the update stays reserved until it commits.
        setError(
          outcomes.some((ok) => !ok)
            ? 'Not every proof file was uploaded, so this update is not submitted for review yet. Retry the failed files below.'
            : 'The proof files are uploaded, but the update was not submitted for review. Select Submit proof to retry.',
        )
      }
    } catch (caught) {
      if (!scope.isCurrent()) return
      setError(
        caught instanceof PathwaysClientError && caught.status === 409
          ? resume && /different input/i.test(caught.message)
            ? 'These files do not match the ones first selected for this update. Select the original files to finish it.'
            : conflictMessage(caught.message)
          : caught instanceof Error
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

  return {
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
  }
}
