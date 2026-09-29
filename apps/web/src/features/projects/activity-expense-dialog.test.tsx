/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const state = vi.hoisted(() => ({
  submitExpense: vi.fn(),
  uploadReceipt: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
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
  coreDataClient: { submitExpense: state.submitExpense, uploadReceipt: state.uploadReceipt },
}))
vi.mock('sonner', () => ({
  toast: { success: state.toastSuccess, warning: state.toastWarning },
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

const withReceipt = ['expenses.submit', 'expenses.evidence.submit']
const pickReceipt = () => {
  const file = new File(['%PDF-synthetic'], 'receipt.pdf', { type: 'application/pdf' })
  fireEvent.change(screen.getByLabelText(/Private receipt/), { target: { files: [file] } })
  return file
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
    state.uploadReceipt.mockResolvedValueOnce({})
    renderDialog(withReceipt)
    fill()
    pickReceipt()
    fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
    await waitFor(() => expect(state.submitExpense).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(state.toastSuccess).toHaveBeenCalledWith('Expense submitted for validation.'),
    )
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
    expect(
      (screen.getByRole('button', { name: /Save expense/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('shows the server error and does not close the dialog', async () => {
    state.submitExpense.mockRejectedValueOnce(new Error('Expense submission rejected.'))
    const onOpenChange = vi.fn()
    state.profile.permissions = withReceipt
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
    pickReceipt()
    fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Expense submission rejected.'),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  describe('required private receipt', () => {
    const ack = {
      id: 'expense-1',
      projectId: activity.projectId,
      status: 'PENDING',
      updatedAt: '2026-01-15T00:00:00.000Z',
      receiptEvidenceId: null,
    }
    const permissions = withReceipt
    const pick = pickReceipt

    it('attaches the chosen receipt through the existing endpoint after the expense is saved', async () => {
      state.submitExpense.mockResolvedValueOnce(ack)
      state.uploadReceipt.mockResolvedValueOnce({ ...ack, receiptEvidenceId: 'evidence-1' })
      const onSubmitted = vi.fn()
      const onOpenChange = vi.fn()
      state.profile.permissions = permissions
      render(
        <ActivityExpenseDialog
          activity={activity}
          budgetReferences={references}
          onOpenChange={onOpenChange}
          onSubmitted={onSubmitted}
          open
        />,
      )
      fill()
      const file = pick()
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      await waitFor(() => expect(state.uploadReceipt).toHaveBeenCalledTimes(1))
      expect(state.uploadReceipt).toHaveBeenCalledWith(
        activity.projectId,
        'expense-1',
        ack.updatedAt,
        file,
      )
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
      expect(onSubmitted).toHaveBeenCalledTimes(1)
    })

    it('marks the receipt input required and only flags it for receipt errors', async () => {
      renderDialog(permissions)
      const input = screen.getByLabelText(/Private receipt/)
      expect(input.getAttribute('aria-required')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      expect(screen.getByRole('alert').textContent).toContain('complete every field')
      expect(input.getAttribute('aria-describedby')).toBeNull()
      expect(input.getAttribute('aria-invalid')).toBeNull()
      fill()
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      expect(screen.getByRole('alert').textContent).toContain('Attach the receipt')
      expect(input.getAttribute('aria-describedby')).toBe('activity-expense-error')
      expect(input.getAttribute('aria-invalid')).toBe('true')
      state.submitExpense.mockRejectedValueOnce(new Error('Expense submission rejected.'))
      pick()
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe('Expense submission rejected.'),
      )
      expect(input.getAttribute('aria-describedby')).toBeNull()
      expect(input.getAttribute('aria-invalid')).toBeNull()
    })

    it('rejects an oversized PDF before saving anything', () => {
      renderDialog(permissions)
      fill()
      const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
      Object.defineProperty(big, 'size', { value: 10485761 })
      fireEvent.change(screen.getByLabelText(/Private receipt/), { target: { files: [big] } })
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      expect(screen.getByRole('alert').textContent).toContain('10 MiB')
      expect(state.submitExpense).not.toHaveBeenCalled()
    })

    it('blocks submission until a receipt is chosen', () => {
      renderDialog(permissions)
      fill()
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      expect(screen.getByRole('alert').textContent).toContain('Attach the receipt')
      expect(state.submitExpense).not.toHaveBeenCalled()
      expect(state.uploadReceipt).not.toHaveBeenCalled()
    })

    it('blocks submission when the account cannot attach receipts', () => {
      renderDialog(['expenses.submit'])
      expect(screen.getByRole('alert').textContent).toContain(
        'A receipt is required, and this account cannot attach receipts.',
      )
      expect(
        (screen.getByRole('button', { name: /Save expense/ }) as HTMLButtonElement).disabled,
      ).toBe(true)
      expect(state.submitExpense).not.toHaveBeenCalled()
    })

    it('keeps the saved expense and explains a failed attach', async () => {
      state.submitExpense.mockResolvedValueOnce(ack)
      state.uploadReceipt.mockRejectedValueOnce(new Error('storage down'))
      const onSubmitted = vi.fn()
      const onOpenChange = vi.fn()
      state.profile.permissions = permissions
      render(
        <ActivityExpenseDialog
          activity={activity}
          budgetReferences={references}
          onOpenChange={onOpenChange}
          onSubmitted={onSubmitted}
          open
        />,
      )
      fill()
      pick()
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(
          'Expense saved; receipt not attached. Attach it from the Budget tab.',
        ),
      )
      expect(onSubmitted).toHaveBeenCalledTimes(1)
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(state.toastWarning).toHaveBeenCalledWith('Expense saved without its receipt.')
      expect(state.toastSuccess).not.toHaveBeenCalled()
    })

    it('rejects an unsupported receipt before saving anything', () => {
      renderDialog(permissions)
      fill()
      const bad = new File(['x'], 'notes.txt', { type: 'text/plain' })
      fireEvent.change(screen.getByLabelText(/Private receipt/), { target: { files: [bad] } })
      fireEvent.click(screen.getByRole('button', { name: /Save expense/ }))
      expect(screen.getByRole('alert').textContent).toContain('PDF, PNG or JPEG')
      expect(state.submitExpense).not.toHaveBeenCalled()
    })
  })
})
