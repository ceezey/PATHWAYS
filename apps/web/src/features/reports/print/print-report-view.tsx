'use client'

import ReactECharts from 'echarts-for-react'
import { useMemo, useState } from 'react'

import { BrandMark } from '@/components/pathways/brand-mark'
import { printChartData, printChartOption } from './print-report-chart'
import type { PrintReport } from './print-report-payload'

const kindLabels: Record<string, string> = {
  PROJECT_SUMMARY: 'Project summary',
  INDICATOR_SUMMARY: 'Indicator summary',
  BENEFICIARY_SUMMARY: 'Beneficiary summary',
  SURVEY_FORM_RESULTS: 'Survey results',
  MONITORING_REPORT: 'Monitoring report',
  EVALUATION_REPORT: 'Evaluation report',
}

export function PrintReportView({ report }: { report: PrintReport | null }) {
  const chart = useMemo(() => (report ? printChartData(report) : null), [report])
  // The finished event can fire before binding, so chart-ready also marks the chart done.
  const [chartDone, setChartDone] = useState(false)
  if (!report)
    return (
      <main data-report-ready="empty" className="p-8 text-sm text-muted-foreground">
        No report data.
      </main>
    )
  const ready = !chart || chartDone
  return (
    <main
      data-report-ready={ready ? 'true' : 'false'}
      className="mx-auto max-w-[180mm] bg-workspace text-ink print:max-w-none"
    >
      <header className="print-avoid flex items-center gap-3 border-b-4 border-navy pb-4">
        <BrandMark className="h-10 w-10" priority />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy">PATHWAYS</p>
          <h1 className="font-heading text-2xl text-navy">{report.title}</h1>
          <p className="text-sm text-muted-foreground">
            {kindLabels[report.kind] ?? 'Report'} · Generated{' '}
            {new Date(report.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}
          </p>
        </div>
      </header>
      {report.unavailableReasons.length > 0 && (
        <section className="print-avoid mt-4 rounded-md border border-warning bg-warning-subtle p-3 text-sm">
          <h2 className="font-semibold">Unavailable or withheld data</h2>
          <ul className="mt-1 list-disc pl-5">
            {report.unavailableReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}
      {chart && (
        <section className="print-avoid mt-6">
          <h2 className="text-sm font-semibold text-navy">
            {chart.group ? `Summary: ${chart.group}` : 'Summary'}
          </h2>
          <ReactECharts
            option={printChartOption(chart.points)}
            opts={{ renderer: 'svg' }}
            style={{ height: 280 }}
            onChartReady={() => requestAnimationFrame(() => setChartDone(true))}
            onEvents={{ finished: () => setChartDone(true) }}
          />
          {(chart.excluded > 0 || chart.capped > 0) && (
            <p className="text-xs text-muted-foreground">
              {chart.excluded > 0 &&
                `${chart.excluded} of ${chart.total} rows not charted because their value is suppressed or unavailable. `}
              {chart.capped > 0 && 'Showing the first 20 values.'}
            </p>
          )}
        </section>
      )}
      <table className="mt-6 w-full border-collapse text-xs">
        <thead className="print-table-head bg-surface-subtle">
          <tr>
            {report.columns.map((column) => (
              <th
                key={column}
                className="border-b border-border px-2 py-1.5 text-left font-semibold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, rowIndex) => (
            // Rows have no stable id; the snapshot order is fixed for the page lifetime.
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable snapshot rows
            <tr key={rowIndex} className="print-avoid border-b border-border">
              {row.map((cell, cellIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: immutable snapshot cells
                <td key={cellIndex} className="px-2 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
