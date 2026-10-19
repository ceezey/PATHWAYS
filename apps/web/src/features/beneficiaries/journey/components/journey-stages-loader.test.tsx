/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'

import { JourneyStagesLoader } from './journey-stages-loader'

const projectId = '72000000-0000-4000-8000-000000000004'
const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  getActivities: vi.fn(),
  getActivityContext: vi.fn(),
  getJourneyStages: vi.fn(),
}))
const access = vi.hoisted(() => ({
  access: 'ready',
  assignedProjectIds: [] as string[],
  role: 'System Administrator',
  profile: {
    id: 'synthetic-subject',
    organizationId: '10000000-0000-4000-8000-000000000001',
    userId: '60000000-0000-4000-8000-000000000006',
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'projects.detail.read', 'journeys.manage'],
    assignedProjectIds: [] as string[],
  },
}))

vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: api }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('./journey-config-workspace', () => ({
  JourneyConfigWorkspace: ({
    activitiesFailed,
    initialStages,
  }: { activitiesFailed?: boolean; initialStages: unknown[] }) => (
    <div>
      Stages {initialStages.length}
      {activitiesFailed ? ' activities failed' : ''}
    </div>
  ),
}))

const renderLoader = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <JourneyStagesLoader projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )

describe('JourneyStagesLoader', () => {
  beforeEach(() => {
    api.getProject.mockResolvedValue({ id: projectId, title: 'Project Alpha' })
    api.getJourneyStages.mockResolvedValue([{ id: 's1' }])
    api.getActivities.mockResolvedValue([])
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads stages for an actor holding journeys.manage only', async () => {
    renderLoader()
    expect(await screen.findByText('Stages 1')).toBeTruthy()
    expect(api.getJourneyStages).toHaveBeenCalledOnce()
  })

  it('reads stages live on every mount', async () => {
    const first = renderLoader()
    await screen.findByText('Stages 1')
    first.unmount()
    renderLoader()
    await screen.findByText('Stages 1')
    expect(api.getJourneyStages).toHaveBeenCalledTimes(2)
  })

  it('shows unavailable, not endless loading, when the actor holds neither journey permission', async () => {
    access.profile.permissions = ['projects.read', 'projects.detail.read']
    renderLoader()
    expect(await screen.findByText('Journey stages unavailable')).toBeTruthy()
    access.profile.permissions = ['projects.read', 'projects.detail.read', 'journeys.manage']
  })

  it('flags a failed activity read instead of passing an empty list', async () => {
    access.profile.permissions = [
      'projects.read',
      'projects.detail.read',
      'journeys.manage',
      'activities.read',
    ]
    access.role = 'Project Manager'
    access.profile.roles = ['PROJECT_MANAGER']
    access.profile.assignedProjectIds = [projectId]
    access.assignedProjectIds = [projectId]
    api.getActivities.mockRejectedValue(new Error('down'))
    api.getActivityContext.mockRejectedValue(new Error('down'))
    renderLoader()
    expect(await screen.findByText(/activities failed/)).toBeTruthy()
  })
})
