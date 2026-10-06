import { StatusBadge } from '@/components/pathways'
import type { HumanAlert, HumanRecommendation } from '@/features/analytics/rules-human-contract'
import { cn } from '@/lib/utils'
import { Lightbulb, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatMetricValue, metricLabel, severityTone, titleCase } from './rule-board-model'

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  REVIEWED: 'Reviewed',
  ACTIONED: 'Actioned',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  AUTO_RESOLVED: 'Auto-resolved',
}
/** Unknown statuses fall back to title case instead of failing. */
export const statusLabel = (status: string) => STATUS_LABELS[status] ?? titleCase(status)
const statusTone = (status: string) =>
  status === 'NEW'
    ? ('info' as const)
    : status === 'ACTIONED'
      ? ('success' as const)
      : ('neutral' as const)
const BASIS_LABELS: Record<string, string> = {
  KPI: 'Based on indicator (KPI) results',
  COMBINED: 'Based on project monitoring signals',
}
/** Plain-language basis; unknown or free-text values pass through with a Based on prefix. */
export const basisLabel = (basis: string) =>
  BASIS_LABELS[basis] ?? (basis.startsWith('Based on') ? basis : `Based on ${basis}`)
/** The first measured evidence value against its threshold, or null when none was measured. */
export const basisLine = (alert: HumanAlert) => {
  const seen = alert.evidence.find((item) => item.cell.value !== null)
  return seen?.cell.value
    ? `Current ${metricLabel(seen.metric).toLowerCase()} ${formatMetricValue(seen.cell.value, seen.unit)} vs threshold ${formatMetricValue(seen.threshold, seen.unit)}`
    : null
}

// Tailwind needs whole class names, so each tone keeps its own surface, border, icon and title styles.
const TONE_STYLES = {
  danger: {
    border: 'border-danger/30',
    surface: 'bg-danger-subtle hover:bg-danger-subtle/70',
    icon: 'text-danger',
    title: 'text-danger',
  },
  warning: {
    border: 'border-warning/30',
    surface: 'bg-warning-subtle hover:bg-warning-subtle/70',
    icon: 'text-warning',
    title: 'text-foreground',
  },
  neutral: {
    border: 'border-border',
    surface: 'bg-muted hover:bg-muted/70',
    icon: 'text-muted-foreground',
    title: 'text-foreground',
  },
} as const

type Props = {
  items: (HumanAlert | HumanRecommendation)[]
  selectedId: string | null
  onSelect: (id: string) => void
  projectLabel?: (projectId: string) => string | undefined
  /** Rendered inside the selected card, below its summary. */
  details?: ReactNode
}
export function ReviewCardList({ items, selectedId, onSelect, projectLabel, details }: Props) {
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const alert = 'lifecycle' in item
        const status = alert ? item.lifecycle : item.status
        const label = alert ? projectLabel?.(item.projectId) : undefined
        const basis = alert ? basisLine(item) : null
        const open = item.id === selectedId
        const tone = TONE_STYLES[alert ? severityTone(item.severity) : 'warning']
        return (
          <li key={item.id}>
            <div
              className={cn(
                'overflow-hidden rounded-md border',
                tone.border,
                open && 'ring-2 ring-ring',
              )}
            >
              {/* The whole card opens the record; there is no separate review button. */}
              <button
                aria-label={`Review ${item.title}`}
                aria-expanded={open}
                className={cn(
                  'flex w-full flex-col gap-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  tone.surface,
                )}
                data-card-kind={alert ? 'alert' : 'recommendation'}
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <span className="flex flex-wrap items-center gap-2">
                  {alert ? (
                    <TriangleAlert
                      aria-hidden="true"
                      className={cn('h-4 w-4 shrink-0', tone.icon)}
                    />
                  ) : (
                    <Lightbulb aria-hidden="true" className={cn('h-4 w-4 shrink-0', tone.icon)} />
                  )}
                  {alert ? (
                    <StatusBadge tone={severityTone(item.severity)}>
                      {titleCase(item.severity)}
                    </StatusBadge>
                  ) : null}
                  <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
                </span>
                <span className={cn('block font-semibold leading-snug', tone.title)}>
                  {item.title}
                </span>
                {label ? (
                  <span className="block text-sm text-muted-foreground">{label}</span>
                ) : null}
                {basis ? <span className="block text-sm">{basis}</span> : null}
                {alert ? null : (
                  <span className="line-clamp-2 block text-sm text-muted-foreground">
                    {basisLabel(item.basis)}
                  </span>
                )}
              </button>
              {open ? details : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
