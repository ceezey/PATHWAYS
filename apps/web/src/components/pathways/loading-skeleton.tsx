import { cn } from '@/lib/utils'

export const LoadingSkeleton = ({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) => (
  <output
    className={cn('block space-y-3', className)}
    aria-label="Loading content"
    aria-live="polite"
  >
    {Array.from({ length: lines }).map((_, index) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count skeleton rows do not reorder.
        key={index}
        className={cn(
          'h-4 animate-pulse rounded-sm bg-secondary',
          index === 0 && 'w-3/4',
          index === 1 && 'w-full',
          index > 1 && 'w-5/6',
        )}
      />
    ))}
  </output>
)
