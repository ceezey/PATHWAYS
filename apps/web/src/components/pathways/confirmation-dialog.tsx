'use client'

import { TriangleAlert } from 'lucide-react'
import { type ReactNode, useRef } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const ConfirmationDialog = ({
  cancelLabel = 'Cancel',
  children,
  confirmDisabled = false,
  confirmLabel,
  confirmVariant = 'destructive',
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  cancelLabel?: string
  children?: ReactNode
  confirmDisabled?: boolean
  confirmLabel: string
  confirmVariant?: React.ComponentProps<typeof Button>['variant']
  description: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelButtonRef.current?.focus()
        }}
      >
        {confirmVariant === 'destructive' ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <TriangleAlert aria-hidden="true" className="h-5 w-5" />
          </div>
        ) : null}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={confirmDisabled}
            onClick={onConfirm}
            type="button"
            variant={confirmVariant}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
