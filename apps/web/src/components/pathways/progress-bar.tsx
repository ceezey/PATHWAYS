import { type Overrun, roundPercent } from '@/lib/format/percent'
import type { SignalTone } from '@/lib/format/tone'
import { cn } from '@/lib/utils'
import { CappedPercent } from './capped-percent'

export const ProgressBar = ({
  value,
  label,
  tone = 'info',
  hideText = false,
  overrun,
}: {
  value: number
  label?: string
  /** Keeps the label for assistive technology but hides the visible label and percent. */
  hideText?: boolean
  tone?: SignalTone
  /** Names what a value above 100 overran, for the overrun note's explanation. */
  overrun?: Overrun
}) => {
  const safeValue = Math.min(100, Math.max(0, value))
  const accessibleLabel = label ?? 'Progress'

  return (
    <div className="space-y-2">
      {label && !hideText ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground tabular-nums">
            {value > 100 ? (
              <CappedPercent overrun={overrun} value={value} />
            ) : (
              `${roundPercent(safeValue)}%`
            )}
          </span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={accessibleLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeValue}
        tabIndex={0}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-200 ease-out',
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
