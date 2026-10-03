import { cn } from '@/lib/utils'

// Figma 1344:646 loading state: skeleton placeholders for expected content above a titled message.
export const LoadingCard = ({
  title,
  description,
  className,
}: {
  title: string
  description: string
  className?: string
}) => (
  <output
    aria-busy="true"
    aria-live="polite"
    className={cn('block rounded-xl border border-border bg-card p-6', className)}
  >
    <div aria-hidden="true" className="space-y-3">
      <div className="h-4 w-1/3 animate-pulse rounded-full bg-secondary" />
      <div className="h-3 w-full animate-pulse rounded-full bg-surface-subtle" />
      <div className="h-3 w-3/5 animate-pulse rounded-full bg-surface-subtle" />
      <div className="mt-4 h-24 w-full animate-pulse rounded-lg bg-surface-subtle" />
    </div>
    <p className="mt-6 text-center font-heading text-lg font-semibold text-foreground">{title}</p>
    <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
  </output>
)
