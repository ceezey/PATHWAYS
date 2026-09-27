/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
  access: 'ready',
  assignedProjectIds: ['4baf1a98-7285-4671-a897-64787e31fe93'],
  profile: {
    id: 'synthetic-subject',
    userId: 'synthetic-user',
    organizationId: 'synthetic-org',
    roles: ['PROJECT_OFFICER'],
    permissions: [
      'projects.read',
      'projects.detail.read',
      'activities.read',
      'activities.proof.submit',
      'journeys.read',
    ],
    assignedProjectIds: ['4baf1a98-7285-4671-a897-64787e31fe93'],
  },
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: api,
  PathwaysClientError: class extends Error {},
}))
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

const renderWorkspace = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <ProjectActivitiesWorkspace projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

describe('project activities permission-aware loading', () => {
  beforeEach(() => {
    access.role = 'Project Officer'
    access.assignedProjectIds = [projectId]
    access.profile.roles = ['PROJECT_OFFICER']
    access.profile.permissions = [
      'projects.read',
      'projects.detail.read',
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

  it('loads required activity data without fetching editor dependencies for a Project Officer', async () => {
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: 'Activities' })).toBeTruthy()
    expect(api.getProject).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    expect(api.getActivities).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(api.getJourneyStages).not.toHaveBeenCalled()
    expect(api.getUsers).not.toHaveBeenCalled()
  })

  it('loads authorized editor dependencies only after opening the activity editor', async () => {
    access.role = 'Project Manager'
    access.assignedProjectIds = [projectId]
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.permissions = [
      'projects.read',
      'projects.detail.read',
      'activities.read',
      'activities.create',
      'activities.update',
      'journeys.read',
      'indicators.read',
      'users.authorize',
    ]
    access.profile.assignedProjectIds = [projectId]

    renderWorkspace()

    await screen.findByRole('heading', { name: 'Activities' })
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(api.getJourneyStages).not.toHaveBeenCalled()
    expect(api.getUsers).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'New Activity' }))

    await waitFor(() =>
      expect(api.getIndicators).toHaveBeenCalledWith(projectId, expect.any(AbortSignal)),
    )
    expect(api.getJourneyStages).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    expect(api.getUsers).toHaveBeenCalledOnce()
  })
})
