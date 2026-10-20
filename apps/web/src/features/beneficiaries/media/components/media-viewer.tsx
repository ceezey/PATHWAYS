'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { beneficiaryMediaClient } from '@/lib/api/beneficiary-media'
import type { BeneficiaryMediaItem } from '@/types/pathways'

import type { LoadState } from '../media.utils'

// The file loads as an authorized blob only when previewed, so no bytes are fetched for the list.
export const MediaViewer = ({
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
    beneficiaryMediaClient
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
