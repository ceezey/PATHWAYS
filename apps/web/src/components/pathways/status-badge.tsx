import { cn } from '@/lib/utils'

export const StatusBadge = ({
  children,
  tone = 'info',
  dot = true,
}: {
  children: React.ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  dot?: boolean
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
      tone === 'info' && 'border-info/30 bg-info-subtle text-info',
      tone === 'success' && 'border-success/30 bg-success-subtle text-success',
      tone === 'warning' && 'border-warning/30 bg-warning-subtle text-warning',
      tone === 'danger' && 'border-danger/30 bg-danger-subtle text-danger',
      tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
    )}
  >
    {dot ? (
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
    ) : null}
    {children}
  </span>
)
