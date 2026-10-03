/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveFinanceWorkspace } from './live-finance-workspace'
const state = vi.hoisted(() => ({
  budgetsError: false,
  referencesError: false,
  twoExpenses: false,
  activityBudget: false,
  activityTitles: true,
  user: 'submitter',
  generation: 0,
  role: 'PROJECT_OFFICER',
  permissions: ['projects.read', 'expenses.submit', 'expenses.evidence.submit'],
  submit: vi.fn(),
  review: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
const projectId = '10000000-0000-4000-8000-000000000001'
const budgetId = '20000000-0000-4000-8000-000000000002'
const secondExpenseId = '30000000-0000-4000-8000-000000000003'
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: [state.role],
      permissions: state.permissions,
      assignedProjectIds: [projectId],
    },
  }),
}))
vi.mock('@/lib/auth/sensitive-drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/sensitive-drafts')>()),
  useSensitiveDraftOwner: (_profile: unknown, kind: string, permission: string) => {
    if (!state.permissions.includes(permission)) return null
    const user = state.user
    const generation = state.generation
    return {
      key: `${kind}:${user}`,
      generation,
      isCurrent: () =>
        user === state.user &&
        generation === state.generation &&
        state.permissions.includes(permission),
    }
  },
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { getActivityContext: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreDataClient: {
    submitExpense: (...args: unknown[]) => state.submit(...args),
    reviewExpense: (...args: unknown[]) => state.review(...args),
    replaceBudget: (...args: unknown[]) => state.replace(...args),
  },
  downloadCoreArtifact: vi.fn(),
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: (key: string) => ({
    data:
      key === 'expense-reference-activities'
        ? state.activityTitles
          ? [{ id: 'activity-1', title: 'Site visit' }]
          : []
        : key === 'expense-budget-references'
          ? [
              state.activityBudget
                ? { id: budgetId, category: 'ACTIVITY_PROFILE_TOTAL', activityId: 'activity-1' }
                : { id: budgetId, category: 'Delivery', activityId: null },
            ]
          : key === 'finance-budgets'
            ? [
                {
                  id: budgetId,
                  activityId: state.activityBudget ? 'activity-1' : null,
                  category: state.activityBudget ? 'ACTIVITY_PROFILE_TOTAL' : 'Delivery',
                  plannedBudget: '125.00',
                  remarks: null,
                  updatedAt: '2026-09-27T00:00:00.000Z',
                },
              ]
            : [
                ...(state.twoExpenses
                  ? [
                      {
                        id: secondExpenseId,
                        budgetRecordId: budgetId,
                        description: 'Second expense',
                        amount: '35.00',
                        expenseDate: '2026-09-27',
                        status: 'PENDING',
                        receiptEvidenceId: projectId,
                        submittedById: 'different-submitter',
                        verifiedById: null,
                        approvedById: null,
                        signedOffById: null,
                        signedOffAt: null,
                        updatedAt: '2026-09-27T00:00:00.000Z',
                      },
                    ]
                  : []),
                {
                  id: budgetId,
                  budgetRecordId: budgetId,
                  description: 'Recorded expense',
                  amount: '20.00',
                  expenseDate: '2026-09-27',
                  status: 'PENDING',
                  receiptEvidenceId: projectId,
                  submittedById: 'different-submitter',
                  verifiedById: null,
                  approvedById: null,
                  signedOffById: null,
                  signedOffAt: null,
                  updatedAt: '2026-09-27T00:00:00.000Z',
                },
              ],
    isPending: false,
    isError:
      (key === 'expense-budget-references' && state.referencesError) ||
      (key === 'finance-budgets' && state.budgetsError),
    refetch: state.refetch,
  }),
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))
const fill = () => {
  fireEvent.change(screen.getByLabelText('Budget reference'), { target: { value: budgetId } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Recorded delivery' } })
  fireEvent.change(screen.getByLabelText('Amount (PHP)'), { target: { value: '20.00' } })
  fireEvent.change(screen.getByLabelText('Expense date'), { target: { value: '2026-09-27' } })
}
describe('finance owned commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.referencesError = false
    state.budgetsError = false
    state.twoExpenses = false
    state.activityBudget = false
    state.activityTitles = true
    state.user = 'submitter'
    state.generation = 0
    state.role = 'PROJECT_OFFICER'
    state.permissions = ['projects.read', 'expenses.submit', 'expenses.evidence.submit']
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)
  it('keeps a pending allocation update busy when an unrelated receipt grant is revoked', async () => {
    state.role = 'PROJECT_MANAGER'
    state.permissions = [
      'projects.read',
      'budgets.read',
      'budgets.update',
      'budgets.create',
      'expenses.evidence.submit',
    ]
    let finish: (value: unknown) => void = () => {}
    state.replace.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = render(<LiveFinanceWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save allocation changes' }))
    expect(state.replace).toHaveBeenCalledOnce()
    state.permissions = state.permissions.filter(
      (permission) => permission !== 'expenses.evidence.submit',
    )
    view.rerender(<LiveFinanceWorkspace projectId={projectId} />)
    expect(
      screen.getByRole('button', { name: 'Save allocation changes' }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save allocation changes' }))
    expect(state.replace).toHaveBeenCalledOnce()
    await act(async () => finish({}))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
  })
  it('clears a cached allocation edit when current budget detail read fails', () => {
    state.role = 'PROJECT_MANAGER'
    state.permissions = ['projects.read', 'budgets.read', 'budgets.update', 'budgets.create']
    const view = render(<LiveFinanceWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }))
    expect((screen.getByLabelText('Planned allocation (PHP)') as HTMLInputElement).value).toBe(
      '125.00',
    )
    state.budgetsError = true
    view.rerender(<LiveFinanceWorkspace projectId={projectId} />)
    expect(screen.queryByRole('button', { name: 'Save allocation changes' })).toBeNull()
    expect((screen.getByLabelText('Planned allocation (PHP)') as HTMLInputElement).value).toBe('')
    expect(state.replace).not.toHaveBeenCalled()
  })
  it('hides cached allocation labels and clears selection after the current reference read fails', () => {
    const view = render(<LiveFinanceWorkspace projectId={projectId} />)
    fill()
    expect(screen.getByRole('option', { name: 'Delivery' })).toBeTruthy()
    state.referencesError = true
    view.rerender(<LiveFinanceWorkspace projectId={projectId} />)
    expect(screen.queryByRole('option', { name: 'Delivery' })).toBeNull()
    expect((screen.getByLabelText('Budget reference') as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Submit expense' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByText(/Budget references unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(state.submit).not.toHaveBeenCalled()
  })
  it('retries the exact expense request after response loss without exposing allocation amounts', async () => {
    state.submit.mockRejectedValueOnce(Error('Response lost')).mockResolvedValue({
      id: budgetId,
      projectId,
      status: 'PENDING',
      receiptEvidenceId: null,
      updatedAt: '2026-09-27T00:00:00Z',
    })
    render(<LiveFinanceWorkspace projectId={projectId} />)
    expect(screen.queryByText('PHP 125.00')).toBeNull()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Submit expense' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Submit expense' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.submit.mock.calls[1][1]).toEqual(state.submit.mock.calls[0][1])
  })
  it('clears the draft on identity replacement and ignores a late submitted acknowledgement', async () => {
    let finish: (value: unknown) => void = () => {}
    state.submit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = render(<LiveFinanceWorkspace projectId={projectId} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Submit expense' }))
    state.user = 'new-submitter'
    state.generation++
    view.rerender(<LiveFinanceWorkspace projectId={projectId} />)
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('')
    await act(async () =>
      finish({
        id: budgetId,
        projectId,
        status: 'PENDING',
        receiptEvidenceId: null,
        updatedAt: '2026-09-27T00:00:00Z',
      }),
    )
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
  })
  it('sends an allocation replacement with its exact displayed revision', async () => {
    state.role = 'PROJECT_MANAGER'
    state.permissions = ['projects.read', 'budgets.read', 'budgets.update']
    state.replace.mockResolvedValue({ id: budgetId, updatedAt: '2026-09-27T00:00:01Z' })
    render(<LiveFinanceWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }))
    fireEvent.change(screen.getByLabelText('Planned allocation (PHP)'), {
      target: { value: '150.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save allocation changes' }))
    await waitFor(() => expect(state.replace).toHaveBeenCalledOnce())
    expect(state.replace.mock.calls[0]).toEqual([
      projectId,
      budgetId,
      {
        category: 'Delivery',
        plannedBudget: '150.00',
        remarks: null,
        expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
      },
    ])
  })
  it('names the activity on activity budgets in the list and the reference select', () => {
    state.activityBudget = true
    state.role = 'PROJECT_MANAGER'
    state.permissions = [
      'projects.read',
      'budgets.read',
      'expenses.submit',
      'activities.context.read',
    ]
    render(<LiveFinanceWorkspace projectId={projectId} />)
    const labels = screen.getAllByText('Activity budget: Site visit')
    // One in the allocation list, one in the expense reference select.
    expect(labels.some((node) => node.tagName === 'P')).toBe(true)
    expect(screen.getByRole('option', { name: 'Activity budget: Site visit' })).toBeTruthy()
    expect(screen.queryByText('ACTIVITY_PROFILE_TOTAL')).toBeNull()
  })

  it('falls back to a plain Activity budget label when the activity title is unknown', () => {
    state.activityBudget = true
    state.activityTitles = false
    state.role = 'PROJECT_MANAGER'
    state.permissions = ['projects.read', 'budgets.read', 'expenses.submit']
    render(<LiveFinanceWorkspace projectId={projectId} />)
    expect(screen.getAllByText('Activity budget').length).toBeGreaterThan(0)
    expect(screen.queryByText('ACTIVITY_PROFILE_TOTAL')).toBeNull()
  })

  it('scrolls to and focuses the allocation form when an allocation is edited', () => {
    const scrollIntoView = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    try {
      state.role = 'PROJECT_MANAGER'
      state.permissions = ['projects.read', 'budgets.read', 'budgets.update']
      render(<LiveFinanceWorkspace projectId={projectId} />)
      expect(scrollIntoView).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Edit allocation' }))
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(document.activeElement).toBe(screen.getByLabelText('Category'))
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('does not refetch or toast a review after its permission is revoked while awaiting the response', async () => {
    state.role = 'MONITORING_AND_EVALUATION_OFFICER'
    state.permissions = ['projects.read', 'expenses.read', 'expenses.verify']
    let finish: (value: unknown) => void = () => {}
    state.review.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = render(<LiveFinanceWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Verify receipt and expense' }))
    state.permissions = ['projects.read', 'expenses.read']
    view.rerender(<LiveFinanceWorkspace projectId={projectId} />)
    await act(async () =>
      finish({
        id: budgetId,
        projectId,
        status: 'VERIFIED',
        receiptEvidenceId: projectId,
        updatedAt: '2026-09-27T00:00:01Z',
      }),
    )
    expect(state.refetch).not.toHaveBeenCalled()
    expect(state.success).not.toHaveBeenCalled()
  })
  it('keeps each rejection reason with its own expense and clears it after rejection', async () => {
    state.role = 'MONITORING_AND_EVALUATION_OFFICER'
    state.permissions = ['projects.read', 'expenses.read', 'expenses.verify']
    state.twoExpenses = true
    state.review.mockResolvedValue({})
    render(<LiveFinanceWorkspace projectId={projectId} />)
    const first = screen.getByLabelText('Reason for rejecting Recorded expense') as HTMLInputElement
    const second = screen.getByLabelText('Reason for rejecting Second expense') as HTMLInputElement
    fireEvent.change(first, { target: { value: 'Receipt total does not match.' } })
    expect(second.value).toBe('')
    const rejects = screen.getAllByRole('button', { name: 'Reject with reason' })
    expect(rejects).toHaveLength(2)
    expect(rejects.filter((button) => !button.hasAttribute('disabled'))).toHaveLength(1)
    await act(async () => {
      fireEvent.click(rejects[1])
    })
    expect(state.review).toHaveBeenCalledWith(projectId, budgetId, {
      expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
      stage: 'VERIFY',
      decision: 'REJECT',
      reason: 'Receipt total does not match.',
    })
    await waitFor(() => expect(first.value).toBe(''))
    expect(
      screen
        .getAllByRole('button', { name: 'Reject with reason' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true)
  })
})
