import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const EmptyState = ({
  title,
  description,
  icon: Icon,
  className,
  action,
}: {
  title: string
  description: string
  icon?: LucideIcon
  className?: string
  action?: ReactNode
}) => (
  <div
    className={cn(
      'flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center',
      className,
    )}
  >
    {Icon ? (
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-sm bg-primary-subtle text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
    ) : null}
    <p className="text-base font-semibold text-foreground">{title}</p>
    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
)
