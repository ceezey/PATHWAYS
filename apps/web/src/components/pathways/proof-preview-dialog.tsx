'use client'

import { Download, FileQuestion } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CoreArtifact } from '@/lib/services/core-feature-client'

import { AsyncState } from './async-state'

type Loaded = { artifact: CoreArtifact; url: string }

type ProofPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  load: () => Promise<CoreArtifact>
  save: (artifact: CoreArtifact) => void
}

/** Fetches a private proof file while open, previews it by real MIME type and revokes it on close. */
export const ProofPreviewDialog = ({
  open,
  onOpenChange,
  title,
  load,
  save,
}: ProofPreviewDialogProps) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter deliberately restarts the same request.
  useEffect(() => {
    if (!open) return
    let active = true
    let url = ''
    setLoaded(null)
    setError('')
    loadRef
      .current()
      .then((artifact) => {
        if (!active) return
        url = URL.createObjectURL(artifact.blob)
        setLoaded({ artifact, url })
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Preview unavailable.')
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
      setLoaded(null)
    }
  }, [open, attempt])

  const mime = loaded?.artifact.blob.type ?? ''
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Private file shown only while this window is open.</DialogDescription>
        </DialogHeader>
        {error ? (
          <AsyncState
            description={error}
            onRetry={() => setAttempt((value) => value + 1)}
            status="error"
            title="Preview unavailable"
          />
        ) : !loaded ? (
          <AsyncState
            description="Fetching the file privately."
            status="loading"
            title="Loading preview"
          />
        ) : mime.startsWith('image/') ? (
          <div className="max-h-[60dvh] overflow-auto rounded-md border border-border bg-surface-subtle p-2">
            {/* Blob URLs are browser-local and cannot use the Next.js image optimizer. */}
            <img alt={title} className="mx-auto h-auto max-w-full" src={loaded.url} />
          </div>
        ) : mime === 'application/pdf' ? (
          <iframe
            className="h-[60dvh] w-full rounded-md border border-border"
            src={loaded.url}
            title={title}
          />
        ) : mime.startsWith('video/') ? (
          // biome-ignore lint/a11y/useMediaCaption: proof recordings have no caption track
          <video className="max-h-[60dvh] w-full rounded-md" controls src={loaded.url} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface-subtle p-8 text-center text-sm text-muted-foreground">
            <FileQuestion aria-hidden="true" className="h-6 w-6" />
            Preview not available for this file type.
          </div>
        )}
        <DialogFooter>
          <Button
            className="gap-2"
            disabled={!loaded}
            onClick={() => loaded && save(loaded.artifact)}
            type="button"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
