import { chartGrid, chartPalette } from '@/lib/chart-palette'
import type { PrintReport } from './print-report-payload'

type Point = { label: string; value: number }
const MAX_BARS = 20

const numeric = (value: string) => {
  const text = value.trim().replaceAll(',', '')
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

/** One group of numeric Value cells labelled by the preceding column; Total rows are skipped and other cells are counted, never charted. */
export function printChartData(report: PrintReport) {
  const valueIndex = report.columns.indexOf('Value')
  if (valueIndex < 0 || report.columns.length < 2) return null
  const labelIndex = valueIndex > 0 ? valueIndex - 1 : 1
  const grouped = valueIndex >= 2
  const candidates = grouped
    ? report.rows.filter((row) => (row[0] ?? '').trim().toLowerCase() !== 'total')
    : report.rows
  const group = grouped
    ? (candidates.find((row) => numeric(row[valueIndex] ?? '') !== null)?.[0] ?? null)
    : null
  const rows = grouped ? candidates.filter((row) => row[0] === group) : candidates
  const points: Point[] = []
  let excluded = 0
  for (const row of rows) {
    const cell = (row[valueIndex] ?? '').trim()
    const value = numeric(cell)
    if (value !== null) points.push({ label: row[labelIndex] ?? '', value })
    else if (cell) excluded += 1
  }
  if (points.length < 2) return null
  return {
    group,
    points: points.slice(0, MAX_BARS),
    excluded,
    capped: Math.max(0, points.length - MAX_BARS),
    total: rows.length,
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
