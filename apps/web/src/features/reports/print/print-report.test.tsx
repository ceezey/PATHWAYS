/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { printChartData, printChartOption } from './print-report-chart'
import { type PrintReport, readPrintReport, sampleReport } from './print-report-payload'
import { PrintReportView } from './print-report-view'

vi.mock('echarts-for-react', () => ({
  default: ({ onChartReady }: { onChartReady?: () => void }) => {
    setTimeout(() => onChartReady?.(), 0)
    return <div data-testid="chart" />
  },
}))
vi.mock('next/image', () => ({ default: () => <span data-testid="brand-mark" /> }))

const report: PrintReport = {
  title: 'Quarterly beneficiary report',
  kind: 'BENEFICIARY_SUMMARY',
  columns: ['Dimension', 'Category', 'Value', 'Metric state', 'Reason'],
  rows: [
    ['Sex', 'Female', '42', 'AVAILABLE', ''],
    ['Sex', 'Male', '1,204', 'AVAILABLE', ''],
    ['Sex', 'Intersex', 'Suppressed', 'SUPPRESSED', 'Small group'],
  ],
  generatedAt: '2026-10-05T03:00:00.000Z',
  unavailableReasons: ['Participation counts are withheld for aggregate-only roles.'],
}

afterEach(cleanup)

describe('print report payload', () => {
  it('accepts the renderer snapshot and rejects unknown keys or bad shapes', () => {
    expect(readPrintReport(report)).toEqual(report)
    expect(readPrintReport({ ...report, token: 'x' })).toBeNull()
    expect(readPrintReport({ ...report, rows: 'nope' })).toBeNull()
    expect(readPrintReport(undefined)).toBeNull()
    expect(readPrintReport(sampleReport)).toEqual(sampleReport)
  })
})

describe('print report chart', () => {
  it('charts only numeric Value cells labelled by the preceding column', () => {
    expect(printChartData(report)).toEqual({
      group: 'Sex',
      capped: 0,
      points: [
        { label: 'Female', value: 42 },
        { label: 'Male', value: 1204 },
      ],
      excluded: 1,
      total: 3,
    })
  })
  it('skips the chart without a Value column or with fewer than two numbers', () => {
    expect(printChartData({ ...report, columns: ['Code', 'Title'], rows: [['A', 'B']] })).toBeNull()
    expect(printChartData({ ...report, rows: [report.rows[0] as string[]] })).toBeNull()
  })
  it('caps the chart at twenty bars and counts the dropped ones', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ['Sex', `C${index}`, `${index}`, '', ''])
    const chart = printChartData({ ...report, rows })
    expect(chart?.points).toHaveLength(20)
    expect(chart?.capped).toBe(5)
  })
  it('charts only the first group and skips Total rows', () => {
    const rows = [
      ['Total', 'Individuals', '99', 'AVAILABLE', ''],
      ['sex', 'Female', '42', 'AVAILABLE', ''],
      ['sex', 'Male', '30', 'AVAILABLE', ''],
      ['age', '0-17', '10', 'AVAILABLE', ''],
      ['age', '18+', '60', 'AVAILABLE', ''],
    ]
    expect(printChartData({ ...report, rows })).toEqual({
      group: 'sex',
      points: [
        { label: 'Female', value: 42 },
        { label: 'Male', value: 30 },
      ],
      excluded: 0,
      capped: 0,
      total: 2,
    })
  })
  it('does not count an empty Value cell as excluded', () => {
    const rows = [
      ['Section', 'A', '1', '', ''],
      ['Section', 'B', '2', '', ''],
      ['Section', 'C', '', '', ''],
    ]
    expect(printChartData({ ...report, rows })).toMatchObject({ excluded: 0, total: 3 })
  })
  it('does not group when the Value column is among the first two', () => {
    const chart = printChartData({
      ...report,
      columns: ['Code', 'Value'],
      rows: [
        ['A', '1'],
        ['B', '2'],
      ],
    })
    expect(chart).toMatchObject({ group: null, total: 2 })
  })
  it('disables animation so the headless capture is never blank', () => {
    expect(printChartOption([{ label: 'A', value: 1 }])).toMatchObject({ animation: false })
  })
})

describe('PrintReportView', () => {
  it('renders the header, reasons, chart and table, then flags ready', async () => {
    const { container } = render(<PrintReportView report={report} />)
    expect(screen.getByRole('heading', { name: 'Quarterly beneficiary report' })).toBeTruthy()
    expect(screen.getByText(/Beneficiary summary/)).toBeTruthy()
    expect(screen.getByText(/Participation counts are withheld/)).toBeTruthy()
    expect(screen.getByText('1,204')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Summary: Sex' })).toBeTruthy()
    expect(screen.getByText(/1 of 3 rows not charted/)).toBeTruthy()
    expect(screen.getByTestId('chart')).toBeTruthy()
    await waitFor(() => expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy())
  })
  it('flags ready immediately when there is nothing to chart', async () => {
    const { container } = render(
      <PrintReportView report={{ ...report, columns: ['Code'], rows: [['SYN']] }} />,
    )
    expect(screen.queryByTestId('chart')).toBeNull()
    await waitFor(() => expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy())
  })
  it('shows an empty state that never counts as ready', () => {
    const { container } = render(<PrintReportView report={null} />)
    expect(screen.getByText('No report data.')).toBeTruthy()
    expect(container.querySelector('[data-report-ready="empty"]')).toBeTruthy()
    expect(container.querySelector('[data-report-ready="true"]')).toBeNull()
  })
})
