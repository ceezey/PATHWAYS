import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { EmptyState } from './empty-state'
import { StatusMessage } from './status-message'

type AsyncStateProps = {
  status: 'loading' | 'error' | 'empty'
  title: string
  description: string
  icon?: LucideIcon
  className?: string
  onRetry?: () => void
  retryLabel?: string
}

export const AsyncState = ({
  status,
  title,
  description,
  icon,
  className,
  onRetry,
  retryLabel = 'Retry',
}: AsyncStateProps) => (
  <div data-async-state={status}>
    <StatusMessage>{`${title}. ${description}`}</StatusMessage>
    {status === 'loading' ? (
      // Figma 1344:646 loading card: skeletons for expected content, then the title and a short note.
      <div
        aria-busy="true"
        className={cn('rounded-md border border-border bg-card p-5', className)}
      >
        <div aria-hidden="true" className="space-y-3">
          <div className="h-4 w-2/5 animate-pulse rounded-md bg-secondary" />
          <div className="h-3 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded-md bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-md bg-muted" />
        </div>
        <p className="mt-4 text-center font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">{description}</p>
      </div>
    ) : (
      <EmptyState
        action={
          status === 'error' && onRetry ? (
            <Button onClick={onRetry} type="button" variant="outline">
              {retryLabel}
            </Button>
          ) : undefined
        }
        className={className}
        tone={status === 'error' ? 'danger' : 'neutral'}
        description={description}
        icon={icon}
        title={title}
      />
    )}
  </div>
)
