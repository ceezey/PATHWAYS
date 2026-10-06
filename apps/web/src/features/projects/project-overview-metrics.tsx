'use client'

import { CappedPercent, ProgressBar } from '@/components/pathways'
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
  // A budget the role cannot read is left out instead of showing "Unavailable".
  const budget = metrics?.budgetUtilization
  const tiles = [
    {
      label: 'KPI achievement',
      value: value((data) =>
        data.kpiAchievement
          ? overviewMetricLabel(data.kpiAchievement.metric, 'percent')
          : unavailable,
      ),
    },
    ...(budget ? [{ label: 'Budget utilization', value: orZero(budget.metric, 'percent') }] : []),
    {
      label: compact ? 'Beneficiaries' : 'Beneficiaries reached / target',
      value: `${value((data) => (data.beneficiariesReached ? orZero(data.beneficiariesReached.metric, 'count') : unavailable))} / ${target}`,
    },
  ]
  const timeline = metrics?.timeline.metric
  const cell = compact ? 'bg-background p-3' : 'bg-surface-subtle p-4'
  const term = cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')
  const figure = cn('font-semibold tabular-nums text-foreground', compact ? 'text-lg' : 'text-2xl')
  return (
    <div className="space-y-2">
      <dl
        aria-busy={!metrics && !failed}
        className={cn(
          'grid gap-px overflow-hidden rounded-sm border border-border bg-border',
          tiles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {tiles.map((tile) => (
          <div className={cell} key={tile.label}>
            <dt className={term}>{tile.label}</dt>
            <dd className={cn(figure, compact ? 'mt-1' : 'mt-2')}>{tile.value}</dd>
          </div>
        ))}
        <div className={cn(cell, 'sm:col-span-full')}>
          <dt className={term}>Timeline</dt>
          <dd className={cn('flex items-center gap-4', compact ? 'mt-1' : 'mt-2')}>
            {timeline?.value != null ? (
              <>
                <span className="min-w-0 flex-1">
                  <ProgressBar hideText label="Timeline" value={Number(timeline.value)} />
                </span>
                <span className={figure}>
                  <CappedPercent value={timeline.value} overLabel="past schedule" />
                </span>
              </>
            ) : (
              <span className={figure}>
                {value((data) => overviewMetricLabel(data.timeline.metric, 'percent'))}
              </span>
            )}
          </dd>
        </div>
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
