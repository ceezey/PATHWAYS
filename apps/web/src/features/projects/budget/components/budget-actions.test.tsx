/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  budgets: vi.fn(),
  createBudget: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { permissions: state.permissions } }),
}))
vi.mock('@/lib/rbac/policy', () => ({
  principalHasAtomicPermission: (profile: { permissions: string[] }, permission: string) =>
    profile.permissions.includes(permission),
}))
vi.mock('@/hooks/use-pending-create', () => ({
  usePendingCreate: () => ({
    submit: (_fingerprint: string, run: () => Promise<unknown>) => run(),
    notice: null,
    pending: false,
  }),
}))
vi.mock('@/lib/api/finance', () => ({
  financeClient: { budgets: state.budgets, createBudget: state.createBudget },
}))

import { BudgetActions } from './budget-actions'

const projectId = '72000000-0000-4000-8000-000000000004'
const recordAllocation = async () => {
  render(<BudgetActions activities={[]} onDone={vi.fn(async () => {})} projectId={projectId} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add allocation' }))
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Project staff travel' } })
  fireEvent.change(screen.getByLabelText('Planned amount (PHP)'), { target: { value: '60000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record allocation' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Budget allocation recorded.'))
}

describe('Add allocation notice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.createBudget.mockResolvedValue({ id: 'b9', updatedAt: '2026-11-24T00:00:00.000Z' })
    state.budgets.mockResolvedValue([
      { category: 'PROJECT_PROFILE_TOTAL', plannedBudget: '1455000.00' },
      { category: 'ACTIVITY_PROFILE_TOTAL', plannedBudget: '1260000.00' },
      { category: 'Project staff travel', plannedBudget: '60000.00' },
    ])
  })
  afterEach(cleanup)

  it('toasts the allocated total against the planned total in its severity color', async () => {
    state.permissions = ['budgets.create', 'budgets.read']
    await recordAllocation()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Allocated ₱1,320,000.00 of ₱1,455,000.00 (90%)', {
        description: 'This allocation is ₱60,000.00. The project is close to its planned budget.',
      }),
    )
  })

  it('shows no notice to a recorder who cannot read budgets', async () => {
    state.permissions = ['budgets.create']
    await recordAllocation()
    expect(state.budgets).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
