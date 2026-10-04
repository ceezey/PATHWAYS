'use client'

import {
  Camera,
  Eye,
  FileImage,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  Video,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/pathways/empty-state'
import { StatusBadge } from '@/components/pathways/status-badge'
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
import { sha256Hex } from '@/lib/files/proof-file-hash'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type {
  ActivityProofFileDeclaration,
  BeneficiaryMediaItem,
  BeneficiaryMediaLimits,
} from '@/types/pathways'

import { formatMediaFileSize } from './beneficiary-media-utils'
import { formatDate } from './beneficiary-utils'

type MediaFilter = 'All' | 'PHOTO' | 'VIDEO'
type FileStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed'
type LoadState = 'loading' | 'error' | 'ready'

interface UploadItem {
  key: string
  file: File
  status: FileStatus
  error?: string
  mediaId?: string
  uploadUrl?: string | null
}

const maxNote = 500
const filterLabels: Record<MediaFilter, string> = { All: 'All', PHOTO: 'Photos', VIDEO: 'Videos' }
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

export const BeneficiaryMediaProof = ({
  beneficiaryId,
  canManage,
  projectId,
}: {
  beneficiaryId: string
  canManage: boolean
  projectId: string
}) => {
  const [items, setItems] = useState<BeneficiaryMediaItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [filter, setFilter] = useState<MediaFilter>('All')
  const [addOpen, setAddOpen] = useState(false)
  const [viewing, setViewing] = useState<BeneficiaryMediaItem | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      setItems(await pathwaysClient.listBeneficiaryMedia(projectId, beneficiaryId))
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [projectId, beneficiaryId])

  useEffect(() => {
    void load()
  }, [load])

  const photoCount = items.filter((item) => item.type === 'PHOTO').length
  const videoCount = items.filter((item) => item.type === 'VIDEO').length
  const visible = items.filter((item) => filter === 'All' || item.type === filter)

  return (
    <section
      aria-labelledby="beneficiary-media-title"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="border-b border-border bg-surface-subtle p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Beneficiary evidence
            </p>
            <h2 className="text-xl font-semibold text-foreground" id="beneficiary-media-title">
              Media proof
            </h2>
            <p className="max-w-3xl text-base leading-6 text-muted-foreground">
              Photos and videos attached to this beneficiary record. Media remains private to
              authorized staff.
            </p>
          </div>
          {canManage ? (
            <Button
              className="w-full gap-2 sm:w-auto"
              onClick={() => setAddOpen(true)}
              type="button"
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              Add media
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-info/25 bg-info-subtle p-3 text-xs leading-5 text-info">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Uploaded files are private and are not published.</p>
        </div>
      </div>

      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-3">
        <MediaKpi icon={FileImage} label="Media items" value={items.length} />
        <MediaKpi icon={Camera} label="Photos" value={photoCount} />
        <MediaKpi icon={Video} label="Videos" value={videoCount} />
      </div>

      <div className="p-4 sm:p-5">
        <fieldset className="mb-5 grid grid-cols-3 gap-2 sm:flex">
          <legend className="sr-only">Filter media proof</legend>
          {(Object.keys(filterLabels) as MediaFilter[]).map((value) => (
            <Button
              aria-pressed={filter === value}
              className="w-full sm:w-auto"
              key={value}
              onClick={() => setFilter(value)}
              size="sm"
              type="button"
              variant={filter === value ? 'default' : 'outline'}
            >
              {value === 'All' ? `All (${items.length})` : filterLabels[value]}
            </Button>
          ))}
        </fieldset>

        {loadState === 'loading' ? (
          <output className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading media proof
          </output>
        ) : loadState === 'error' ? (
          <EmptyState
            action={
              <Button onClick={() => void load()} type="button" variant="outline">
                Retry
              </Button>
            }
            description="Media proof could not be loaded."
            icon={Camera}
            title="Media proof unavailable"
            tone="danger"
          />
        ) : visible.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((item) => (
              <article
                aria-label={`Media proof: ${item.fileName}`}
                className="flex min-w-0 flex-col gap-3 rounded-sm border border-border bg-background p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium leading-6 text-foreground">
                      {item.fileName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.type === 'PHOTO' ? 'Photo' : 'Video'} ·{' '}
                      {formatMediaFileSize(item.byteSize)}
                    </p>
                  </div>
                  <StatusBadge tone="success">Uploaded</StatusBadge>
                </div>
                <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {item.description ?? 'No evidence note was added.'}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {formatDate(item.submittedAt)} · {item.submittedBy}
                  </p>
                  <Button
                    aria-label={`Preview ${item.fileName}`}
                    className="shrink-0 gap-2"
                    onClick={() => setViewing(item)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    Preview
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              canManage ? (
                <Button onClick={() => setAddOpen(true)} type="button" variant="outline">
                  Add media
                </Button>
              ) : undefined
            }
            description={
              canManage
                ? 'Add a photo or video to this beneficiary record.'
                : 'No photos or videos have been attached to this beneficiary record.'
            }
            icon={filter === 'VIDEO' ? Video : Camera}
            title="None yet"
          />
        )}
      </div>

      {addOpen ? (
        <AddMediaDialog
          beneficiaryId={beneficiaryId}
          onOpenChange={setAddOpen}
          onUploaded={() => void load()}
          projectId={projectId}
        />
      ) : null}
      <MediaViewer
        beneficiaryId={beneficiaryId}
        item={viewing}
        onClose={() => setViewing(null)}
        projectId={projectId}
      />
    </section>
  )
}

const AddMediaDialog = ({
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
    pathwaysClient
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
        await pathwaysClient.uploadActivityProofFile(item.uploadUrl, item.file)
        uploadedKeys.current.add(item.key)
      }
      await pathwaysClient.finalizeBeneficiaryMedia(projectId, beneficiaryId, item.mediaId)
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
      const reserved = await pathwaysClient.reserveBeneficiaryMedia(projectId, beneficiaryId, {
        files: declarations,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
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

// The file loads as an authorized blob only when previewed, so no bytes are fetched for the list.
const MediaViewer = ({
  beneficiaryId,
  item,
  onClose,
  projectId,
}: {
  beneficiaryId: string
  item: BeneficiaryMediaItem | null
  onClose: () => void
  projectId: string
}) => {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [attempt, setAttempt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the load on Retry.
  useEffect(() => {
    if (!item) return
    let cancelled = false
    let objectUrl: string | null = null
    setState('loading')
    setUrl(null)
    pathwaysClient
      .getBeneficiaryMediaBlob(projectId, beneficiaryId, item.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setState('ready')
      })
      .catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item, projectId, beneficiaryId, attempt])

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(item)}>
      {item ? (
        <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Media preview</DialogTitle>
            <DialogDescription>{item.fileName}</DialogDescription>
          </DialogHeader>
          {state === 'loading' ? (
            <output className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading preview
            </output>
          ) : state === 'error' || !url ? (
            <EmptyState
              action={
                <Button
                  onClick={() => setAttempt((value) => value + 1)}
                  type="button"
                  variant="outline"
                >
                  Retry
                </Button>
              }
              description="The preview could not be loaded."
              tone="danger"
              title="Preview unavailable"
            />
          ) : item.type === 'PHOTO' ? (
            // Blob URLs are browser-local and cannot use the Next.js image optimizer.
            <img
              alt={`Preview: ${item.fileName}`}
              className="max-h-[60vh] w-full object-contain"
              src={url}
            />
          ) : (
            <video
              aria-label={`Preview: ${item.fileName}`}
              className="max-h-[60vh] w-full bg-ink object-contain"
              controls
              src={url}
            >
              <track kind="captions" />
            </video>
          )}
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="outline">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

const MediaKpi = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Camera
  label: string
  value: number
}) => (
  <article className="flex items-start justify-between gap-3 bg-card p-4 sm:p-5">
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
    <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary-subtle text-primary">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  </article>
)
