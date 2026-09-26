/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

import type { Activity, UserRecord } from '@/types/pathways'

const state = vi.hoisted(() => ({
  createActivity: vi.fn(),
  transitionActivity: vi.fn(),
  onSaved: vi.fn(),
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['PROJECT_MANAGER'],
    permissions: ['activities.create', 'activities.update', 'activities.complete'],
    assignedProjectIds: ['72000000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: 'Project Manager',
    profile: state.profile,
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    createActivity: state.createActivity,
    updateActivity: vi.fn(),
    transitionActivity: state.transitionActivity,
  },
}))

import { ActivityFormDialog } from './activity-form-dialog'

const projectId = '72000000-0000-4000-8000-000000000004'
const officer: UserRecord = {
  id: '72000000-0000-4000-8000-000000000005',
  name: 'Project Officer A',
  email: 'po@example.test',
  role: 'Project Officer',
  accountStatus: 'Active',
  projectIds: [projectId],
  projectAccess: ['Project'],
  signInMethod: 'Supabase account',
  createdAt: '2026-09-01T00:00:00.000Z',
}
const savedActivity = {
  id: '72000000-0000-4000-8000-000000000006',
  projectId,
  title: 'Community workshop',
  description: 'Deliver a scoped community workshop.',
  storedStatus: 'NOT_STARTED',
  status: 'Planned',
  startDate: '2026-10-01',
  dueDate: '2026-10-02',
  assignedUserIds: [officer.id],
  assignedTo: [officer.name],
  assignedEmails: [officer.email],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 30,
  beneficiariesReached: 0,
  budgetAllocation: 10000,
  budgetLogged: null,
  progress: 0,
  projectGoalComparison: { state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' },
  submittedProof: [],
  updateNotes: [],
  updatedAt: '2026-09-25T00:00:00.000Z',
} satisfies Activity

describe('ActivityFormDialog activation', () => {
  beforeEach(() => {
    state.createActivity.mockReset().mockResolvedValue(savedActivity)
    state.onSaved.mockReset()
    state.transitionActivity
      .mockReset()
      .mockResolvedValue({ ...savedActivity, status: 'In Progress' })
    state.profile.assignedProjectIds = [projectId]
    state.profile.permissions = ['activities.create', 'activities.update', 'activities.complete']
  })

  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('submits enabled targets, budget, officer, and optional empty links to the API', async () => {
    render(
      <ActivityFormDialog
        activity={null}
        indicators={[]}
        journeyStages={[]}
        onCreatedOrUpdated={state.onSaved}
        onOpenChange={vi.fn()}
        open
        projectId={projectId}
        users={[officer]}
      />,
    )

    expect((screen.getByLabelText('Target beneficiaries') as HTMLInputElement).disabled).toBe(false)
    expect((screen.getByLabelText('Activity budget') as HTMLInputElement).disabled).toBe(false)
    expect(screen.getByText('No indicators are configured for this project.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Activity title/), {
      target: { value: savedActivity.title },
    })
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: savedActivity.description },
    })
    fireEvent.change(screen.getByLabelText(/Start date/), {
      target: { value: savedActivity.startDate },
    })
    fireEvent.change(screen.getByLabelText(/Due date/), {
      target: { value: savedActivity.dueDate },
    })
    fireEvent.change(screen.getByLabelText('Target beneficiaries'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Activity budget'), { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Project Officer A/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }))

    await waitFor(() => expect(state.createActivity).toHaveBeenCalledOnce())
    expect(state.createActivity).toHaveBeenCalledWith({
      projectId,
      title: savedActivity.title,
      description: savedActivity.description,
      startDate: savedActivity.startDate,
      dueDate: savedActivity.dueDate,
      timelineOverrideJustification: undefined,
      targetBeneficiaries: 30,
      budgetAllocation: '10000',
      assignedUserIds: [officer.id],
      indicatorIds: [],
      journeyStageId: null,
    })
    expect(state.onSaved).toHaveBeenCalledWith(savedActivity)
  })
})

describe('activity save continuation ownership', () => {
  it.each(['assignment', 'permission'] as const)(
    'does not transition or notify after %s changes during save',
    async (change) => {
      state.profile.assignedProjectIds = [projectId]
      state.profile.permissions = ['activities.create', 'activities.update', 'activities.complete']
      state.onSaved.mockReset()
      state.transitionActivity.mockReset()
      let finish!: (value: Activity) => void
      state.createActivity.mockReset().mockImplementation(
        () =>
          new Promise<Activity>((resolve) => {
            finish = resolve
          }),
      )
      const element = () => (
        <ActivityFormDialog
          activity={null}
          indicators={[]}
          journeyStages={[]}
          onCreatedOrUpdated={state.onSaved}
          onOpenChange={vi.fn()}
          open
          projectId={projectId}
          users={[officer]}
        />
      )
      window.sessionStorage.setItem(
        sensitiveDraftKey('activity', {
          organizationId: 'org-a',
          userId: 'actor-a',
          projectId,
          resourceId: null,
        }),
        JSON.stringify({ projectId, status: 'In Progress' }),
      )
      const view = render(element())
      expect(screen.getByRole('combobox', { name: /Activity status/ }).textContent).toContain(
        'In Progress',
      )
      fireEvent.change(screen.getByLabelText(/Activity title/), {
        target: { value: savedActivity.title },
      })
      fireEvent.change(screen.getByLabelText(/Description/), {
        target: { value: savedActivity.description },
      })
      fireEvent.change(screen.getByLabelText(/Start date/), {
        target: { value: savedActivity.startDate },
      })
      fireEvent.change(screen.getByLabelText(/Due date/), {
        target: { value: savedActivity.dueDate },
      })
      fireEvent.change(screen.getByLabelText('Target beneficiaries'), { target: { value: '30' } })
      fireEvent.change(screen.getByLabelText('Activity budget'), { target: { value: '10000' } })
      fireEvent.click(screen.getByRole('checkbox', { name: /Project Officer A/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }))

      await waitFor(() => expect(state.createActivity).toHaveBeenCalledOnce())
      if (change === 'assignment') state.profile.assignedProjectIds = []
      else state.profile.permissions = []
      view.rerender(element())
      await act(async () => finish(savedActivity))
      expect(state.transitionActivity).not.toHaveBeenCalled()
      expect(state.onSaved).not.toHaveBeenCalled()
      state.profile.assignedProjectIds = [projectId]
      state.profile.permissions = ['activities.create', 'activities.update', 'activities.complete']
    },
  )
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })
})
