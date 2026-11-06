'use client'

import { Loader2, UploadCloud } from 'lucide-react'

import { MediaUploadFields } from '@/components/pathways/media-upload-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMediaUpload } from '@/hooks/use-media-upload'
import { publicMediaClient } from '@/lib/api/public-media'

export const AddPublicMediaDialog = ({
  onOpenChange,
  onUploaded,
  projectId,
}: {
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
  projectId: string
}) => {
  const upload = useMediaUpload({
    loadLimits: () => publicMediaClient.limits(projectId),
    reserve: (files) => publicMediaClient.reserve(projectId, { files }),
    finalize: (mediaId) => publicMediaClient.finalize(projectId, mediaId),
    onDone: () => {
      onUploaded()
      onOpenChange(false)
    },
  })
  const { busy, error, locked, submit } = upload

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
          <DialogTitle>Upload photos or videos</DialogTitle>
          <DialogDescription>
            Uploads wait for a different reviewer to approve them before they can be picked for the
            public page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <MediaUploadFields inputId="public-media-files" upload={upload} />
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
