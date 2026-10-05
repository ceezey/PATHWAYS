/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: null }) }))
vi.mock('@/lib/services/core-feature-client', () => ({ downloadCoreArtifact: vi.fn() }))
vi.mock('./expense-review-drawer', () => ({ ExpenseReviewDrawer: () => null }))

import { BudgetLedger } from './budget-ledger'
import { projectLevelKey } from './budget-math'

const expense = (id: string, budgetRecordId: string) => ({
  id,
  budgetRecordId,
  description: `Expense ${id}`,
  amount: '100.00',
  status: 'APPROVED',
  expenseDate: '2026-09-01',
})
const module = {
  budgets: [
    { id: 'b1', activityId: null },
    { id: 'b2', activityId: 'a1' },
  ],
  expenses: [expense('e1', 'b1'), expense('e2', 'b2')],
  activities: [{ id: 'a1', code: 'ACT-1', title: 'Training' }],
} as never

afterEach(cleanup)
describe('BudgetLedger filter', () => {
  it('names the budget row a View expenses link filtered to', () => {
    render(
      <BudgetLedger
        activityKey={projectLevelKey}
        module={module}
        onClearFilter={vi.fn()}
        projectId="p1"
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Showing 1 of 2 expenses for Project-level budget',
    )
  })
  it('shows no filter line for the full ledger', () => {
    render(
      <BudgetLedger activityKey={null} module={module} onClearFilter={vi.fn()} projectId="p1" />,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
