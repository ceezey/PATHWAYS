'use client'

import { Loader2, RotateCcw, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { activitiesClient } from '@/lib/api/activities'
import { beneficiaryMediaClient } from '@/lib/api/beneficiary-media'
import { PathwaysClientError } from '@/lib/api/core/request'
import { sha256Hex } from '@/lib/files/proof-file-hash'
import type { ActivityProofFileDeclaration, BeneficiaryMediaLimits } from '@/types/pathways'

import { formatMediaFileSize } from '../media.utils'

type FileStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed'

interface UploadItem {
  key: string
  file: File
  status: FileStatus
  error?: string
  mediaId?: string
  uploadUrl?: string | null
}

const maxNote = 500
// Advisory defaults shown before the server limits load; the server stays authoritative.
const fallbackLimits: BeneficiaryMediaLimits = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024,
  contentTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
}
const typeLabels: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WebM',
}

export const AddMediaDialog = ({
  beneficiaryId,
  onOpenChange,
  onUploaded,
  projectId,
}: {
  beneficiaryId: string
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
  projectId: string
}) => {
  const [limits, setLimits] = useState(fallbackLimits)
  const [files, setFiles] = useState<UploadItem[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The reserved set is locked: only per-file Retry remains until every file is uploaded.
  const [locked, setLocked] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploadedKeys = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    beneficiaryMediaClient
      .getBeneficiaryMediaLimits(projectId, beneficiaryId)
      .then((value) => !cancelled && setLimits(value))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [projectId, beneficiaryId])

  const patch = (key: string, change: Partial<UploadItem>) =>
    setFiles((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))

  const typeList = limits.contentTypes.map((type) => typeLabels[type] ?? type).join(', ')
  const limitText = `${typeList} · up to ${limits.maxFiles} files · ${formatMediaFileSize(limits.maxFileBytes)} per file.`

  const addFiles = (selected: File[]) => {
    if (locked) return
    const rejected: string[] = []
    const accepted: UploadItem[] = []
    const seen = new Set(files.map((item) => `${item.file.name}:${item.file.size}`))
    for (const file of selected) {
      const signature = `${file.name}:${file.size}`
      if (seen.has(signature)) continue
      if (!limits.contentTypes.includes(file.type)) rejected.push(`${file.name} (unsupported type)`)
      else if (file.size < 1 || file.size > limits.maxFileBytes)
        rejected.push(`${file.name} (over ${formatMediaFileSize(limits.maxFileBytes)})`)
      else if (files.length + accepted.length >= limits.maxFiles)
        rejected.push(`${file.name} (over ${limits.maxFiles} files)`)
      else {
        seen.add(signature)
        accepted.push({ key: crypto.randomUUID(), file, status: 'waiting' })
      }
    }
    setFiles((current) => [...current, ...accepted])
    setError(rejected.length ? `Some files were not added: ${rejected.join(', ')}.` : '')
    if (inputRef.current) inputRef.current.value = ''
  }

  const processFile = async (item: UploadItem) => {
    if (!item.mediaId) return false
    try {
      if (item.uploadUrl && !uploadedKeys.current.has(item.key)) {
        patch(item.key, { status: 'uploading', error: undefined })
        await activitiesClient.uploadActivityProofFile(item.uploadUrl, item.file)
        uploadedKeys.current.add(item.key)
      }
      await beneficiaryMediaClient.finalizeBeneficiaryMedia(projectId, beneficiaryId, item.mediaId)
      patch(item.key, { status: 'uploaded', error: undefined })
      return true
    } catch (caught) {
      // The server may have deleted a mismatched object, so a retry uploads it again.
      uploadedKeys.current.delete(item.key)
      patch(item.key, {
        status: 'failed',
        error:
          caught instanceof PathwaysClientError
            ? caught.message
            : 'This file could not be uploaded. Retry it.',
      })
      return false
    }
  }

  const complete = (results: boolean[]) => {
    setBusy(false)
    if (results.every(Boolean)) {
      toast.success('Media uploaded.')
      onUploaded()
      onOpenChange(false)
    } else setError('Not every file was uploaded. Retry the failed files below.')
  }

  const submit = async () => {
    if (busy) return
    if (!files.length) {
      setError('Choose at least one photo or video.')
      return
    }
    setBusy(true)
    setError('')
    try {
      // Hash one file at a time so large videos are never all held in memory together.
      const declarations: ActivityProofFileDeclaration[] = []
      for (const item of files)
        declarations.push({
          fileName: item.file.name,
          contentType: item.file.type,
          byteSize: item.file.size,
          sha256: await sha256Hex(item.file),
        })
      const reserved = await beneficiaryMediaClient.reserveBeneficiaryMedia(
        projectId,
        beneficiaryId,
        {
          files: declarations,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      )
      setLocked(true)
      // Each file is matched to its reservation by name and digest, never by position.
      const working = files.map((item, index) => {
        const row = reserved.find(
          (entry) =>
            entry.fileName === declarations[index].fileName &&
            entry.sha256 === declarations[index].sha256,
        )
        return row
          ? { ...item, mediaId: row.mediaId, uploadUrl: row.uploadUrl }
          : {
              ...item,
              status: 'failed' as const,
              error: `${item.file.name} was not reserved for upload. Close this dialog and add it again.`,
            }
      })
      setFiles(working)
      complete(await Promise.all(working.map((item) => (item.mediaId ? processFile(item) : false))))
    } catch (caught) {
      setBusy(false)
      setError(
        caught instanceof Error ? caught.message : 'The media could not be uploaded. Try again.',
      )
    }
  }

  const retry = async (key: string) => {
    const item = files.find((entry) => entry.key === key)
    if (!item || busy) return
    setBusy(true)
    setError('')
    const ok = await processFile(item)
    complete([
      ok,
      ...files.filter((entry) => entry.key !== key).map((e) => e.status === 'uploaded'),
    ])
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && busy) return
        onOpenChange(open)
      }}
      open
    >
      <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add media</DialogTitle>
          <DialogDescription>Attach photos or videos to this beneficiary record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="beneficiary-media-files">Photo or video files</Label>
            <Input
              accept={limits.contentTypes.join(',')}
              disabled={busy || locked}
              id="beneficiary-media-files"
              multiple
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
              ref={inputRef}
              type="file"
            />
            <p className="text-xs leading-5 text-muted-foreground">{limitText}</p>
          </div>

          {files.length > 0 ? (
            <ul className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3">
              {files.map((item) => (
                <li
                  className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                  key={item.key}
                >
                  <span className="min-w-0 truncate">
                    {item.file.name} · {formatMediaFileSize(item.file.size)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span>{statusLabel[item.status]}</span>
                    {item.status === 'failed' && item.mediaId ? (
                      <Button
                        aria-label={`Retry ${item.file.name}`}
                        disabled={busy}
                        onClick={() => void retry(item.key)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Retry
                      </Button>
                    ) : null}
                    {!locked && !busy ? (
                      <Button
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() =>
                          setFiles((current) => current.filter((entry) => entry.key !== item.key))
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {files.some((item) => item.error) ? (
            <p className="text-sm text-destructive">{files.find((item) => item.error)?.error}</p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="beneficiary-media-note">Evidence note (optional)</Label>
            <Textarea
              disabled={busy || locked}
              id="beneficiary-media-note"
              maxLength={maxNote}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Describe what the media shows and why it supports the record."
              value={note}
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {locked ? 'Close' : 'Cancel'}
          </Button>
          {locked ? null : (
            <Button className="gap-2" disabled={busy} onClick={() => void submit()} type="button">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
              )}
              Upload media
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const statusLabel: Record<FileStatus, string> = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  failed: 'Failed',
}
