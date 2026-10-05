import { chartGrid, chartPalette } from '@/lib/chart-palette'
import type { PrintReport } from './print-report-payload'

type Point = { label: string; value: number }
const MAX_BARS = 20

const numeric = (value: string) => {
  const text = value.trim().replaceAll(',', '')
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** Numeric Value cells labelled by the preceding column; suppressed or missing cells are counted, never charted. */
export function printChartData(report: PrintReport) {
  const valueIndex = report.columns.indexOf('Value')
  if (valueIndex < 0 || report.columns.length < 2) return null
  const labelIndex = valueIndex > 0 ? valueIndex - 1 : 1
  const points: Point[] = []
  for (const row of report.rows) {
    const value = numeric(row[valueIndex] ?? '')
    if (value !== null) points.push({ label: row[labelIndex] ?? '', value })
  }
  if (points.length < 2) return null
  return {
    points: points.slice(0, MAX_BARS),
    excluded: report.rows.length - points.length,
    total: report.rows.length,
  }
}

export function printChartOption(points: Point[]) {
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `Report values. ${points.map((point) => `${point.label} ${point.value}`).join(', ')}.`,
    },
    grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.label),
      axisLabel: { interval: 0, rotate: points.length > 6 ? 30 : 0, fontSize: 10 },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: chartGrid } } },
    series: [
      {
        type: 'bar',
        color: chartPalette[0],
        barMaxWidth: 36,
        label: { show: true, position: 'top', fontSize: 10 },
        data: points.map((point) => point.value),
      },
    ],
  }
}
