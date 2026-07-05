import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const FilterBar = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:flex-row md:items-center',
      className,
    )}
  >
    {children}
  </div>
)
