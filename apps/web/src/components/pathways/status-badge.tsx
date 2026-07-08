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
      tone === 'info' && 'border-info/20 bg-info/10 text-info',
      tone === 'success' && 'border-success/20 bg-success/10 text-success',
      tone === 'warning' && 'border-warning/30 bg-warning/20 text-warning',
      tone === 'danger' && 'border-danger/20 bg-danger/10 text-danger',
      tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
    )}
  >
    {children}
  </span>
)
