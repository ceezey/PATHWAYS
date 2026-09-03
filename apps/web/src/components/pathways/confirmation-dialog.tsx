'use client'

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
          <Button onClick={onConfirm} type="button" variant={confirmVariant}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
