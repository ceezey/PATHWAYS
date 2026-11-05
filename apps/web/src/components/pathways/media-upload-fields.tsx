'use client'

import { RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { useMediaUpload } from '@/hooks/use-media-upload'
import { formatMediaFileSize } from '@/lib/files/format-file-size'

const typeLabels: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WebM',
}
const statusLabel = {
  waiting: 'Waiting',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  failed: 'Failed',
}

// The file chooser, limit text and per-file status list of a media upload dialog.
export const MediaUploadFields = ({
  inputId,
  upload,
}: {
  inputId: string
  upload: ReturnType<typeof useMediaUpload>
}) => {
  const { addFiles, busy, files, inputRef, limits, locked, remove, retry } = upload
  const typeList = limits.contentTypes.map((type) => typeLabels[type] ?? type).join(', ')
  const limitText = `${typeList} · up to ${limits.maxFiles} files · ${formatMediaFileSize(limits.maxFileBytes)} per file.`
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={inputId}>Photo or video files</Label>
        <Input
          accept={limits.contentTypes.join(',')}
          disabled={busy || locked}
          id={inputId}
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
                    onClick={() => remove(item.key)}
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
    </>
  )
}
