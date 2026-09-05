'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ theme = 'light', ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: 'group toast rounded-lg border bg-card text-foreground shadow-popover',
        description: 'text-muted-foreground',
        actionButton: 'rounded-md bg-primary text-primary-foreground hover:bg-primary-hover',
        cancelButton: 'rounded-md bg-secondary text-secondary-foreground hover:bg-muted',
      },
    }}
    {...props}
  />
)

export { Toaster }
