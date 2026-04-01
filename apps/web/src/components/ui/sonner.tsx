'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ theme = 'light', ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: 'group toast border bg-background text-foreground shadow-lg',
        description: 'text-muted-foreground',
        actionButton: 'bg-primary text-primary-foreground',
        cancelButton: 'bg-muted text-muted-foreground',
      },
    }}
    {...props}
  />
)

export { Toaster }
