import { StatusBadge } from '@/components/pathways'
import type { HumanAlert, HumanRecommendation } from '@/features/analytics/rules-human-contract'
import { cn } from '@/lib/utils'
import { Lightbulb, TriangleAlert } from 'lucide-react'
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

type Props = {
  items: (HumanAlert | HumanRecommendation)[]
  selectedId: string | null
  onSelect: (id: string) => void
  projectLabel?: (projectId: string) => string | undefined
}
export function ReviewCardList({ items, selectedId, onSelect, projectLabel }: Props) {
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const alert = 'lifecycle' in item
        const status = alert ? item.lifecycle : item.status
        const label = alert ? projectLabel?.(item.projectId) : undefined
        const basis = alert ? basisLine(item) : null
        return (
          <li key={item.id}>
            {/* The whole card selects the record; there is no separate review button. */}
            <button
              aria-label={`Review ${item.title}`}
              aria-pressed={item.id === selectedId}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                alert
                  ? 'border-danger/30 bg-danger-subtle hover:border-danger/60'
                  : 'border-warning/30 bg-warning-subtle hover:border-warning/60',
                item.id === selectedId && 'ring-2 ring-ring',
              )}
              data-card-kind={alert ? 'alert' : 'recommendation'}
              type="button"
              onClick={() => onSelect(item.id)}
            >
              {alert ? (
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              ) : (
                <Lightbulb aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              )}
              <span className="block min-w-0 flex-1 space-y-1">
                <span
                  className={cn('block font-semibold', alert ? 'text-danger' : 'text-foreground')}
                >
                  {label ? `${item.title} — ${label}` : item.title}
                </span>
                {alert ? (
                  <span className="line-clamp-2 block text-sm text-muted-foreground">
                    {item.explanation}
                  </span>
                ) : null}
                {basis ? (
                  <span className="block text-sm text-muted-foreground">{basis}</span>
                ) : null}
                {alert ? null : (
                  <span className="line-clamp-2 block text-sm text-muted-foreground">
                    {basisLabel(item.basis)}
                  </span>
                )}
                <span className="flex flex-wrap gap-2 pt-1">
                  {alert ? (
                    <StatusBadge tone={severityTone(item.severity)}>
                      {titleCase(item.severity)}
                    </StatusBadge>
                  ) : null}
                  <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
