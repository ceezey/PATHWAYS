'use client'

import ReactECharts from 'echarts-for-react'

import { chartPalette } from '@/lib/chart-palette'
import type { ParticipationBreakdown } from '@pathways/shared'

const SUPPRESSED_LABEL = 'Suppressed'

interface Row {
  key: string
  label: string
  count: number | null
  suppressed: boolean
}

const statusLabel = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
const countText = (row: Row) =>
  row.suppressed || row.count === null ? SUPPRESSED_LABEL : row.count.toLocaleString()

/** Suppressed cells are not plotted; their category is marked and listed in the table. */
export function participationBarOption(title: string, rows: Row[]) {
  const names = rows.map((row) =>
    row.suppressed ? `${row.label} (${SUPPRESSED_LABEL})` : row.label,
  )
  return {
    animation: false,
    aria: {
      enabled: true,
      description: `${title}. ${rows.map((row) => `${row.label}: ${countText(row)}`).join('; ')}.`,
    },
    color: [chartPalette[0]],
    grid: { left: 16, right: 16, top: 28, bottom: 18, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: { interval: 0, rotate: rows.length > 4 ? 20 : 0 },
    },
    yAxis: { type: 'value', min: 0 },
    series: [
      {
        name: title,
        type: 'bar',
        data: rows.map((row) => (row.suppressed ? null : row.count)),
      },
    ],
  }
}

const Breakdown = ({ title, rows }: { title: string; rows: Row[] }) => (
  <section className="space-y-3" aria-label={title}>
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">None yet</p>
    ) : (
      <>
        <ReactECharts className="h-[240px] w-full" option={participationBarOption(title, rows)} />
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b" key={row.key}>
                <td className="p-2">{row.label}</td>
                <td className="p-2 tabular-nums">{countText(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )}
  </section>
)

export const ParticipationBreakdownPanel = ({ data }: { data: ParticipationBreakdown }) => (
  <div className="space-y-6">
    <p className="text-sm font-medium text-foreground">
      Total participation:{' '}
      <span className="tabular-nums">
        {data.totalSuppressed || data.total === null
          ? SUPPRESSED_LABEL
          : data.total.toLocaleString()}
      </span>
    </p>
    <div className="grid gap-6 xl:grid-cols-3">
      <Breakdown
        title="By activity"
        rows={data.byActivity.map((row) => ({
          ...row,
          key: row.activityId,
          label: row.activityName,
        }))}
      />
      <Breakdown
        title="By month"
        rows={data.byMonth.map((row) => ({ ...row, key: row.month, label: row.month }))}
      />
      <Breakdown
        title="By attendance status"
        rows={data.byAttendanceStatus.map((row) => ({
          ...row,
          key: row.status,
          label: statusLabel(row.status),
        }))}
      />
    </div>
  </div>
)
