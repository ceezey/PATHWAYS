/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import type { Activity, ActivitySummary } from '@/types/pathways'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'
import { ProjectDetailView } from './project-detail-view'

const projectId = '4baf1a98-7285-4671-a897-64787e31fe93'
const activityId = 'a0908103-0597-4cbb-874f-61ad0d5e3f83'
const indicatorId = 'b0908103-0597-4cbb-874f-61ad0d5e3f84'
const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
  getIndicators: vi.fn(),
  getJourneyStages: vi.fn(),
  getProject: vi.fn(),
  getProjectOverviewMetrics: vi.fn(),
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

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: api,
  PathwaysClientError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message)
    }
  },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { projectActivities: 'Activities' } }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('./project-workspace-header', () => ({ ProjectWorkspaceHeader: () => null }))
vi.mock('./project-team-editor-dialog', () => ({ ProjectTeamEditorDialog: () => null }))
vi.mock('./activity-detail-panel', () => ({
  ActivityDetailPanel: ({
    activity,
    loading,
    open,
    onOpenChange,
  }: {
    activity: Activity | null
    loading: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <section aria-label="Activity panel">
        <p>{activity ? `Detail: ${activity.title}` : loading ? 'Loading detail' : ''}</p>
        <button onClick={() => onOpenChange(false)} type="button">
          Close panel
        </button>
      </section>
    ) : null,
}))
vi.mock('./activity-form-dialog', () => ({ ActivityFormDialog: () => null }))
vi.mock('./activity-proof-dialog', () => ({ ActivityProofDialog: () => null }))

const { PathwaysClientError } = await import('@/lib/services/pathways-client')

const summary: ActivitySummary = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic outreach',
  description: 'Community sessions',
  storedStatus: 'IN_PROGRESS',
  status: 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2026-12-01',
  assignedUserIds: [],
  assignedTo: ['Officer'],
  indicatorIds: [indicatorId],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  progress: 20,
  updatedAt: '2026-09-25T00:00:00.000Z',
}
const detail: Activity = {
  ...summary,
  assignedEmails: [],
  beneficiariesReached: 3,
  budgetAllocation: null,
  budgetLogged: null,
  submittedProof: [],
  updateNotes: [],
}

let client: QueryClient
const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={client}>
    <AuthorizedQueryProvider>{node}</AuthorizedQueryProvider>
  </QueryClientProvider>
)
const renderWorkspace = (initialActivityId?: string) =>
  render(
    wrap(
      <ProjectActivitiesWorkspace initialActivityId={initialActivityId} projectId={projectId} />,
    ),
  )
const asProjectManager = () => {
  access.role = 'Project Manager'
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
}

describe('project activities permission-aware loading', () => {
  beforeEach(() => {
    client = new QueryClient()
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
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Assigned project',
      area: 'Area',
      sector: 'Sector',
      period: '2026',
      status: 'Active',
      projectOfficers: [],
    })
    api.getActivities.mockResolvedValue([summary])
    api.getActivity.mockResolvedValue(detail)
    api.getIndicators.mockResolvedValue([
      { id: indicatorId, code: 'IND-READING', label: 'Reading' },
    ])
    api.getJourneyStages.mockResolvedValue([])
    api.getProjectOverviewMetrics.mockResolvedValue(null)
    api.getUsers.mockResolvedValue([])
    api.getAssignableProjectOfficers.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('loads the lean list and permitted lookups once, without editor dependencies, for a Project Officer', async () => {
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: 'Activities' })).toBeTruthy()
    expect(api.getProject).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    expect(api.getActivities).toHaveBeenCalledWith(projectId, expect.any(AbortSignal))
    await waitFor(() => expect(api.getJourneyStages).toHaveBeenCalledOnce())
    expect(api.getIndicators).not.toHaveBeenCalled()
    expect(api.getActivity).not.toHaveBeenCalled()
    expect(api.getUsers).not.toHaveBeenCalled()
  })

  it('loads assignable officers only after opening the activity editor, never GET /users', async () => {
    asProjectManager()
    renderWorkspace()

    await screen.findByRole('heading', { name: 'Activities' })
    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledOnce())
    expect(api.getJourneyStages).toHaveBeenCalledOnce()
    expect(api.getAssignableProjectOfficers).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'New Activity' }))

    await waitFor(() => expect(api.getAssignableProjectOfficers).toHaveBeenCalledOnce())
    expect(api.getAssignableProjectOfficers).toHaveBeenCalledWith(
      projectId,
      expect.any(AbortSignal),
    )
    expect(api.getUsers).not.toHaveBeenCalled()
    expect(api.getIndicators).toHaveBeenCalledOnce()
    expect(api.getJourneyStages).toHaveBeenCalledOnce()
  })

  it('lets a Project Officer open New Activity with the scoped officer read', async () => {
    access.profile.permissions = [...access.profile.permissions, 'activities.create']
    renderWorkspace()
    await screen.findByRole('heading', { name: 'Activities' })
    fireEvent.click(screen.getByRole('button', { name: 'New Activity' }))
    await waitFor(() => expect(api.getAssignableProjectOfficers).toHaveBeenCalledOnce())
    expect(api.getUsers).not.toHaveBeenCalled()
  })

  it('searches by indicator code without opening a panel', async () => {
    asProjectManager()
    renderWorkspace()
    await screen.findByRole('heading', { name: 'Activities' })
    await waitFor(() => expect(api.getIndicators).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByRole('textbox', { name: 'Search activities' }), {
      target: { value: 'ind-reading' },
    })
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Activity: Synthetic outreach' })).toBeTruthy(),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Search activities' }), {
      target: { value: 'ind-other' },
    })
    expect(await screen.findByText('No activities match the current view')).toBeTruthy()
    expect(api.getActivity).not.toHaveBeenCalled()
  })

  it('opens detail by id and keeps lookups loaded across panel opens', async () => {
    asProjectManager()
    renderWorkspace()
    await screen.findByRole('heading', { name: 'Activities' })
    for (let open = 0; open < 2; open += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'View details' }))
      expect(await screen.findByText('Detail: Synthetic outreach')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    }
    expect(api.getActivity).toHaveBeenCalledTimes(2)
    expect(api.getActivity).toHaveBeenCalledWith(projectId, activityId, expect.any(AbortSignal))
    expect(api.getIndicators).toHaveBeenCalledOnce()
    expect(api.getJourneyStages).toHaveBeenCalledOnce()
    expect(api.getActivities).toHaveBeenCalledOnce()
  })

  it('loads the detail route through GET /activities/:id', async () => {
    renderWorkspace(activityId)
    expect(await screen.findByText('Detail: Synthetic outreach')).toBeTruthy()
    expect(api.getActivity).toHaveBeenCalledWith(projectId, activityId, expect.any(AbortSignal))
  })

  it('shows a not-found state for an unknown or out-of-scope activity id', async () => {
    api.getActivity.mockRejectedValue(new PathwaysClientError('Activity unavailable.', 'not_found'))
    renderWorkspace('c0908103-0597-4cbb-874f-61ad0d5e3f85')
    expect(await screen.findByText('Activity not found')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Activity panel' })).toBeNull()
    // The list stays usable; the route is not silently redirected.
    expect(screen.getByRole('article', { name: 'Activity: Synthetic outreach' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to all activities' }))
    await waitFor(() => expect(screen.queryByText('Activity not found')).toBeNull())
  })

  it('keeps the list usable after a forbidden (403) detail read, with at most one re-verification', async () => {
    api.getActivity.mockRejectedValue(new PathwaysClientError('Forbidden', 'forbidden'))
    renderWorkspace(activityId)
    expect(await screen.findByText('Activity not found')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Activity: Synthetic outreach' })).toBeTruthy(),
    )
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)))
    expect(screen.queryByText('Project not found')).toBeNull()
    expect(screen.getByText('Activity not found')).toBeTruthy()
    expect(api.getProject.mock.calls.length).toBeLessThanOrEqual(2)
    expect(api.getActivities.mock.calls.length).toBeLessThanOrEqual(2)
    expect(api.getActivity).toHaveBeenCalledOnce()
  })

  it('keeps error wording when the activity read fails for another reason', async () => {
    api.getActivity.mockRejectedValue(new PathwaysClientError('Down', 'network'))
    renderWorkspace(activityId)
    expect(await screen.findByText('Activity unavailable')).toBeTruthy()
  })

  it('reuses the Overview project read on the Activities tab (no duplicate project fetch)', async () => {
    asProjectManager()
    const view = render(wrap(<ProjectDetailView projectId={projectId} />))
    await screen.findByText('Project overview')
    expect(api.getProject).toHaveBeenCalledOnce()
    view.rerender(wrap(<ProjectActivitiesWorkspace projectId={projectId} />))
    await screen.findByRole('heading', { name: 'Activities' })
    await act(async () => {})
    expect(api.getProject).toHaveBeenCalledOnce()
    expect(api.getActivities).toHaveBeenCalledOnce()
    view.rerender(wrap(<ProjectDetailView projectId={projectId} />))
    await screen.findByText('Project overview')
    await act(async () => {})
    // Returning within the summary window reuses project and metrics.
    expect(api.getProject).toHaveBeenCalledOnce()
    expect(api.getProjectOverviewMetrics).toHaveBeenCalledOnce()
  })
})
