import { CappedPercent } from '@/components/pathways'
import type { Overrun } from '@/lib/format/percent'
import type { HumanAlert } from '@pathways/shared'
import { formatMetricValue, metricLabel } from '../rules.utils'

type Evidence = HumanAlert['evidence'][number]

// Only these percent metrics can pass 100, and each overruns something different.
const overruns: Partial<Record<string, Overrun>> = {
  BUDGET_UTILIZATION_PERCENT: 'budget',
  PROJECT_TIMELINE_ELAPSED_PERCENT: 'schedule',
  INDICATOR_PROGRESS_PERCENT: 'target',
  KPI_ACHIEVEMENT_PERCENT: 'target',
}

/** A measured metric value; a percent above 100 shows as 100% with an explained overrun. */
export function ObservedValue({
  value,
  unit,
  metric,
  focusable,
}: {
  value: string
  unit: string
  metric: string
  focusable?: boolean
}) {
  return ['PERCENT', '%'].includes(unit.toUpperCase()) ? (
    <CappedPercent digits={2} focusable={focusable} overrun={overruns[metric]} value={value} />
  ) : (
    formatMetricValue(value, unit)
  )
}

/** A measured evidence value against its threshold, e.g. from basisEvidence. */
export function BasisLine({ seen, focusable }: { seen: Evidence; focusable?: boolean }) {
  if (seen.cell.value === null) return null
  return (
    <>
      Current {metricLabel(seen.metric).toLowerCase()}{' '}
      <ObservedValue
        focusable={focusable}
        metric={seen.metric}
        unit={seen.unit}
        value={seen.cell.value}
      />{' '}
      vs threshold {formatMetricValue(seen.threshold, seen.unit)}
    </>
  )
}
