'use client'

import { CloudOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Modal skeleton shown while the activity editor's officers, indicators and stages load. */
export const ActivityEditorLoadingDialog = ({
  failed,
  onOpenChange,
  onRetry,
  open,
}: {
  failed: boolean
  onOpenChange: (open: boolean) => void
  onRetry: () => void
  open: boolean
}) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="max-w-md rounded-lg">
      {failed ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <CloudOff className="h-5 w-5" aria-hidden="true" />
          </span>
          <DialogTitle>Activity editor couldn't load</DialogTitle>
          <DialogDescription>
            Officers, indicators or journey stages are unavailable. Check the connection and try
            again.
          </DialogDescription>
          <Button onClick={onRetry} type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : (
        <output aria-busy="true" aria-live="polite" className="block space-y-4">
          <div className="space-y-3" aria-hidden="true">
            <div className="h-4 w-2/5 animate-pulse rounded-md bg-secondary" />
            <div className="h-3 w-full animate-pulse rounded-md bg-muted" />
            <div className="h-3 w-3/5 animate-pulse rounded-md bg-muted" />
            <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
          </div>
          <div className="text-center">
            <DialogTitle className="text-base">Loading activity editor</DialogTitle>
            <DialogDescription className="mt-1">
              Preparing officers, indicators and journey stages.
            </DialogDescription>
          </div>
        </output>
      )}
    </DialogContent>
  </Dialog>
)
