/* @vitest-environment jsdom */
import { budgetUtilization } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FinanceBudgetSummary } from './finance-budget-summary'

const read = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock('./use-project-reads', () => ({ useProjectOverviewMetricsRead: () => read }))

const budgets = [
  { activityId: null, category: 'PROJECT_PROFILE_TOTAL', plannedBudget: '1000.00' },
  { activityId: 'a', category: 'ACTIVITY_PROFILE_TOTAL', plannedBudget: '300.00' },
]
const expenses = [
  { amount: '250.00', status: 'APPROVED' },
  { amount: '100.00', status: 'PENDING' },
  { amount: '50.50', status: 'VERIFIED' },
]

describe('FinanceBudgetSummary', () => {
  afterEach(cleanup)
  it('shows project budget, approved-only spending, service utilization and remaining', () => {
    read.data = { budgetUtilization: { metric: budgetUtilization('1000.00', '250.00') } }
    render(<FinanceBudgetSummary budgets={budgets} expenses={expenses} projectId="p" />)
    expect(screen.getByText('₱1,000.00')).toBeTruthy()
    expect(screen.getByText('₱250.00')).toBeTruthy()
    expect(screen.getByText('₱750.00')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
  })
  it('marks budget and utilization unavailable without a project budget or metric', () => {
    read.data = undefined
    render(<FinanceBudgetSummary budgets={[]} expenses={[]} projectId="p" />)
    expect(screen.getByText('Not recorded')).toBeTruthy()
    expect(screen.getAllByText('Unavailable')).toHaveLength(2)
  })
})
