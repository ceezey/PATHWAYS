/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { printChartData, printChartOption } from './print-report-chart'
import { type PrintReport, readPrintReport, sampleReport } from './print-report-payload'
import { PrintReportView } from './print-report-view'

vi.mock('echarts-for-react', () => ({
  default: ({ onEvents }: { onEvents?: { finished?: () => void } }) => {
    setTimeout(() => onEvents?.finished?.(), 0)
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
  it('caps the chart at twenty bars', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ['Sex', `C${index}`, `${index}`, '', ''])
    expect(printChartData({ ...report, rows })?.points).toHaveLength(20)
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
  it('shows an empty state without a payload', () => {
    const { container } = render(<PrintReportView report={null} />)
    expect(screen.getByText('No report data.')).toBeTruthy()
    expect(container.querySelector('[data-report-ready="true"]')).toBeTruthy()
  })
})
