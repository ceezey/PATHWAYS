/* @vitest-environment jsdom */
import type { DashboardActionCounts, RoleOverview } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const p = '20000000-0000-4000-8000-00000000000a'
const e = '60000000-0000-4000-8000-000000000001'
const profile = { roles: ['PM'], permissions: [] }
const wiring = vi.hoisted(() => ({
  overview: { eligible: true, data: null as unknown, isError: false, refetch: vi.fn() },
  counts: { data: null as unknown },
  push: vi.fn(),
  replace: vi.fn(),
  extras: vi.fn(() => []),
  metrics: vi.fn(() => ({ metrics: {}, reads: null })),
  permission: vi.fn((_profile: unknown, permission: string) => permission === 'monitoring.read'),
}))
vi.mock('./use-role-overview', () => ({ useRoleOverview: () => wiring.overview }))
vi.mock('./use-project-extras', () => ({ useProjectExtras: wiring.extras }))
vi.mock('./project-metrics-reads', () => ({ useProjectMetrics: wiring.metrics }))
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: () => wiring.counts }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile }) }))
vi.mock('@/lib/rbac/policy', () => ({ principalHasAtomicPermission: wiring.permission }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: wiring.push, replace: wiring.replace }),
}))

import type { PathwaysRole } from '@/types/pathways-role'
import { RoleOverviewDashboard } from './role-overview'

const show = (role: PathwaysRole) => render(<RoleOverviewDashboard fullName="Ron" role={role} />)

const alert = {
  id: e,
  projectId: p,
  title: 'Budget depletion risk',
  severity: 'CRITICAL',
  explanation: '91% utilized',
  recommendation: null,
  budget: true,
}
const data = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [
    {
      id: p,
      code: 'P-1',
      title: 'FutureMakers NCR',
      status: 'ONGOING',
      programName: 'YEE',
      managerName: 'Jan Pascual',
    },
  ],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: {
    count: 1,
    rows: [
      {
        expenseId: e,
        activityId: '40000000-0000-4000-8000-000000000001',
        projectId: p,
        projectTitle: 'FutureMakers NCR',
        description: 'Meals',
        amount: '27000.00',
        verifiedByName: 'Leah Sy',
        verifiedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
  },
  myExtensions: null,
  extensionQueue: null,
  escalationQueue: null,
  datasetsImportedThisMonth: null,
  alerts: {
    open: 1,
    capped: false,
    bySeverity: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
    byProject: [{ projectId: p, open: 1, maxSeverity: 'CRITICAL' }],
    recent: [alert],
    budgetOpen: 1,
    budgetRecent: [alert],
    escalatedOpen: 0,
    escalated: [],
  },
} as RoleOverview
const actionCounts = {
  contractVersion: 'dashboard.action-counts.v1',
  businessDate: '2026-10-04',
  pendingApprovals: 1,
  activeAlerts: { count: 1, capped: false },
  overdueActivities: { count: 13, mostOverdue: { code: 'ACT-9', daysLate: 3 } },
  forReview: 47,
} as DashboardActionCounts

describe('RoleOverviewDashboard wiring', () => {
  beforeEach(() => {
    wiring.overview = { eligible: true, data, isError: false, refetch: vi.fn() }
    wiring.counts = { data: null }
  })
  afterEach(() => {
    cleanup()
    for (const fn of [
      wiring.push,
      wiring.replace,
      wiring.extras,
      wiring.metrics,
      wiring.permission,
    ])
      fn.mockClear()
  })

  it('passes the action counts read to the manager cards', () => {
    wiring.counts = { data: actionCounts }
    show('Project Manager')

    const strip = within(screen.getByLabelText('Management counts'))
    expect(strip.getByText('13')).toBeTruthy()
    expect(strip.getByText('ACT-9 · 3 days')).toBeTruthy()
    expect(strip.getByText('47')).toBeTruthy()
  })

  it('renders the manager cards without the overdue and review tiles while counts are missing', () => {
    show('Project Manager')

    expect(screen.getByText('Pending approvals')).toBeTruthy()
    expect(screen.queryByText('Overdue activities')).toBeNull()
    expect(screen.queryByText('For review')).toBeNull()
  })

  it.each([
    ['Project Officer', 'Your task counts'],
    ['Monitoring and Evaluation Officer', 'Monitoring counts'],
    ['Project Manager', 'Management counts'],
    ['Program Manager', 'Portfolio counts'],
    ['Grant Manager', 'Portfolio counts'],
  ] as const)('renders only the %s layout', (role, label) => {
    show(role)

    const labels = [
      'Your task counts',
      'Monitoring counts',
      'Management counts',
      'Portfolio counts',
    ]
    expect(labels.filter((name) => screen.queryByLabelText(name))).toEqual([label])
  })

  it('shows the Decide button to a Program Manager and hides it from a Grant Manager', () => {
    const { unmount } = show('Program Manager')
    expect(screen.getByText('Portfolio overview')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Decide' }).getAttribute('href')).toBe(
      `/alerts?alert=${e}`,
    )
    unmount()

    show('Grant Manager')
    expect(screen.getByText('Portfolio overview')).toBeTruthy()
    expect(screen.getByText('Budget depletion risk')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Decide' })).toBeNull()
  })

  it('opens a dashboard action with push and never replaces the page', () => {
    show('Project Manager')
    fireEvent.click(screen.getByRole('button', { name: 'Approve Meals' }))

    expect(wiring.push).toHaveBeenCalledTimes(1)
    expect(wiring.push).toHaveBeenCalledWith(`/projects/${p}/budget?expense=${e}`)
    expect(wiring.replace).not.toHaveBeenCalled()
  })

  it('checks the monitoring grant and hands the evaluation read its inputs', () => {
    show('Monitoring and Evaluation Officer')

    expect(wiring.permission).toHaveBeenCalledWith(profile, 'monitoring.read')
    expect(wiring.extras).toHaveBeenCalledWith(
      data.projects,
      'Monitoring and Evaluation Officer',
      true,
    )
  })

  it('passes the monitoring grant result through as false', () => {
    wiring.permission.mockReturnValueOnce(false)
    show('Monitoring and Evaluation Officer')

    expect(wiring.extras).toHaveBeenCalledWith(
      data.projects,
      'Monitoring and Evaluation Officer',
      false,
    )
  })

  it('hands the metrics read the loaded projects and the role', () => {
    show('Program Manager')

    expect(wiring.metrics).toHaveBeenCalledWith(data.projects, 'Program Manager')
  })

  it('hands the project reads an empty list until the payload loads', () => {
    wiring.overview = { ...wiring.overview, data: null }
    show('Program Manager')

    expect(wiring.metrics).toHaveBeenCalledWith([], 'Program Manager')
    expect(wiring.extras).toHaveBeenCalledWith([], 'Program Manager', true)
  })

  it('reads the dashboard again when Retry is pressed', () => {
    wiring.overview = { ...wiring.overview, isError: true }
    show('Project Manager')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(wiring.overview.refetch).toHaveBeenCalledTimes(1)
  })
})
