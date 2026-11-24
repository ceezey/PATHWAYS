/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildActivityRows } from '../budget.utils'
import { BudgetOverview } from './budget-overview'

const moduleFor = (activityBudget: string) => {
  const activityRows = buildActivityRows(
    [
      {
        id: 'b1',
        activityId: null,
        category: 'PROJECT_PROFILE_TOTAL',
        plannedBudget: '1000000.00',
      },
      {
        id: 'b2',
        activityId: 'a1',
        category: 'ACTIVITY_PROFILE_TOTAL',
        plannedBudget: activityBudget,
      },
    ],
    [],
    [{ id: 'a1', code: 'ACT-1', title: 'Training' }],
  )
  return {
    totals: {
      allocated: 1000000,
      used: 0,
      pending: 0,
      remaining: 1000000,
      utilization: 0,
      kpiPct: null,
      budgetMetricPct: null,
      efficiency: null,
    },
    activityRows,
    alerts: [],
    recommendations: [],
  } as never
}

afterEach(cleanup)
describe('BudgetOverview activity breakdown', () => {
  it('reads a negative project-level remainder as an over-allocation warning', () => {
    render(<BudgetOverview module={moduleFor('1420000.00')} onOpenLedger={vi.fn()} />)
    const notice = screen.getByText('Over-allocated by ₱420,000.00')
    expect(notice.className).toContain('text-danger')
    expect(screen.queryByText(/-₱/)).toBeNull()
    expect(screen.getByText('₱1,420,000.00')).toBeTruthy()
  })

  it('shows a plain amount while the project is within its planned total', () => {
    render(<BudgetOverview module={moduleFor('400000.00')} onOpenLedger={vi.fn()} />)
    expect(screen.getByText('₱600,000.00')).toBeTruthy()
    expect(screen.queryByText(/Over-allocated/)).toBeNull()
  })
})
