/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectPhaseFiveWorkspace } from './project-review-workspace'

const projectId = '72000000-0000-4000-8000-000000000004'
const api = vi.hoisted(() => ({
  getEvidence: vi.fn(),
  getProject: vi.fn(),
  getReports: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'evidence.review', 'reports.read'],
    assignedProjectIds: ['72000000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => access,
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({
    labels: {
      projectWorkspace: 'Project workspace',
      projectEvidence: 'Evidence',
      projectIndicators: 'Indicators',
      projectMonitorEvaluate: 'Monitor & Evaluate',
      projectBudget: 'Budget',
      projectPublicDashboard: 'Transparency',
    },
  }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./project-workspace-header', () => ({
  ProjectWorkspaceHeader: () => <nav>Project tabs</nav>,
}))

describe('shared project workspace optional loading', () => {
  beforeEach(() => {
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Project Alpha',
      metricsAvailable: true,
    })
    api.getEvidence.mockRejectedValue(new Error('not_configured'))
    api.getReports.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps an authorized view usable when one optional service is unavailable', async () => {
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)

    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(await screen.findByText('Some information is unavailable')).toBeTruthy()
    expect(screen.getByText('Evidence records')).toBeTruthy()
    expect(screen.getByText('No evidence records are available for this project.')).toBeTruthy()
    await waitFor(() => expect(api.getReports).toHaveBeenCalledWith(projectId))
  })
})
