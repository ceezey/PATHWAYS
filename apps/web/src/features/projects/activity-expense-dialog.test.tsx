/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const state = vi.hoisted(() => ({
  submitExpense: vi.fn(),
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['expenses.submit'],
    assignedProjectIds: ['20000000-0000-4000-8000-000000000002'],
  },
}))

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Project Officer', profile: state.profile }),
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreDataClient: { submitExpense: state.submitExpense },
}))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { ActivityExpenseDialog } from './activity-expense-dialog'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
  title: 'Community orientation',
} as Activity

const references = [
  { id: 'budget-1', category: 'Supplies', activityId: activity.id },
  { id: 'budget-2', category: 'Other activity budget', activityId: 'other-activity' },
]

const renderDialog = (permissions = state.profile.permissions) => {
  state.profile.permissions = permissions
  return render(
    <ActivityExpenseDialog
      activity={activity}
      budgetReferences={references}
      onOpenChange={vi.fn()}
      onSubmitted={vi.fn()}
      open
    />,
  )
}

const fill = () => {
  fireEvent.change(screen.getByLabelText('Budget allocation'), {
    target: { value: 'budget-1' },
  })
  fireEvent.change(screen.getByLabelText('Amount (PHP)'), { target: { value: '150.00' } })
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-01-15' } })
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Synthetic supplies purchase' },
  })
}

describe('ActivityExpenseDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('submits the expense with the DTO payload the finance API expects', async () => {
    state.submitExpense.mockResolvedValueOnce({
      id: 'expense-1',
      projectId: activity.projectId,
      status: 'PENDING',
      updatedAt: '2026-01-15T00:00:00.000Z',
      receiptEvidenceId: null,
    })
    renderDialog(['expenses.submit'])
    fill()
    fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
    await waitFor(() => expect(state.submitExpense).toHaveBeenCalledTimes(1))
    const [projectId, body] = state.submitExpense.mock.calls[0]
    expect(projectId).toBe(activity.projectId)
    expect(body).toEqual({
      clientRequestId: expect.any(String),
      budgetRecordId: 'budget-1',
      description: 'Synthetic supplies purchase',
      amount: '150.00',
      expenseDate: '2026-01-15',
    })
    expect(Object.keys(body).sort()).toEqual(
      ['amount', 'budgetRecordId', 'clientRequestId', 'description', 'expenseDate'].sort(),
    )
  })

  it('only offers budget allocations linked to this activity', () => {
    renderDialog(['expenses.submit'])
    expect(screen.getByText('Supplies')).toBeTruthy()
    expect(screen.queryByText('Other activity budget')).toBeNull()
  })

  it('hides the submission form when expenses.submit is absent', () => {
    renderDialog([])
    expect(screen.queryByLabelText('Budget allocation')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('outside your current permissions')
    expect((screen.getByRole('button', { name: /Save expense/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('shows the server error and does not close the dialog', async () => {
    state.submitExpense.mockRejectedValueOnce(new Error('Expense submission rejected.'))
    const onOpenChange = vi.fn()
    state.profile.permissions = ['expenses.submit']
    render(
      <ActivityExpenseDialog
        activity={activity}
        budgetReferences={references}
        onOpenChange={onOpenChange}
        onSubmitted={vi.fn()}
        open
      />,
    )
    fill()
    fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Expense submission rejected.'),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
