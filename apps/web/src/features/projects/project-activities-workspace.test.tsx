/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

const projectId = '4baf1a98-7285-4671-a897-64787e31fe93'
const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getIndicators: vi.fn(),
  getJourneyStages: vi.fn(),
  getProject: vi.fn(),
  getUsers: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Project Officer',
  assignedProjectIds: ['4baf1a98-7285-4671-a897-64787e31fe93'],
  profile: {
    roles: ['PROJECT_OFFICER'],
    permissions: ['projects.read', 'activities.read', 'activities.proof.submit', 'journeys.read'],
    assignedProjectIds: ['4baf1a98-7285-4671-a897-64787e31fe93'],
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { projectActivities: 'Activities' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./project-workspace-header', () => ({ ProjectWorkspaceHeader: () => null }))
vi.mock('./activity-detail-panel', () => ({ ActivityDetailPanel: () => null }))
vi.mock('./activity-form-dialog', () => ({ ActivityFormDialog: () => null }))
vi.mock('./activity-proof-dialog', () => ({ ActivityProofDialog: () => null }))

describe('project activities permission-aware loading', () => {
  beforeEach(() => {
    access.role = 'Project Officer'
    access.assignedProjectIds = [projectId]
    access.profile.roles = ['PROJECT_OFFICER']
    access.profile.permissions = [
      'projects.read',
      'activities.read',
      'activities.proof.submit',
      'journeys.read',
    ]
    access.profile.assignedProjectIds = [projectId]
    api.getProject.mockResolvedValue({ id: projectId, title: 'Assigned project' })
    api.getActivities.mockResolvedValue([])
    api.getIndicators.mockResolvedValue([])
    api.getJourneyStages.mockResolvedValue([])
    api.getUsers.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads only authorized activity and journey dependencies for a Project Officer', async () => {
    render(<ProjectActivitiesWorkspace projectId={projectId} />)

    expect(await screen.findByRole('heading', { name: 'Activities' })).toBeTruthy()
    expect(api.getProject).toHaveBeenCalledWith(projectId)
    expect(api.getActivities).toHaveBeenCalledWith(projectId)
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(api.getJourneyStages).toHaveBeenCalledWith(projectId)
    expect(api.getUsers).not.toHaveBeenCalled()
  })

  it('keeps indicator and user dependencies for principals authorized to read them', async () => {
    access.role = 'Project Manager'
    access.assignedProjectIds = [projectId]
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = [
      'projects.read',
      'activities.read',
      'activities.create',
      'activities.update',
      'journeys.read',
      'indicators.read',
      'users.authorize',
    ]
    access.profile.assignedProjectIds = [projectId]

    render(<ProjectActivitiesWorkspace projectId={projectId} />)

    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledWith(projectId))
    expect(api.getJourneyStages).toHaveBeenCalledWith(projectId)
    expect(api.getUsers).toHaveBeenCalledOnce()
  })
})
