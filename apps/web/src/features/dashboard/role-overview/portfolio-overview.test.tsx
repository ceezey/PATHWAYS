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
  myExtensions: null,
  extensionQueue: null,
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
    budgetOpen: 1,
    budgetRecent: [
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
    escalatedOpen: 0,
    escalated: [],
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
  it('hides health labels and badges when alerts are null', () => {
    render(<PortfolioOverview data={{ ...data, alerts: null }} metrics={{}} readOnly={false} />)
    for (const text of ['Critical', 'At risk', 'On track'])
      expect(screen.queryByText(text)).toBeNull()
    expect(screen.queryByText(/Health reflects/)).toBeNull()
  })
  it('notes the project list limit', () => {
    const projects = Array.from({ length: 20 }, (_, n) => ({
      ...data.projects[0],
      id: `20000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
    }))
    render(<PortfolioOverview data={{ ...data, projects }} metrics={{}} readOnly={false} />)
    expect(screen.getByText('Showing the first 20 projects.')).toBeTruthy()
  })
  it('shows escalated alerts with their date in place of open alerts', () => {
    const alerts = data.alerts as NonNullable<RoleOverview['alerts']>
    const escalated = [
      { ...alerts.recent[0], title: 'Escalated KPI gap', escalatedAt: '2026-10-02T03:00:00.000Z' },
    ]
    render(
      <PortfolioOverview
        data={{ ...data, alerts: { ...alerts, escalated, escalatedOpen: 1 } }}
        metrics={{}}
        readOnly={false}
      />,
    )
    expect(screen.getByText('Escalated alerts')).toBeTruthy()
    expect(screen.getByText('Requiring program-level decision')).toBeTruthy()
    expect(screen.getByText('Escalated KPI gap')).toBeTruthy()
    expect(screen.getByText(/Escalated Oct 2, 2026/)).toBeTruthy()
    expect(screen.queryByText('Open alerts')).toBeNull()
  })
  it('falls back to open alerts when nothing is escalated', () => {
    render(<PortfolioOverview data={data} metrics={{}} readOnly={false} />)
    expect(screen.getByText('Open alerts')).toBeTruthy()
    expect(screen.queryByText('Escalated alerts')).toBeNull()
  })
  it('gives the Grant Manager no Decide button on escalated alerts', () => {
    const alerts = data.alerts as NonNullable<RoleOverview['alerts']>
    const escalated = [{ ...alerts.recent[0], escalatedAt: '2026-10-02T03:00:00.000Z' }]
    render(
      <PortfolioOverview
        data={{ ...data, alerts: { ...alerts, escalated, escalatedOpen: 1 } }}
        metrics={{}}
        readOnly
      />,
    )
    expect(screen.getByText('Escalated alerts')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Decide' })).toBeNull()
  })
})
