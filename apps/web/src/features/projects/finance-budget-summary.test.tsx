/* @vitest-environment jsdom */
import { budgetUtilization } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceBudgetSummary } from './finance-budget-summary'

const read = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('./use-project-reads', () => ({ useProjectOverviewMetricsRead: () => read }))

describe('FinanceBudgetSummary', () => {
  afterEach(cleanup)
  it('renders server totals, so more than 100 approved expenses still sum correctly', () => {
    // 150 approved expenses of 100.00 each total 15000.00; the 100-row read cannot affect it.
    read.data = {
      budgetUtilization: {
        metric: budgetUtilization('20000.00', '15000.00'),
        approvedBudget: '20000.00',
        countableSpending: '15000.00',
      },
    }
    render(<FinanceBudgetSummary projectId="p" />)
    expect(screen.getByText('₱20,000.00')).toBeTruthy()
    expect(screen.getByText('₱15,000.00')).toBeTruthy()
    expect(screen.getByText('₱5,000.00')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
  })
  it('marks values unavailable without a metrics read', () => {
    read.data = undefined
    render(<FinanceBudgetSummary projectId="p" />)
    expect(screen.getByText('Not recorded')).toBeTruthy()
    expect(screen.getAllByText('Unavailable')).toHaveLength(3)
  })
})
