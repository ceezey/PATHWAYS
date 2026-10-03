import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export const EmptyState = ({
  title,
  description,
  icon: Icon,
  className,
  action,
  tone = 'neutral',
}: {
  title: string
  description?: string
  icon?: LucideIcon
  className?: string
  action?: ReactNode
  tone?: 'neutral' | 'danger'
}) => (
  <div
    className={cn(
      'flex min-h-[180px] flex-col items-center justify-center rounded-lg border bg-card px-6 py-8 text-center',
      tone === 'danger' ? 'border-danger/40' : 'border-border',
      className,
    )}
  >
    {Icon ? (
      <div
        className={cn(
          'mb-4 flex h-11 w-11 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
    ) : null}
    <p className="text-base font-semibold text-foreground">{title}</p>
    {description ? (
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
)
