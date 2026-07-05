import { cn } from '@/lib/utils'

export const ProgressBar = ({
  value,
  label,
  tone = 'info',
}: {
  value: number
  label?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}) => {
  const safeValue = Math.min(100, Math.max(0, value))

  return (
    <div className="space-y-2">
      {label ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">{safeValue}%</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        tabIndex={0}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            tone === 'info' && 'bg-info',
            tone === 'success' && 'bg-success',
            tone === 'warning' && 'bg-warning',
            tone === 'danger' && 'bg-danger',
          )}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  )
}
