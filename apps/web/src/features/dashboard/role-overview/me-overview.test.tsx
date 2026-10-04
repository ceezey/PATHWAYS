/* @vitest-environment jsdom */
import type { RoleOverview } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeOverview } from './me-overview'

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
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: {
    count: 1,
    rows: [
      {
        updateId: u,
        activityId: a,
        projectId: p,
        projectTitle: 'FutureMakers NCR',
        activityCode: 'ACT-003',
        activityTitle: 'Progress update',
        submitterName: 'Ron Perez',
        submittedAt: '2026-10-02T00:00:00.000Z',
        progress: 57,
      },
    ],
  },
  approvalQueue: null,
  datasetsImportedThisMonth: 6,
  alerts: {
    open: 3,
    capped: false,
    bySeverity: { CRITICAL: 2, HIGH: 1, MEDIUM: 0, LOW: 0 },
    byProject: [{ projectId: p, open: 3, maxSeverity: 'CRITICAL' }],
    recent: [
      {
        id: u,
        projectId: p,
        title: 'Budget depletion risk',
        severity: 'CRITICAL',
        explanation: '91% utilized',
        recommendation: 'Recommend reallocation',
        budget: true,
      },
    ],
  },
} as RoleOverview

describe('MeOverview', () => {
  afterEach(cleanup)
  it('splits active alerts by severity', () => {
    render(<MeOverview data={data} evaluations={[]} fullName="Leah Sy" onOpenActivity={vi.fn()} />)
    expect(screen.getByText('2 critical · 1 high')).toBeTruthy()
  })
  it('opens proof review with the update id', () => {
    const open = vi.fn()
    render(<MeOverview data={data} evaluations={[]} fullName="Leah Sy" onOpenActivity={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'Review ACT-003' }))
    expect(open).toHaveBeenCalledWith(`/projects/${p}/activities/${a}?review=${u}`)
  })
  it('shows the stored evaluation score without a rating label', () => {
    render(
      <MeOverview
        data={data}
        evaluations={[{ projectId: p, title: 'FutureMakers NCR', score: '65' }]}
        fullName="Leah"
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('65')).toBeTruthy()
    expect(screen.queryByText(/Needs improvement|^Good$/)).toBeNull()
  })
  it('shows a placeholder when a project has no evaluation', () => {
    render(
      <MeOverview
        data={data}
        evaluations={[{ projectId: p, title: 'FutureMakers NCR', score: null }]}
        onOpenActivity={vi.fn()}
      />,
    )
    expect(screen.getByText('No evaluation yet')).toBeTruthy()
  })
  it('hides cards and KPIs whose payload section is null', () => {
    const hidden = { ...data, proofQueue: null, alerts: null, datasetsImportedThisMonth: null }
    render(<MeOverview data={hidden} evaluations={[]} onOpenActivity={vi.fn()} />)
    for (const text of [
      'Active alerts',
      'Proof pending review',
      'Datasets imported',
      'Active alerts requiring review',
      'Proof submissions awaiting review',
    ])
      expect(screen.queryByText(text)).toBeNull()
    expect(screen.getByText('Evaluation snapshots')).toBeTruthy()
  })
})
