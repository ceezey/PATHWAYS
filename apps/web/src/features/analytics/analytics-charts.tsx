'use client'

import { type MonitoringIndicator, formatMetricCell, numericMetric } from '@pathways/shared'
import ReactECharts from 'echarts-for-react'
import { type AggregateChartBucket, aggregateChartOption } from './aggregate-chart-options'

export function AggregateChart({
  buckets,
  label,
  displayPrecision,
}: { buckets: AggregateChartBucket[]; label: string; displayPrecision?: number }) {
  const hasValues = buckets.some((bucket) => bucket.metric.value !== null)
  return (
    <div>
      {hasValues ? (
        <ReactECharts
          className="h-[280px] w-full"
          option={aggregateChartOption(buckets, label, displayPrecision)}
        />
      ) : (
        <p className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          No releasable values for this view.
        </p>
      )}
      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">{label} — exact server values</caption>
        <thead>
          <tr>
            <th scope="col" className="py-2">
              Category
            </th>
            <th scope="col" className="py-2 text-right">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.key} className="border-t border-border">
              <th scope="row" className="py-2 font-normal">
                {bucket.label}
              </th>
              <td className="py-2 text-right" title={bucket.metric.reason ?? undefined}>
                {formatMetricCell(bucket.metric)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Labels and already-suppressed counts are supplied by the API, never recomputed here. */
export function SadddChart({ buckets, label }: { buckets: AggregateChartBucket[]; label: string }) {
  return <AggregateChart buckets={buckets} label={label} />
}

export function IndicatorComparisonChart({ indicator }: { indicator: MonitoringIndicator }) {
  const buckets: AggregateChartBucket[] = [
    {
      key: 'baseline',
      label: 'Baseline',
      metric:
        indicator.baseline === null
          ? { state: 'MISSING', value: null, reason: 'NOT_CONFIGURED' }
          : numericMetric(indicator.baseline),
    },
    {
      key: 'target',
      label: 'Target',
      metric:
        indicator.target === null
          ? { state: 'MISSING', value: null, reason: 'NOT_CONFIGURED' }
          : numericMetric(indicator.target),
    },
    { key: 'current', label: 'Current', metric: indicator.current },
  ]
  return (
    <AggregateChart
      buckets={buckets}
      displayPrecision={indicator.displayPrecision ?? undefined}
      label={`${indicator.name} (${indicator.unitLabel ?? 'unit not set'})`}
    />
  )
}
