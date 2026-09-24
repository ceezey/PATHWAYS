/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectDetail } from '@/types/pathways'

import { ReportingWorkspace } from './reporting-workspace'

const projectId = '72000000-0000-4000-8000-000000000004'
const api = vi.hoisted(() => ({ getProjectIndicators: vi.fn() }))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'monitoring.read', 'reports.read', 'reports.indicator.read'],
    assignedProjectIds: ['72000000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ ...access, assignedProjectIds: access.profile.assignedProjectIds }),
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleReports: 'Reports' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

const project = {
  id: projectId,
  title: 'Project A',
  area: 'Area',
  sector: 'Sector',
  status: 'Active',
  health: 'On Track',
  period: '2026-01-01 - 2026-12-31',
  projectManager: 'Manager',
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
  targetGoal: null,
  description: 'Description',
  programManager: 'Program Manager',
  monitoringOfficer: 'M&E Officer',
  projectOfficers: [],
  targetBeneficiaries: 0,
  budgetCode: 'BUD-1',
} satisfies ProjectDetail

const renderWorkspace = (initialKind: 'project-summary' | 'indicator-summary') =>
  render(
    <ReportingWorkspace
      activities={[]}
      indicators={[]}
      initialKind={initialKind}
      journeyStages={[]}
      projects={[project]}
      reports={[]}
      surveyForms={[]}
      surveyResults={[]}
    />,
  )

describe('report-type dependency loading', () => {
  beforeEach(() => {
    access.role = 'Monitoring and Evaluation Officer'
    access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    access.profile.permissions = [
      'projects.read',
      'monitoring.read',
      'reports.read',
      'reports.indicator.read',
    ]
    api.getProjectIndicators.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not fetch Indicators for a Project Summary', async () => {
    renderWorkspace('project-summary')

    expect(await screen.findByRole('heading', { name: 'Project Summary' })).toBeTruthy()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
  })

  it('loads Indicators only for an authorized active Indicator Summary', async () => {
    renderWorkspace('indicator-summary')

    await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith(projectId))
  })

  it('keeps Grant Manager authorized without issuing its forbidden Indicator read', async () => {
    access.role = 'Grant Manager'
    access.profile.roles = ['GRANT_MANAGER']
    access.profile.permissions = ['projects.read', 'reports.read', 'reports.indicator.read']

    renderWorkspace('indicator-summary')

    expect(await screen.findByText('Indicator report records unavailable')).toBeTruthy()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
  })
})
