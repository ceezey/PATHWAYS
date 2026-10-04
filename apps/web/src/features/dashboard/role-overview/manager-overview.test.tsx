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
    expect(screen.getByText('Managing 1 project')).toBeTruthy()
  })
  it('opens expense approval in the activity sheet', () => {
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
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}?expense=${e}`)
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
    expect(screen.getByText('On track')).toBeTruthy()
  })
  it('pluralizes overdue days', () => {
    const counts = {
      overdueActivities: { count: 1, mostOverdue: { code: 'A-1', daysLate: 1 } },
      forReview: 2,
    } as unknown as DashboardActionCounts
    render(<ManagerOverview counts={counts} data={data} metrics={{}} onOpenActivity={vi.fn()} />)
    expect(screen.getByText('A-1 · 1 day')).toBeTruthy()
  })
})
