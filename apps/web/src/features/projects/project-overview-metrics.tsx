'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatNumber, overviewMetricLabel } from './project-utils'
import { useProjectOverviewMetricsRead } from './use-project-reads'

const unavailable = 'Unavailable'

type Cell = Parameters<typeof overviewMetricLabel>[0]
// Budget and reach tiles show zero when no figure is available; suppressed counts keep their label.
const orZero = (cell: Cell, kind: 'percent' | 'count') =>
  cell.state === 'AVAILABLE' || cell.state === 'ZERO' || cell.state === 'SUPPRESSED'
    ? overviewMetricLabel(cell, kind)
    : kind === 'percent'
      ? '0%'
      : '0'

/** KPI, budget, reach and timeline tiles from `GET /projects/:id/overview-metrics`. */
export const ProjectOverviewMetrics = ({
  projectId,
  targetBeneficiaries,
  compact = false,
}: {
  projectId: string
  targetBeneficiaries?: number
  compact?: boolean
}) => {
  const read = useProjectOverviewMetricsRead(projectId)
  const metrics = read.data
  const failed = read.isError || !read.eligible
  const value = (compute: (data: NonNullable<typeof metrics>) => string) =>
    metrics ? compute(metrics) : failed ? unavailable : 'Loading...'
  const target = formatNumber(targetBeneficiaries ?? 0)
  const tiles = [
    {
      label: 'KPI achievement',
      value: value((data) =>
        data.kpiAchievement
          ? overviewMetricLabel(data.kpiAchievement.metric, 'percent')
          : unavailable,
      ),
    },
    {
      label: 'Budget utilization',
      value: value((data) =>
        data.budgetUtilization ? orZero(data.budgetUtilization.metric, 'percent') : unavailable,
      ),
    },
    {
      label: compact ? 'Beneficiaries' : 'Beneficiaries reached / target',
      value: `${value((data) => (data.beneficiariesReached ? orZero(data.beneficiariesReached.metric, 'count') : unavailable))} / ${target}`,
    },
    {
      label: 'Timeline',
      value: value((data) => overviewMetricLabel(data.timeline.metric, 'percent')),
    },
  ]
  return (
    <div className="space-y-2">
      <dl
        aria-busy={!metrics && !failed}
        className="grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2"
      >
        {tiles.map((tile) => (
          <div className={compact ? 'bg-background p-3' : 'bg-surface-subtle p-4'} key={tile.label}>
            <dt className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
              {tile.label}
            </dt>
            <dd
              className={cn(
                'font-semibold tabular-nums text-foreground',
                compact ? 'mt-1 text-lg' : 'mt-2 text-2xl',
              )}
            >
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
      {read.isError ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          role="alert"
        >
          Project metrics could not be loaded.
          <Button onClick={() => void read.refetch()} size="sm" type="button" variant="outline">
            Retry metrics
          </Button>
        </div>
      ) : null}
    </div>
  )
}
