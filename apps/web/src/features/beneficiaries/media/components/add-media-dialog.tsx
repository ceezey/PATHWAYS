'use client'

import { Loader2, UploadCloud } from 'lucide-react'
import { useState } from 'react'

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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMediaUpload } from '@/hooks/use-media-upload'
import { beneficiaryMediaClient } from '@/lib/api/beneficiary-media'

const maxNote = 500

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
  const [note, setNote] = useState('')
  const upload = useMediaUpload({
    loadLimits: () => beneficiaryMediaClient.getBeneficiaryMediaLimits(projectId, beneficiaryId),
    reserve: (files) =>
      beneficiaryMediaClient.reserveBeneficiaryMedia(projectId, beneficiaryId, {
        files,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    finalize: (mediaId) =>
      beneficiaryMediaClient.finalizeBeneficiaryMedia(projectId, beneficiaryId, mediaId),
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
          <DialogTitle>Add media</DialogTitle>
          <DialogDescription>Attach photos or videos to this beneficiary record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <MediaUploadFields inputId="beneficiary-media-files" upload={upload} />

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
