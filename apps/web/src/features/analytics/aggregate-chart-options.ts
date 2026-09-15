import { type MetricCell, formatMetricCell } from '@pathways/shared'

export interface AggregateChartBucket {
  key: string
  label: string
  metric: MetricCell
}

/** Numbers are for plotting only. Exact server strings remain in the accessible table. */
export function aggregateChartOption(
  buckets: AggregateChartBucket[],
  label: string,
  displayPrecision?: number,
) {
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `${label}. Unavailable or suppressed cells are not plotted; exact values are listed below.`,
    },
    grid: { left: 16, right: 16, top: 28, bottom: 32, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        value === null || value === undefined ? 'Not available' : String(value),
    },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => bucket.label),
      axisLabel: { interval: 0, rotate: buckets.length > 4 ? 20 : 0 },
    },
    yAxis: {
      type: 'value',
      ...(displayPrecision === undefined
        ? {}
        : {
            axisLabel: {
              formatter: (value: number) =>
                Number.isFinite(value) ? value.toFixed(displayPrecision) : '',
            },
          }),
    },
    series: [
      {
        name: label,
        type: 'bar',
        data: buckets.map((bucket) =>
          bucket.metric.value === null ? null : Number(bucket.metric.value),
        ),
        itemStyle: { color: '#0f766e' },
      },
    ],
  }
}

export function aggregateAccessibleText(buckets: AggregateChartBucket[]) {
  return buckets.map((bucket) => `${bucket.label}: ${formatMetricCell(bucket.metric)}`).join('; ')
}
