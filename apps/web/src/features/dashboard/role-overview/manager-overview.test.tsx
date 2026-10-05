/* @vitest-environment jsdom */
import type { DashboardActionCounts, RoleOverview } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerOverview } from './manager-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const e = '60000000-0000-4000-8000-000000000001'
const a = '40000000-0000-4000-8000-000000000001'
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
        activityId: a,
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
  datasetsImportedThisMonth: null,
  alerts: {
    open: 1,
    capped: false,
    bySeverity: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
    byProject: [{ projectId: p, open: 1, maxSeverity: 'CRITICAL' }],
    recent: [
      {
        id: e,
        projectId: p,
        title: 'Budget depletion risk',
        severity: 'CRITICAL',
        explanation: '91% utilized',
        recommendation: null,
        budget: true,
      },
    ],
    budgetOpen: 1,
    budgetRecent: [
      {
        id: e,
        projectId: p,
        title: 'Budget depletion risk',
        severity: 'CRITICAL',
        explanation: '91% utilized',
        recommendation: null,
        budget: true,
      },
    ],
    escalatedOpen: 0,
    escalated: [],
  },
} as RoleOverview
const metrics = {
  [p]: { kpi: '57%', budget: { percent: 76, allocated: '1200000', used: '912000' } },
}

describe('ManagerOverview', () => {
  afterEach(cleanup)
  it('labels project health from open alerts', () => {
    render(
      <ManagerOverview
        counts={null}
        data={data}
        fullName="Jan"
        metrics={metrics}
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('Critical')).toBeTruthy()
    expect(screen.getByText('Managing 1 project · FutureMakers NCR')).toBeTruthy()
  })
  it('opens expense approval in the budget ledger', () => {
    const open = vi.fn()
    render(
      <ManagerOverview
        counts={null}
        data={data}
        fullName="Jan"
        metrics={{}}
        onOpenActivity={open}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve Meals' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/budget?expense=${e}`)
  })
  it('hides cards and tiles whose section is null', () => {
    const counts = { overdueActivities: null, forReview: null } as unknown as DashboardActionCounts
    render(
      <ManagerOverview
        counts={counts}
        data={{ ...data, approvalQueue: null, alerts: null }}
        fullName="Jan"
        metrics={{}}
        onOpenActivity={vi.fn()}
      />,
    )
    for (const text of [
      'Pending approvals',
      'Pending your approval',
      'Active budget alerts',
      'Budget alerts requiring your decision',
      'Overdue activities',
      'For review',
    ])
      expect(screen.queryByText(text)).toBeNull()
    expect(screen.queryByText('On track')).toBeNull()
    expect(screen.queryByText('Critical')).toBeNull()
    expect(screen.queryByText(/Health reflects/)).toBeNull()
  })
  it('pluralizes overdue days', () => {
    const counts = {
      overdueActivities: { count: 1, mostOverdue: { code: 'A-1', daysLate: 1 } },
      forReview: 2,
    } as unknown as DashboardActionCounts
    render(<ManagerOverview counts={counts} data={data} metrics={{}} onOpenActivity={vi.fn()} />)
    expect(screen.getByText('A-1 · 1 day')).toBeTruthy()
  })
  it('drives the budget tile and list from the budget alert fields', () => {
    const alerts = {
      ...data.alerts,
      recent: [],
      budgetOpen: 3,
      capped: true,
    } as RoleOverview['alerts']
    render(
      <ManagerOverview
        counts={null}
        data={{ ...data, alerts }}
        metrics={{}}
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('3+')).toBeTruthy()
    expect(screen.getByText(/Budget depletion risk/)).toBeTruthy()
  })
  it('caps the subtitle at two project titles', () => {
    const projects = ['A', 'B', 'C', 'D'].map((title, n) => ({
      ...data.projects[0],
      id: `20000000-0000-4000-8000-00000000010${n}`,
      title,
    }))
    render(
      <ManagerOverview
        counts={null}
        data={{ ...data, projects }}
        metrics={{}}
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('Managing 4 projects · A · B · +2 more')).toBeTruthy()
  })
  it('notes the project list limit', () => {
    const projects = Array.from({ length: 20 }, (_, n) => ({
      ...data.projects[0],
      id: `20000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
    }))
    render(
      <ManagerOverview
        counts={null}
        data={{ ...data, projects }}
        metrics={{}}
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('Showing the first 20 projects.')).toBeTruthy()
  })
  it('adds extension rows with an EXT badge to Pending your approval', () => {
    const open = vi.fn()
    render(
      <ManagerOverview
        counts={null}
        data={{
          ...data,
          approvalQueue: null,
          extensionQueue: {
            count: 1,
            rows: [
              {
                id: '70000000-0000-4000-8000-000000000001',
                activityId: a,
                projectId: p,
                projectTitle: 'FutureMakers NCR',
                activityCode: 'ACT-009',
                activityTitle: 'Distribute kits',
                requesterName: 'Ron Perez',
                requestedEndDate: '2026-12-15',
                currentEndDate: '2026-11-30',
                reason: 'Rains delayed delivery.',
                stage: 'DECIDE',
              },
            ],
          } as RoleOverview['extensionQueue'],
        }}
        fullName="Jan"
        metrics={{}}
        onOpenActivity={open}
      />,
    )
    expect(screen.getByText('Pending your approval')).toBeTruthy()
    expect(screen.getByText('EXT')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve extension for ACT-009' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}?action=extension`)
  })
})
