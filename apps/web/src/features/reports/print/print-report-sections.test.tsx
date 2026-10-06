/* @vitest-environment jsdom */
import { reportSectionsSchema } from '@/lib/services/report-sections'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPrintReport } from './print-report-payload'
import { sampleProjectReport } from './print-report-sample'
import { PrintReportView } from './print-report-view'

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('next/image', () => ({ default: () => <span data-testid="brand-mark" /> }))
afterEach(cleanup)

const sections = sampleProjectReport.sections
if (!sections) throw new Error('Sample fixture needs sections.')
const many = (count: number, item: object) => Array.from({ length: count }, () => item)
const accepts = (patch: object) => reportSectionsSchema.safeParse({ ...sections, ...patch }).success

describe('report sections schema', () => {
  it('accepts the sample and bounds each list', () => {
    expect(readPrintReport(sampleProjectReport)).toEqual(sampleProjectReport)
    const milestone = sections.milestones?.[0] as object
    const indicator = sections.indicators?.[0] as object
    const alert = sections.alerts?.[0] as object
    expect(accepts({ milestones: many(100, milestone) })).toBe(true)
    expect(accepts({ milestones: many(101, milestone) })).toBe(false)
    expect(accepts({ indicators: many(50, indicator) })).toBe(true)
    expect(accepts({ indicators: many(51, indicator) })).toBe(false)
    expect(accepts({ alerts: many(10, alert) })).toBe(true)
    expect(accepts({ alerts: many(11, alert) })).toBe(false)
    expect(accepts({ extra: 1 })).toBe(false)
    expect(accepts({ overview: many(11, sections.overview[0] as object) })).toBe(false)
    const figure = sections.keyFigures?.[0] as object
    expect(accepts({ keyFigures: [{ ...figure, state: 'MADE_UP' }] })).toBe(false)
    expect(accepts({ keyFigures: [{ ...figure, percent: 1e9 }] })).toBe(false)
    expect(accepts({ alerts: [{ ...alert, severity: 'SEVERE' }] })).toBe(false)
    expect(accepts({ information: { ...sections.information, title: 'x'.repeat(2001) } })).toBe(
      false,
    )
  })
})

describe('project status layout', () => {
  it('renders every section with text-labelled status pills', () => {
    render(<PrintReportView report={sampleProjectReport} />)
    for (const name of [
      'Project information',
      'Overview',
      'Key figures',
      'Milestones',
      'Indicators',
      'Open alerts',
    ])
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    expect(screen.getByText('Ana Reyes')).toBeTruthy()
    expect(screen.getAllByText('AT RISK').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OFF TRACK').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ON TRACK').length).toBeGreaterThan(0)
    expect(screen.getByText('Mid-year review')).toBeTruthy()
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Households trained')).toBeTruthy()
    expect(screen.getByText('Indicator behind schedule')).toBeTruthy()
    expect(screen.getByText(/Overdue means/)).toBeTruthy()
  })
  it('shows a suppressed figure as Fewer than 5, never zero', () => {
    render(<PrintReportView report={sampleProjectReport} />)
    const card = screen.getByText('Beneficiaries reached').parentElement as HTMLElement
    expect(within(card).getByText('Fewer than 5')).toBeTruthy()
    expect(within(card).queryByText('0')).toBeNull()
  })
  it('omits a section that is absent', () => {
    const { milestones: _m, alerts: _a, ...rest } = sections
    render(<PrintReportView report={{ ...sampleProjectReport, sections: rest }} />)
    expect(screen.queryByRole('heading', { name: 'Milestones' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Open alerts' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy()
  })
  it('renders Metric state cells of other kinds as labelled pills', () => {
    render(
      <PrintReportView
        report={{
          title: 'Beneficiaries',
          kind: 'BENEFICIARY_SUMMARY',
          columns: ['Dimension', 'Category', 'Value', 'Metric state', 'Reason'],
          rows: [
            ['Sex', 'Female', '12', 'AVAILABLE', ''],
            ['Sex', 'Male', 'Suppressed', 'SUPPRESSED', 'Small group'],
          ],
          generatedAt: '2026-10-05T03:00:00.000Z',
          unavailableReasons: [],
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Data' })).toBeTruthy()
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('Fewer than 5')).toBeTruthy()
  })
})
