/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import type { ProjectDetail } from '@/types/pathways'
import type { MetricCell, ProjectOverviewMetrics } from '@pathways/shared'

const projectId = '73500000-0000-4000-8000-000000000004'
const api = vi.hoisted(() => ({ getProject: vi.fn(), getProjectOverviewMetrics: vi.fn() }))
const access = vi.hoisted(() => ({
  access: 'ready',
  role: 'System Administrator',
  assignedProjectIds: ['73500000-0000-4000-8000-000000000004'],
  profile: {
    id: 'synthetic-subject',
    userId: 'synthetic-user',
    organizationId: 'synthetic-org',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'projects.detail.read', 'assignments.manage'],
    assignedProjectIds: ['73500000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <>
      <h1>{title}</h1>
      {actions}
    </>
  ),
}))
vi.mock('./project-workspace-header', () => ({ ProjectWorkspaceHeader: () => <nav>Tabs</nav> }))
vi.mock('./project-team-editor-dialog', () => ({
  ProjectTeamEditorDialog: () => <button type="button">Edit team</button>,
}))

import { PathwaysClientError } from '@/lib/services/pathways-client'
import { ProjectDetailView } from './project-detail-view'

const project: ProjectDetail = {
  id: projectId,
  code: 'SSG-ES-2026',
  title: 'Safe Schools for Girls',
  description: 'Synthetic project description.',
  objectives: 'Synthetic objectives.',
  area: 'Borongan City',
  sector: 'Education',
  status: 'Active',
  storedStatus: 'ONGOING',
  health: 'On Track',
  period: '2026-03-01 - 2027-08-31',
  projectManager: 'Ana Dela Cruz',
  programManager: 'Maria Santos',
  monitoringOfficer: 'Carlo Mendoza',
  projectOfficers: ['Liza Bautista'],
  targetBeneficiaries: 1200,
  budgetCode: 'Not recorded',
  startDate: '2026-03-01',
  endDate: '2027-08-31',
  updatedAt: '2026-09-28T00:00:00.000Z',
  programId: null,
}

const available = (value: string): MetricCell => ({ state: 'AVAILABLE', value, reason: null })
const missing = (reason: string): MetricCell => ({ state: 'MISSING', value: null, reason })
const metrics = (overrides: Partial<ProjectOverviewMetrics> = {}): ProjectOverviewMetrics => ({
  contractVersion: 'project.overview-metrics.v1',
  projectId,
  businessDate: '2026-09-28',
  generatedAt: '2026-09-28T00:00:00.000Z',
  kpiAchievement: { metric: available('60.3'), indicatorCount: 2, reportedCount: 2 },
  budgetUtilization: null,
  beneficiariesReached: {
    metric: { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' },
    target: 1200,
  },
  timeline: { metric: available('50'), startDate: '2026-03-01', endDate: '2027-08-31' },
  ...overrides,
})

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <ProjectDetailView projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

const tile = async (label: string) =>
  (await screen.findByText(label)).parentElement?.querySelector('dd')?.textContent

describe('project team editing authority', () => {
  beforeEach(() => {
    api.getProject.mockReset().mockResolvedValue(project)
    api.getProjectOverviewMetrics.mockReset().mockResolvedValue(metrics())
  })
  afterEach(cleanup)

  it('hides team editing when the save endpoint permission (projects.update) is missing', async () => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'assignments.manage']
    renderView()
    expect(await screen.findByText('Project team')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit team' })).toBeNull()
  })

  it('shows team editing when both assignment and project update authority are present', async () => {
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = [
      'projects.read',
      'projects.detail.read',
      'projects.update',
      'assignments.manage',
    ]
    renderView()
    expect(await screen.findByRole('button', { name: 'Edit team' })).toBeTruthy()
  })

  it('hides, rather than disables, profile editing without projects.update', async () => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'assignments.manage']
    renderView()
    expect(await screen.findByText('Project team')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Edit project profile' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit project profile' })).toBeNull()
  })

  it('shows profile editing to a projects.update holder', async () => {
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'projects.update']
    renderView()
    const link = await screen.findByRole('link', { name: 'Edit project profile' })
    expect(link.getAttribute('href')).toBe(`/projects/${projectId}/edit`)
  })

  it('shows structured partners only, never the deprecated free text', async () => {
    api.getProject.mockResolvedValue({
      ...project,
      implementingPartners: 'Legacy text partner',
      implementingPartnerRecords: [{ id: 'p1', name: 'Structured Partner' }],
    })
    renderView()
    expect(await screen.findByText('Structured Partner')).toBeTruthy()
    expect(screen.queryByText(/Legacy text partner/)).toBeNull()
    cleanup()
    api.getProject.mockResolvedValue({ ...project, implementingPartners: 'Legacy text partner' })
    renderView()
    const partners = (await screen.findByText('Implementing partners')).parentElement
    expect(partners?.querySelector('dd')?.textContent).toBe('Not recorded')
  })

  it('omits the project archive control because no archive endpoint exists', async () => {
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'projects.update']
    renderView()
    expect(await screen.findByText('Project team')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Archive project' })).toBeNull()
  })
})

describe('project overview metrics', () => {
  beforeEach(() => {
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = ['projects.read', 'projects.detail.read']
    api.getProject.mockReset().mockResolvedValue(project)
    api.getProjectOverviewMetrics.mockReset().mockResolvedValue(metrics())
  })
  afterEach(cleanup)

  it('reads the project through the shared authorized query instead of an effect', async () => {
    renderView()
    expect(await screen.findByText('Project overview')).toBeTruthy()
    expect(api.getProject).toHaveBeenCalledOnce()
    expect(api.getProject).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    expect(api.getProjectOverviewMetrics).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
  })

  it('shows endpoint values, suppression and a permission-null section without zeros', async () => {
    renderView()
    await waitFor(async () => expect(await tile('KPI achievement')).toBe('60.3%'))
    expect(await tile('Budget utilization')).toBe('Unavailable')
    expect(await tile('Beneficiaries reached / target')).toBe('Suppressed (fewer than 5) / 1,200')
    expect(await tile('Timeline')).toBe('50%')
  })

  it('says "None yet" for sources without data and never shows them as 0', async () => {
    api.getProjectOverviewMetrics.mockResolvedValue(
      metrics({
        kpiAchievement: { metric: missing('NO_MEASUREMENT'), indicatorCount: 1, reportedCount: 0 },
        budgetUtilization: { metric: missing('NO_PLANNED_BUDGET') },
        beneficiariesReached: { metric: missing('RELEASED_AFTER_PROJECT_CLOSE'), target: null },
        timeline: { metric: missing('PROJECT_DATES_REQUIRED'), startDate: null, endDate: null },
      }),
    )
    renderView()
    await waitFor(async () => expect(await tile('KPI achievement')).toBe('None yet'))
    expect(await tile('Budget utilization')).toBe('Budget not recorded')
    expect(await tile('Beneficiaries reached / target')).toBe('After project close / 1,200')
    expect(await tile('Timeline')).toBe('Dates not recorded')
    for (const value of screen.getAllByRole('definition').map((node) => node.textContent))
      expect(value).not.toMatch(/^0%?( \/|$)/)
  })

  it('says "None yet" for a planned budget with no approved expenses, never a fabricated 0%', async () => {
    api.getProjectOverviewMetrics.mockResolvedValue(
      metrics({ budgetUtilization: { metric: missing('NO_APPROVED_EXPENSES') } }),
    )
    renderView()
    await waitFor(async () => expect(await tile('Budget utilization')).toBe('None yet'))
  })

  it('keeps error wording and a retry when the metrics read fails', async () => {
    api.getProjectOverviewMetrics.mockRejectedValue(new PathwaysClientError('Down', 'network'))
    renderView()
    expect(await screen.findByText('Project metrics could not be loaded.')).toBeTruthy()
    expect(await tile('KPI achievement')).toBe('Unavailable')
    api.getProjectOverviewMetrics.mockResolvedValue(metrics())
    fireEvent.click(screen.getByRole('button', { name: 'Retry metrics' }))
    await waitFor(async () => expect(await tile('KPI achievement')).toBe('60.3%'))
  })

  it('keeps error wording when the project itself cannot be loaded', async () => {
    api.getProject.mockRejectedValue(new PathwaysClientError('Down', 'network'))
    renderView()
    expect(await screen.findByText('Project unavailable')).toBeTruthy()
    expect(screen.getByText('Project data unavailable')).toBeTruthy()
  })

  it('shows a not-found state for a project outside scope', async () => {
    api.getProject.mockRejectedValue(new PathwaysClientError('Missing', 'not_found'))
    renderView()
    expect(await screen.findByText('Project not found')).toBeTruthy()
  })
})
