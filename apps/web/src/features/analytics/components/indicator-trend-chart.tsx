'use client'

import ReactECharts from 'echarts-for-react'
import { BarChart3 } from 'lucide-react'

import { EmptyState } from '@/components/pathways/empty-state'
import { chartPalette } from '@/lib/chart-palette'
import type { IndicatorTrends } from '@pathways/shared'

/** One indicator, so one unit, per chart: the chosen indicator or the first, with a dashed target line when set. */
export function indicatorTrendOption(all: IndicatorTrends, indicatorId?: string) {
  const chosen = all.indicators.find((row) => row.indicatorId === indicatorId) ?? all.indicators[0]
  const data = { ...all, indicators: chosen ? [chosen] : [] }
  const ends = [
    ...new Set(data.indicators.flatMap((row) => row.points.map((point) => point.periodEnd))),
  ].sort()
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `Indicator trends. ${data.indicators
        .map(
          (row) =>
            `${row.name}: ${row.points.map((point) => `${point.periodEnd} ${point.value}`).join(', ')}`,
        )
        .join('; ')}.`,
    },
    legend: { top: 0, type: 'scroll' },
    tooltip: { trigger: 'axis' },
    grid: { left: 16, right: 16, top: 40, bottom: 18, containLabel: true },
    xAxis: { type: 'category', data: ends },
    yAxis: { type: 'value' },
    series: data.indicators.map((row, index) => {
      const color = chartPalette[index % chartPalette.length]
      const byEnd = new Map(row.points.map((point) => [point.periodEnd, point.value]))
      return {
        name: row.unit ? `${row.name} (${row.unit})` : row.name,
        type: 'line',
        color,
        connectNulls: true,
        data: ends.map((end) => byEnd.get(end) ?? null),
        ...(row.target === null
          ? {}
          : {
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { type: 'dashed', color },
                label: { formatter: `Target ${row.target}` },
                data: [{ yAxis: row.target }],
              },
            }),
      }
    }),
  }
}

export const IndicatorTrendChart = ({
  data,
  indicatorId,
}: { data: IndicatorTrends; indicatorId?: string }) =>
  data.indicators.some((row) => row.points.length > 0) ? (
    <ReactECharts className="h-[320px] w-full" option={indicatorTrendOption(data, indicatorId)} />
  ) : (
    <EmptyState
      description="No released indicator values are available for this selection."
      icon={BarChart3}
      title="None yet"
    />
  )
