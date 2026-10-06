/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: null }) }))
vi.mock('@/lib/services/core-feature-client', () => ({
  fetchCoreArtifact: vi.fn(),
  saveCoreArtifact: vi.fn(),
}))
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
  submittedById: '8f14e45f-ceea-467a-9a3e-9b4e1f1e1111',
  verifiedById: '8f14e45f-ceea-467a-9a3e-9b4e1f1e2222',
  approvedById: null,
  signedOffById: null,
  submittedByName: 'Ron Perez',
  verifiedByName: 'Leah Sy',
  approvedByName: null,
  signedOffByName: null,
})
const module = {
  budgets: [
    { id: 'b1', activityId: null, category: 'PROJECT_PROFILE_TOTAL', plannedBudget: '5000.00' },
    { id: 'b2', activityId: 'a1', category: 'ACTIVITY_PROFILE_TOTAL', plannedBudget: '2000.00' },
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
  it('names the reviewers and the budget line instead of printing ids or enum names', () => {
    render(
      <BudgetLedger activityKey={null} module={module} onClearFilter={vi.fn()} projectId="p1" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand Expense e2' }))
    expect(screen.getByText('Ron Perez')).toBeTruthy()
    expect(screen.getByText('Leah Sy')).toBeTruthy()
    expect(screen.getByText('ACT-1 - Training')).toBeTruthy()
    expect(screen.getByText('Activity budget')).toBeTruthy()
    expect(screen.queryByText('8f14e45f-ceea-467a-9a3e-9b4e1f1e1111')).toBeNull()
    expect(screen.queryByText(/ACTIVITY_PROFILE_TOTAL/)).toBeNull()
  })
  it('shows no filter line for the full ledger', () => {
    render(
      <BudgetLedger activityKey={null} module={module} onClearFilter={vi.fn()} projectId="p1" />,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
