/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'

import type { ExpenseBudgetReference } from '../../activity-expense-dialog'
import type { PendingExpense } from '../../activity-expense-review-dialog'
import type { ActivityExpenseEntry } from './activity-detail-sections'
import { ProjectActivitiesWorkspace } from './project-activities-workspace'

const projectId = '75300000-0000-4000-8000-000000000001'
const activityId = '75300000-0000-4000-8000-000000000002'
const otherActivityId = '75300000-0000-4000-8000-000000000003'
const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
  getProjectIndicators: vi.fn(),
  getJourneyStages: vi.fn(),
  getProject: vi.fn(),
}))
const core = vi.hoisted(() => ({
  budgetReferences: vi.fn(),
  budgets: vi.fn(),
  expenses: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  access: 'ready',
  assignedProjectIds: ['75300000-0000-4000-8000-000000000001'],
  profile: {
    id: 'synthetic-subject',
    userId: 'synthetic-user',
    organizationId: 'synthetic-org',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: [
      'projects.read',
      'projects.detail.read',
      'activities.read',
      'journeys.read',
      'expenses.read',
      'expenses.submit',
      'budgets.read',
    ],
    assignedProjectIds: ['75300000-0000-4000-8000-000000000001'],
  },
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/journeys', () => ({
  journeysClient: { getJourneyStages: api.getJourneyStages },
}))
vi.mock('@/lib/api/indicators', () => ({
  indicatorsClient: { getProjectIndicators: api.getProjectIndicators },
}))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: core }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { projectActivities: 'Activities' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./activity-form-dialog', () => ({ ActivityFormDialog: () => null }))
vi.mock('./activity-proof-dialog', () => ({ ActivityProofDialog: () => null }))
vi.mock('./activity-detail-panel', () => ({
  ActivityDetailPanel: ({
    activity,
    activityExpenses,
    budgetReferences,
    onExpensesChanged,
    pendingExpenses,
  }: {
    activity: { title: string } | null
    activityExpenses: ActivityExpenseEntry[]
    budgetReferences: ExpenseBudgetReference[]
    onExpensesChanged: () => void
    pendingExpenses: PendingExpense[]
  }) =>
    activity ? (
      <section aria-label="Activity panel">
        <output data-testid="references">{budgetReferences.map((row) => row.id).join(',')}</output>
        <output data-testid="pending">
          {JSON.stringify(
            pendingExpenses.map(({ id, amount, category, status, projectId: scope }) => ({
              id,
              amount,
              category,
              status,
              scope,
            })),
          )}
        </output>
        <output data-testid="logged">
          {JSON.stringify(
            activityExpenses.map(({ id, amount, category, status }) => ({
              id,
              amount,
              category,
              status,
            })),
          )}
        </output>
        <button onClick={onExpensesChanged} type="button">
          Refresh expenses
        </button>
      </section>
    ) : null,
}))

const summary = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic outreach',
  description: 'Community sessions',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-12-01',
  assignedUserIds: [],
  assignedTo: ['Officer'],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  progress: 20,
  updatedAt: '2026-09-25T00:00:00.000Z',
  overdueExplanationNeeded: false,
}
const detail = {
  ...summary,
  assignedEmails: [],
  beneficiariesReached: 3,
  budgetAllocation: null,
  budgetLogged: null,
  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
}
const expense = (id: string, budgetRecordId: string, status: string, amount: string) => ({
  id,
  budgetRecordId,
  amount,
  status,
  expenseDate: '2026-09-01',
  description: `Expense ${id}`,
  updatedAt: '2026-09-02T00:00:00.000Z',
  receiptEvidenceId: null,
  submittedByName: 'Ana Cruz',
  verifiedByName: null,
  approvedByName: null,
})

let client: QueryClient
const renderWorkspace = () =>
  render(
    <QueryClientProvider client={client}>
      <AuthorizedQueryProvider>
        <ProjectActivitiesWorkspace initialActivityId={activityId} projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

const basePermissions = [
  'projects.read',
  'projects.detail.read',
  'activities.read',
  'journeys.read',
]

const asMonitoringOfficer = () => {
  access.role = 'Monitoring and Evaluation Officer'
  access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  access.profile.permissions = [...basePermissions, 'expenses.read', 'expenses.submit']
}
const asProjectManager = () => {
  access.role = 'Project Manager'
  access.profile.roles = ['PROJECT_MANAGER']
  access.profile.permissions = [...basePermissions, 'expenses.read', 'budgets.read']
}

describe('activity expenses derived for the open activity', () => {
  beforeEach(() => {
    client = new QueryClient()
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Assigned project',
      area: 'Area',
      sector: 'Sector',
      period: '2026',
      status: 'Active',
      projectOfficers: [],
      team: [],
    })
    api.getActivities.mockResolvedValue([summary])
    api.getActivity.mockResolvedValue(detail)
    api.getProjectIndicators.mockResolvedValue([])
    api.getJourneyStages.mockResolvedValue([])
    api.getAssignableProjectOfficers.mockResolvedValue([])
    core.budgetReferences.mockResolvedValue([
      { id: 'ref-1', category: 'TRAINING', activityId },
      { id: 'ref-other', category: 'VENUE', activityId: otherActivityId },
    ])
    core.budgets.mockResolvedValue([
      { id: 'ref-1', category: 'TRAINING', activityId },
      { id: 'line-2', category: 'SUPPLIES', activityId },
    ])
    core.expenses.mockResolvedValue([
      expense('e-pending', 'ref-1', 'PENDING', '250.50'),
      expense('e-verified', 'line-2', 'VERIFIED', '100'),
      expense('e-rejected', 'ref-1', 'REJECTED', '75'),
      expense('e-other', 'ref-other', 'PENDING', '40'),
    ])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('gives a validator the references and the pending expense, and logs only what the references link', async () => {
    asMonitoringOfficer()
    renderWorkspace()

    await waitFor(() =>
      expect(screen.getByTestId('references').textContent).toBe('ref-1,ref-other'),
    )
    await waitFor(() => expect(screen.getByTestId('pending').textContent).not.toBe('[]'))
    expect(JSON.parse(screen.getByTestId('pending').textContent ?? '')).toEqual([
      {
        id: 'e-pending',
        amount: 250.5,
        category: 'TRAINING',
        status: 'For Verification',
        scope: projectId,
      },
    ])
    expect(JSON.parse(screen.getByTestId('logged').textContent ?? '')).toEqual([
      { id: 'e-pending', amount: 250.5, category: 'TRAINING', status: 'PENDING' },
    ])
    expect(core.budgets).not.toHaveBeenCalled()
  })

  it('logs every unrejected expense of the activity for an approver who reads budget lines', async () => {
    asProjectManager()
    renderWorkspace()

    await waitFor(() => expect(screen.getByTestId('logged').textContent).toContain('e-verified'))
    expect(JSON.parse(screen.getByTestId('logged').textContent ?? '')).toEqual([
      { id: 'e-pending', amount: 250.5, category: 'TRAINING', status: 'PENDING' },
      { id: 'e-verified', amount: 100, category: 'SUPPLIES', status: 'VERIFIED' },
    ])
    expect(screen.getByTestId('references').textContent).toBe('')
    expect(screen.getByTestId('pending').textContent).toBe('[]')
    expect(core.budgetReferences).not.toHaveBeenCalled()
  })

  it('rereads the expenses, references and the activity after a change', async () => {
    asMonitoringOfficer()
    renderWorkspace()

    await waitFor(() => expect(screen.getByTestId('pending').textContent).not.toBe('[]'))
    const before = {
      expenses: core.expenses.mock.calls.length,
      references: core.budgetReferences.mock.calls.length,
      activity: api.getActivity.mock.calls.length,
    }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh expenses' }))

    await waitFor(() => {
      expect(core.expenses.mock.calls.length).toBe(before.expenses + 1)
      expect(core.budgetReferences.mock.calls.length).toBe(before.references + 1)
      expect(api.getActivity.mock.calls.length).toBe(before.activity + 1)
    })
  })
})
