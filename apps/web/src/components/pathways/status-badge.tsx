import { cn } from '@/lib/utils'

export const StatusBadge = ({
  children,
  tone = 'info',
}: {
  children: React.ReactNode
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
}) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
      tone === 'info' && 'border-info/30 bg-info-subtle text-info',
      tone === 'success' && 'border-success/30 bg-success-subtle text-success',
      tone === 'warning' && 'border-warning/30 bg-warning-subtle text-warning',
      tone === 'danger' && 'border-danger/30 bg-danger-subtle text-danger',
      tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
    )}
  >
    {children}
  </span>
)
