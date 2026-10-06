/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/pathways/brand-mark', () => ({ BrandMark: () => null }))
vi.mock('echarts-for-react', () => ({ default: () => null }))

import { sampleProjectReport } from './print-report-sample'
import { PrintReportView } from './print-report-view'

/**
 * The in-app preview passes the API snapshot straight through, which for a Project summary
 * carries sections AND the flattened columns and rows. The ?sample=project fixture has a
 * single row, so it never exercises that combination.
 */
const flattened = {
  ...sampleProjectReport,
  columns: ['Section', 'Item', 'Value', 'Detail'],
  rows: [
    ['Project information', 'Code', 'SAMPLE-01', ''],
    ['Project information', 'Title', 'Sample community nutrition project', ''],
    ['Overview', 'Schedule', 'AT RISK', '1 milestone(s) overdue.'],
    ['Key figures', 'Timeline elapsed', '76', ''],
    ['Key figures', 'Budget used', '58', 'Approved 500000.00; spent 290000.00'],
    ['Key figures', 'KPI achievement', '35', ''],
    ['Indicators', 'IND-01', '70', 'Households trained'],
    ['Indicators', 'IND-02', '175', 'Children screened'],
  ],
}

afterEach(cleanup)

describe('Project summary preview shape', () => {
  it('renders the status sections when the snapshot also carries flattened rows', () => {
    render(<PrintReportView report={flattened} />)
    expect(screen.getByRole('main').getAttribute('data-report-ready')).toBe('true')
    expect(screen.getByText('Project information')).toBeTruthy()
    expect(screen.getByText('Sample community nutrition project')).toBeTruthy()
  })

  it('shows the status sections, never the flat data table, when sections are present', () => {
    render(<PrintReportView report={flattened} />)
    expect(screen.queryByText('Data')).toBeNull()
    expect(screen.getByText('Key figures')).toBeTruthy()
  })
})
