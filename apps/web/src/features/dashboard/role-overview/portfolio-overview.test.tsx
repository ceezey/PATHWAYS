/* @vitest-environment jsdom */
import type { RoleOverview } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PortfolioOverview } from './portfolio-overview'

const p1 = '20000000-0000-4000-8000-00000000000a'
const p2 = '20000000-0000-4000-8000-00000000000b'
const data = {
  contractVersion: 'dashboard.role-overview.v1',
  businessDate: '2026-10-04',
  projects: [
    {
      id: p1,
      code: 'P-1',
      title: 'FutureMakers NCR',
      status: 'ONGOING',
      programName: 'YEE',
      managerName: 'Jan Pascual',
    },
    {
      id: p2,
      code: 'P-2',
      title: 'Safe Spaces',
      status: 'PLANNED',
      programName: 'CP',
      managerName: null,
    },
  ],
  myActivities: null,
  flaggedProof: null,
  recentSubmissions: null,
  submittedThisMonth: null,
  proofQueue: null,
  approvalQueue: null,
  datasetsImportedThisMonth: null,
  alerts: {
    open: 1,
    capped: false,
    bySeverity: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
    byProject: [{ projectId: p1, open: 1, maxSeverity: 'CRITICAL' }],
    recent: [
      {
        id: p2,
        projectId: p1,
        title: 'Budget depletion risk',
        severity: 'CRITICAL',
        explanation: '91% utilized',
        recommendation: 'Review reallocation',
        budget: true,
      },
    ],
  },
} as RoleOverview

describe('PortfolioOverview', () => {
  afterEach(cleanup)
  it('counts health labels and treats planned projects as Planned', () => {
    render(<PortfolioOverview data={data} fullName="Maria" metrics={{}} readOnly={false} />)
    expect(screen.getByText('Critical', { selector: 'p' }).parentElement?.textContent).toContain(
      '1',
    )
    expect(screen.getByText('Planned')).toBeTruthy()
    expect(screen.getByText('2 projects across 2 programs')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Decide' })).toBeTruthy()
  })
  it('hides decision buttons for the read-only Grant Manager view', () => {
    render(<PortfolioOverview data={data} fullName="Gina" metrics={{}} readOnly />)
    expect(screen.queryByRole('link', { name: 'Decide' })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('hides the alerts card when the alerts section is null', () => {
    render(<PortfolioOverview data={{ ...data, alerts: null }} metrics={{}} readOnly={false} />)
    expect(screen.queryByText('Open alerts')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Decide' })).toBeNull()
  })
  it('pluralizes a single project and program', () => {
    render(
      <PortfolioOverview data={{ ...data, projects: [data.projects[0]] }} metrics={{}} readOnly />,
    )
    expect(screen.getByText('1 project across 1 program')).toBeTruthy()
  })
})
