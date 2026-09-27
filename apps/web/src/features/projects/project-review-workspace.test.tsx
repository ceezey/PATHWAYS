/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectPhaseFiveWorkspace } from './project-review-workspace'

const projectId = '72000000-0000-4000-8000-000000000004'
const api = vi.hoisted(() => ({
  getEvidence: vi.fn(),
  getProject: vi.fn(),
  getReports: vi.fn(),
  getProjectIndicators: vi.fn(),
  getEvaluation: vi.fn(),
  getBudgets: vi.fn(),
  getTransparencySections: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Monitoring and Evaluation Officer',
  profile: {
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['projects.read', 'evidence.read', 'evidence.review', 'reports.read'],
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
    access.role = 'Monitoring and Evaluation Officer'
    access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
    access.profile.assignedProjectIds = [projectId]
    access.profile.permissions = [
      'projects.read',
      'evidence.read',
      'evidence.review',
      'reports.read',
    ]
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Project Alpha',
      metricsAvailable: true,
    })
    api.getEvidence.mockRejectedValue(new Error('not_configured'))
    api.getReports.mockResolvedValue([])
    api.getProjectIndicators.mockResolvedValue([])
    api.getEvaluation.mockResolvedValue(null)
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
  it.each([false, undefined])(
    'does not block existing authorized evidence content for metric availability %s',
    async (metricsAvailable) => {
      api.getProject.mockResolvedValue({ id: projectId, title: 'Project Alpha', metricsAvailable })
      api.getEvidence.mockResolvedValue([])
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
      expect(
        await screen.findByText('No evidence records are available for this project.'),
      ).toBeTruthy()
      await waitFor(() => expect(api.getEvidence).toHaveBeenCalledWith(projectId))
      expect(screen.queryByRole('heading', { name: 'Workspace unavailable' })).toBeNull()
    },
  )
  it('preserves current permission-driven optional reads with unavailable metrics', async () => {
    access.profile.permissions = ['projects.read', 'evidence.review']
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Project Alpha',
      metricsAvailable: false,
    })
    api.getEvidence.mockResolvedValue([])
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(api.getReports).not.toHaveBeenCalled()
  })
  it('keeps failed project authorization authoritative and does not read children', async () => {
    api.getProject.mockRejectedValue(new Error('Project unavailable.'))
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Workspace unavailable' })).toBeTruthy()
    expect(api.getEvidence).not.toHaveBeenCalled()
    expect(api.getReports).not.toHaveBeenCalled()
  })
  it.each(['indicators', 'monitor-evaluate'] as const)(
    'loads existing authorized %s content without metric availability',
    async (view) => {
      access.profile.permissions = ['projects.read', 'monitoring.read']
      api.getProject.mockResolvedValue({
        id: projectId,
        title: 'Project Alpha',
        metricsAvailable: false,
      })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view={view} />)
      expect(
        await screen.findByRole('heading', {
          name: view === 'indicators' ? 'Indicators' : 'Monitor & Evaluate',
        }),
      ).toBeTruthy()
      await waitFor(() =>
        expect(
          view === 'indicators' ? api.getProjectIndicators : api.getEvaluation,
        ).toHaveBeenCalledWith(projectId),
      )
      expect(screen.queryByRole('heading', { name: 'Workspace unavailable' })).toBeNull()
    },
  )
  it.each(['budget', 'transparency'] as const)(
    'retains existing %s metric admission until truthful finance displays are reviewed',
    async (view) => {
      access.profile.permissions = ['projects.read', 'budgets.read', 'transparency.read']
      api.getProject.mockResolvedValue({
        id: projectId,
        title: 'Project Alpha',
        metricsAvailable: false,
      })
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view={view} />)
      expect(await screen.findByRole('heading', { name: 'Workspace unavailable' })).toBeTruthy()
      expect(api.getBudgets).not.toHaveBeenCalled()
      expect(api.getTransparencySections).not.toHaveBeenCalled()
      expect(api.getEvidence).not.toHaveBeenCalled()
    },
  )
  const proofId = '72000000-0000-4000-8000-000000000005'
  const activityId = '72000000-0000-4000-8000-000000000006'
  const proof = {
    id: proofId,
    projectId,
    activityId,
    status: 'Submitted',
    fileName: 'synthetic.pdf',
    reportTitle: 'Activity proof',
    submittedDate: '2026-01-01',
    submitter: 'Synthetic staff',
    previewSummary: 'Submitted proof',
  }
  const reviewerPermissions = [
    'projects.read',
    'activities.read',
    'evidence.read',
    'evidence.review',
  ]
  it('routes the eligible assigned reviewer to the real activity proof workflow instead of dead status controls', async () => {
    access.profile.permissions = reviewerPermissions
    api.getEvidence.mockResolvedValue([proof])
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    const link = await screen.findByRole('link', { name: 'Review proof' })
    expect(link.getAttribute('href')).toBe(
      `/projects/${projectId}/activities/${activityId}?review=${proofId}`,
    )
    for (const name of ['Validate', 'Flag', 'Approve', 'Return for Revision'])
      expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
  })
  it.each(['Project Officer', 'Project Manager'])(
    'preserves %s read-only evidence without dead approval controls',
    async (role) => {
      access.role = role
      access.profile.roles = [role === 'Project Officer' ? 'PROJECT_OFFICER' : 'PROJECT_MANAGER']
      access.profile.permissions = reviewerPermissions
      api.getEvidence.mockResolvedValue([proof])
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('button', { name: 'Preview' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    },
  )
  it.each(['evidence.review', 'activities.read'])(
    'does not advertise a review workflow after current %s revocation',
    async (permission) => {
      access.profile.permissions = reviewerPermissions.filter((value) => value !== permission)
      api.getEvidence.mockResolvedValue([proof])
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('button', { name: 'Preview' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
    },
  )
  it('does not fetch or preview evidence after current evidence.read revocation', async () => {
    access.profile.permissions = reviewerPermissions.filter((value) => value !== 'evidence.read')
    api.getEvidence.mockResolvedValue([proof])
    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
    expect(await screen.findByRole('heading', { name: 'Evidence' })).toBeTruthy()
    expect(api.getEvidence).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
  })
  it.each(['unassigned', 'already-reviewed', 'foreign-record'])(
    'does not advertise review for %s evidence',
    async (condition) => {
      access.profile.permissions = reviewerPermissions
      if (condition === 'unassigned') access.profile.assignedProjectIds = []
      api.getEvidence.mockResolvedValue([
        {
          ...proof,
          ...(condition === 'foreign-record'
            ? { projectId: '72000000-0000-4000-8000-000000000099' }
            : {}),
          ...(condition === 'already-reviewed' ? { status: 'Approved' } : {}),
        },
      ])
      render(<ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />)
      expect(await screen.findByRole('button', { name: 'Preview' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Review proof' })).toBeNull()
    },
  )
})
