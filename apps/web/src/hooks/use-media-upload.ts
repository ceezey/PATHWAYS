import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import { formatMediaFileSize } from '@/lib/files/format-file-size'
import { sha256Hex } from '@/lib/files/proof-file-hash'
import type { ActivityProofFileDeclaration, BeneficiaryMediaLimits } from '@/types/pathways'

type FileStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed'

export interface UploadItem {
  key: string
  file: File
  status: FileStatus
  error?: string
  mediaId?: string
  uploadUrl?: string | null
}

export interface ReservedUpload {
  mediaId: string
  fileName: string
  sha256: string
  uploadUrl: string | null
}

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

// The hash, reserve, upload and finalize flow shared by the media upload dialogs.
export const useMediaUpload = (api: {
  loadLimits: () => Promise<BeneficiaryMediaLimits>
  reserve: (files: ActivityProofFileDeclaration[]) => Promise<ReservedUpload[]>
  finalize: (mediaId: string) => Promise<unknown>
  onDone: () => void
}) => {
  const [limits, setLimits] = useState(fallbackLimits)
  const [files, setFiles] = useState<UploadItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The reserved set is locked: only per-file Retry remains until every file is uploaded.
  const [locked, setLocked] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const uploadedKeys = useRef(new Set<string>())
  // A dialog mounts once per open, so the latest callbacks are read at call time.
  const latest = useRef(api)
  latest.current = api

  useEffect(() => {
    let cancelled = false
    latest.current
      .loadLimits()
      .then((value) => !cancelled && setLimits(value))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const patch = (key: string, change: Partial<UploadItem>) =>
    setFiles((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))

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

  const remove = (key: string) => setFiles((current) => current.filter((item) => item.key !== key))

  const processFile = async (item: UploadItem) => {
    if (!item.mediaId) return false
    try {
      if (item.uploadUrl && !uploadedKeys.current.has(item.key)) {
        patch(item.key, { status: 'uploading', error: undefined })
        await activitiesClient.uploadActivityProofFile(item.uploadUrl, item.file)
        uploadedKeys.current.add(item.key)
      }
      await latest.current.finalize(item.mediaId)
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
      latest.current.onDone()
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
      const reserved = await latest.current.reserve(declarations)
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

  return { addFiles, busy, error, files, inputRef, limits, locked, remove, retry, submit }
}
