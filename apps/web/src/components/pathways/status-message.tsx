import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const StatusMessage = ({
  children,
  label,
  className,
}: {
  children: ReactNode
  label?: string
  className?: string
}) => (
  <output
    aria-atomic="true"
    aria-label={label}
    aria-live="polite"
    className={cn('sr-only', className)}
  >
    {children}
  </output>
)
