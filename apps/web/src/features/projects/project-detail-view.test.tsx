/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectDetail } from '@/types/pathways'

const api = vi.hoisted(() => ({ getProject: vi.fn() }))
const access = vi.hoisted(() => ({
  role: 'System Administrator',
  profile: {
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'projects.detail.read', 'assignments.manage'],
    assignedProjectIds: [] as string[],
  },
}))

vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./project-workspace-header', () => ({ ProjectWorkspaceHeader: () => <nav>Tabs</nav> }))
vi.mock('./project-team-editor-dialog', () => ({
  ProjectTeamEditorDialog: () => <button type="button">Edit team</button>,
}))

import { ProjectDetailView } from './project-detail-view'

const project: ProjectDetail = {
  id: '73500000-0000-4000-8000-000000000004',
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
  kpiAchievement: 0,
  beneficiariesReached: 0,
  budgetUtilization: 0,
  timelineProgress: 0,
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

describe('project team editing authority', () => {
  beforeEach(() => {
    api.getProject.mockReset().mockResolvedValue(project)
  })
  afterEach(cleanup)

  it('hides team editing when the save endpoint permission (projects.update) is missing', async () => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'assignments.manage']
    render(<ProjectDetailView projectId={project.id} />)
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
    render(<ProjectDetailView projectId={project.id} />)
    expect(await screen.findByRole('button', { name: 'Edit team' })).toBeTruthy()
  })
})
