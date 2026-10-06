/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import type { Activity, ActivityCapabilities } from '@/types/pathways'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { getVerifiedRouteAccess } from '@/lib/rbac/route-access'
import {
  type AtomicPermission,
  type CanonicalRole,
  hasAtomicPermission,
  roleNames,
  rolePermissions,
} from '../../../../api/src/modules/auth/authorization-policy'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

const projectId = '4baf1a98-7285-4671-a897-64787e31fe93'
const activityId = 'a0908103-0597-4cbb-874f-61ad0d5e3f83'
const api = vi.hoisted(() => ({
  getActivities: vi.fn(),
  getActivity: vi.fn(),
  getAssignableProjectOfficers: vi.fn(),
  getIndicators: vi.fn(),
  getJourneyStages: vi.fn(),
  getProject: vi.fn(),
  getUsers: vi.fn(),
}))
const access = vi.hoisted(() => ({
  role: 'Project Officer' as string,
  access: 'ready',
  assignedProjectIds: [] as string[],
  profile: {
    id: 'synthetic-subject',
    userId: 'synthetic-user',
    organizationId: 'synthetic-org',
    roles: [] as string[],
    permissions: [] as string[],
    assignedProjectIds: [] as string[],
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
vi.mock('./activity-form-dialog', () => ({ ActivityFormDialog: () => null }))
vi.mock('./activity-proof-dialog', () => ({ ActivityProofDialog: () => null }))
vi.mock('./activity-progress-dialog', () => ({ ActivityProgressDialog: () => null }))
vi.mock('./activity-expense-dialog', () => ({ ActivityExpenseDialog: () => null }))
vi.mock('./activity-expense-review-dialog', () => ({ ActivityExpenseReviewDialog: () => null }))
vi.mock('./activity-proof-files', () => ({ ActivityProofFiles: () => null }))
vi.mock('./activity-proof-review-dialog', () => ({ ActivityProofReviewDialog: () => null }))

const has = (role: CanonicalRole, permission: AtomicPermission) =>
  hasAtomicPermission(role, rolePermissions[role], permission)

// The flags exactly as activities.service computes them (activityCapabilities). The API-side
// suite (activity-capabilities.test.ts) proves each flag equals the real endpoint outcome.
const serverFlags = (
  role: CanonicalRole,
  status: Activity['storedStatus'],
  assigned: boolean,
): ActivityCapabilities => ({
  canEdit: has(role, 'activities.update') && !['COMPLETED', 'CANCELLED'].includes(status),
  canRecordProgress: has(role, 'activities.progress.update') && assigned,
  canSubmitProof: has(role, 'activities.proof.submit') && assigned,
  canExplainOverdue: has(role, 'monitoring.review'),
})

const detailFor = (
  status: Activity['storedStatus'],
  capabilities: ActivityCapabilities,
): Activity => ({
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic outreach',
  description: 'Community sessions',
  storedStatus: status,
  status: status === 'COMPLETED' ? 'Completed' : 'In Progress',
  overdue: false,
  startDate: '2026-01-01',
  dueDate: '2099-12-01',
  assignedUserIds: [],
  assignedTo: ['Officer'],
  assignedEmails: [],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 10,
  beneficiariesReached: 0,
  budgetAllocation: null,
  budgetLogged: null,
  progress: 20,
  submittedProof: [],
  updateNotes: [],
  overdueExplanations: [],
  overdueExplanationNeeded: false,
  updatedAt: '2026-09-25T00:00:00.000Z',
  capabilities,
})

const asRole = (role: CanonicalRole) => {
  access.role = roleNames[role]
  access.assignedProjectIds = [projectId]
  access.profile.roles = [role]
  access.profile.permissions = [...rolePermissions[role]]
  access.profile.assignedProjectIds = [projectId]
}

const renderDetail = async (detail: Activity) => {
  api.getActivity.mockResolvedValue(detail)
  api.getActivities.mockResolvedValue([])
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AuthorizedQueryProvider>
        <ProjectActivitiesWorkspace initialActivityId={activityId} projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
  // The open detail sheet is modal, so the page behind it is aria-hidden.
  await screen.findByText('Community sessions')
}

// Queried by text: the modal sheet aria-hides the page, which blanks accessible names there.
const visible = (name: string) => screen.queryByText(name, { selector: 'button' }) !== null

describe('activity actions match the API for every role', () => {
  beforeEach(() => {
    api.getProject.mockResolvedValue({
      id: projectId,
      title: 'Assigned project',
      area: 'Area',
      sector: 'Sector',
      period: '2026',
      status: 'Active',
      projectOfficers: [],
    })
    api.getIndicators.mockResolvedValue([])
    api.getJourneyStages.mockResolvedValue([])
    api.getUsers.mockResolvedValue([])
    api.getAssignableProjectOfficers.mockResolvedValue([])
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const roles = Object.keys(rolePermissions) as CanonicalRole[]
  const cases = roles.flatMap((role) =>
    [true, false].flatMap((assigned) =>
      (['IN_PROGRESS', 'COMPLETED'] as const).map((status) => ({ role, assigned, status })),
    ),
  )

  it.each(cases)('$role, assigned=$assigned, $status', async ({ role, assigned, status }) => {
    asRole(role)
    if (!has(role, 'activities.read')) {
      // Program and Grant Managers never reach the Activities route, and hold none of the
      // activity write authorities the API would require.
      expect(
        getVerifiedRouteAccess(access.profile, `/projects/${projectId}/activities`).allowed,
      ).toBe(false)
      for (const permission of [
        'activities.create',
        'activities.update',
        'activities.progress.update',
        'activities.proof.submit',
      ] as const)
        expect(has(role, permission)).toBe(false)
      return
    }
    await renderDetail(detailFor(status, serverFlags(role, status, assigned)))

    // New Activity: POST /activities requires activities.create in project scope.
    expect(visible('New Activity')).toBe(has(role, 'activities.create'))
    // Edit: PATCH requires activities.update and a non-terminal activity.
    expect(visible('Edit activity')).toBe(has(role, 'activities.update') && status !== 'COMPLETED')
    // Submit proof: activities.proof.submit plus an active personal assignment.
    expect(visible('Submit Update & Proof')).toBe(
      has(role, 'activities.proof.submit') && assigned && status !== 'COMPLETED',
    )
    // Record progress: activities.progress.update plus a personal assignment, in progress only.
    expect(visible('Record progress')).toBe(
      has(role, 'activities.progress.update') && assigned && status === 'IN_PROGRESS',
    )
  })

  it('never shows a Project Officer Edit or New Activity, whatever the flags say', async () => {
    asRole('PROJECT_OFFICER')
    await renderDetail(
      detailFor('IN_PROGRESS', {
        canEdit: true,
        canRecordProgress: true,
        canSubmitProof: true,
        canExplainOverdue: true,
      }),
    )
    expect(visible('Edit activity')).toBe(false)
    expect(visible('New Activity')).toBe(false)
    expect(visible('Submit Update & Proof')).toBe(true)
  })

  it('shows nothing to an administrator even with forged all-true flags', async () => {
    asRole('SYSTEM_ADMINISTRATOR')
    await renderDetail(
      detailFor('IN_PROGRESS', {
        canEdit: true,
        canRecordProgress: true,
        canSubmitProof: true,
        canExplainOverdue: true,
      }),
    )
    for (const name of [
      'New Activity',
      'Edit activity',
      'Submit Update & Proof',
      'Record progress',
    ])
      expect(visible(name)).toBe(false)
  })

  it('hides assignment-bound actions from an unassigned Project Manager (flags absent)', async () => {
    asRole('PROJECT_MANAGER')
    const detail = detailFor('IN_PROGRESS', serverFlags('PROJECT_MANAGER', 'IN_PROGRESS', false))
    await renderDetail({ ...detail, capabilities: undefined })
    for (const name of ['Edit activity', 'Submit Update & Proof', 'Record progress'])
      expect(visible(name)).toBe(false)
    expect(visible('New Activity')).toBe(true)
  })
})
