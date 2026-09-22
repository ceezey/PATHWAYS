import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

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
    <EmptyState
      action={
        status === 'error' && onRetry ? (
          <Button onClick={onRetry} type="button">
            {retryLabel}
          </Button>
        ) : undefined
      }
      className={className}
      description={description}
      icon={icon}
      title={title}
    />
  </div>
)
