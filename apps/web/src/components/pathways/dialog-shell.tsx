import type { ReactNode } from 'react'

import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const DialogShell = ({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description: string
  children: ReactNode
  actions?: ReactNode
}) => (
  <DialogContent className="rounded-lg">
    {/* Header actions sit just left of the dialog close button. */}
    {actions ? <div className="absolute right-14 top-2 flex gap-2">{actions}</div> : null}
    <DialogHeader className={actions ? 'pr-24' : undefined}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    {children}
  </DialogContent>
)
