/* @vitest-environment jsdom */
import type { RoleOverview } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficerOverview } from './officer-overview'

const p = '20000000-0000-4000-8000-00000000000a'
const a = '40000000-0000-4000-8000-000000000001'
const u = '50000000-0000-4000-8000-000000000001'
const data = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [
    {
      id: p,
      code: 'P-1',
      title: 'FutureMakers NCR',
      status: 'ONGOING',
      programName: null,
      managerName: null,
    },
  ],
  myActivities: {
    count: 1,
    rows: [
      {
        id: a,
        projectId: p,
        projectTitle: 'FutureMakers NCR',
        code: 'ACT-001',
        title: 'Technical skills training',
        status: 'IN_PROGRESS',
        overdue: true,
        plannedEndDate: '2026-09-20',
        progress: 40,
      },
    ],
  },
  flaggedProof: {
    count: 1,
    rows: [
      {
        updateId: u,
        activityId: a,
        projectId: p,
        activityCode: 'ACT-001',
        activityTitle: 'Technical skills training',
        reviewReason: 'Missing officer signatures.',
        reviewedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
  recentSubmissions: {
    count: 1,
    rows: [
      {
        kind: 'EXPENSE',
        id: u,
        projectId: p,
        activityId: a,
        label: 'Workshop materials',
        amount: '14800.00',
        progress: null,
        status: 'VERIFIED',
        submittedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
  },
  submittedThisMonth: { updates: 2, expenses: 1 },
  proofQueue: null,
  approvalQueue: null,
  datasetsImportedThisMonth: null,
  alerts: null,
} as RoleOverview

describe('OfficerOverview', () => {
  afterEach(cleanup)
  it('shows the four KPIs from the payload', () => {
    render(<OfficerOverview data={data} fullName="Ron Perez" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('Assigned activities')).toBeTruthy()
    expect(screen.getByText('Submitted this month').parentElement?.textContent).toContain('3')
  })
  it('opens the activity review sheet from Resubmit proof', () => {
    const open = vi.fn()
    render(<OfficerOverview data={data} fullName="Ron Perez" onOpenActivity={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit proof' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}`)
  })
  it('labels a returned submission and formats the amount', () => {
    render(
      <OfficerOverview
        data={{
          ...data,
          recentSubmissions: {
            count: 1,
            rows: [
              {
                ...(data.recentSubmissions?.rows[0] as NonNullable<
                  RoleOverview['recentSubmissions']
                >['rows'][number]),
                status: 'REJECTED',
              },
            ],
          },
        }}
        fullName="Ron"
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('Returned')).toBeTruthy()
    expect(screen.getByText(/PHP 14,800.00/)).toBeTruthy()
  })
  it('renders no restricted sections when every list is null', () => {
    render(
      <OfficerOverview
        data={{
          ...data,
          myActivities: null,
          flaggedProof: null,
          recentSubmissions: null,
          submittedThisMonth: null,
        }}
        fullName="Ron"
        onOpenActivity={vi.fn()}
      />,
    )
    for (const text of ['Overdue', 'Flagged proof', 'Your activities', 'Needs your attention'])
      expect(screen.queryByText(text)).toBeNull()
  })
})
