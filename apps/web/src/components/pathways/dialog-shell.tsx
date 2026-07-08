import type { ReactNode } from 'react'

import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const DialogShell = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <DialogContent className="rounded-lg">
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    {children}
  </DialogContent>
)
