/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  reviewExpense: vi.fn(),
  profile: {
    userId: 'actor-b',
    organizationId: 'org-a',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['expenses.verify'],
    assignedProjectIds: ['20000000-0000-4000-8000-000000000002'],
  },
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: 'Monitoring and Evaluation Officer',
    profile: state.profile,
  }),
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreDataClient: { reviewExpense: state.reviewExpense },
}))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { ActivityExpenseReviewDialog, type PendingExpense } from './activity-expense-review-dialog'

const expense: PendingExpense = {
  id: 'expense-1',
  activityId: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
  amount: 150,
  category: 'Supplies',
  date: '2026-01-15',
  description: 'Synthetic supplies purchase',
  status: 'For Verification',
  updatedAt: '2026-01-15T00:00:00.000Z',
  receiptEvidenceId: 'evidence-1',
}

describe('ActivityExpenseReviewDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('validates the expense with the review DTO the finance API expects', async () => {
    state.profile.permissions = ['expenses.verify']
    state.reviewExpense.mockResolvedValueOnce({
      id: expense.id,
      projectId: expense.projectId,
      status: 'VERIFIED',
      updatedAt: '2026-01-16T00:00:00.000Z',
      receiptEvidenceId: expense.receiptEvidenceId,
    })
    const onReviewed = vi.fn()
    render(
      <ActivityExpenseReviewDialog expense={expense} onOpenChange={vi.fn()} onReviewed={onReviewed} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Validate expense/ }))
    await waitFor(() => expect(state.reviewExpense).toHaveBeenCalledTimes(1))
    const [projectId, expenseId, body] = state.reviewExpense.mock.calls[0]
    expect(projectId).toBe(expense.projectId)
    expect(expenseId).toBe(expense.id)
    expect(body).toEqual({
      expectedUpdatedAt: expense.updatedAt,
      stage: 'VERIFY',
      decision: 'VERIFY',
    })
    expect(onReviewed).toHaveBeenCalledTimes(1)
  })

  it('rejects with a reason using the REJECT decision shape', async () => {
    state.profile.permissions = ['expenses.verify']
    state.reviewExpense.mockResolvedValueOnce({
      id: expense.id,
      projectId: expense.projectId,
      status: 'REJECTED',
      updatedAt: '2026-01-16T00:00:00.000Z',
      receiptEvidenceId: expense.receiptEvidenceId,
    })
    render(<ActivityExpenseReviewDialog expense={expense} onOpenChange={vi.fn()} onReviewed={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Missing itemized receipt detail.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Return for correction/ }))
    await waitFor(() => expect(state.reviewExpense).toHaveBeenCalledTimes(1))
    const [, , body] = state.reviewExpense.mock.calls[0]
    expect(body).toEqual({
      expectedUpdatedAt: expense.updatedAt,
      stage: 'VERIFY',
      decision: 'REJECT',
      reason: 'Missing itemized receipt detail.',
    })
  })

  it('hides review controls when expenses.verify is absent', () => {
    state.profile.permissions = []
    render(<ActivityExpenseReviewDialog expense={expense} onOpenChange={vi.fn()} onReviewed={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toContain('outside your current permissions')
    expect(
      (screen.getByRole('button', { name: /Validate expense/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('shows the server error and keeps the dialog open', async () => {
    state.profile.permissions = ['expenses.verify']
    state.reviewExpense.mockRejectedValueOnce(new Error('Expense review rejected.'))
    const onOpenChange = vi.fn()
    render(
      <ActivityExpenseReviewDialog expense={expense} onOpenChange={onOpenChange} onReviewed={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Validate expense/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Expense review rejected.'),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
