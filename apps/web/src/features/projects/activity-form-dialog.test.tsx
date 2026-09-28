/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

import type { Activity, AssignableProjectOfficer } from '@/types/pathways'

const managerPermissions = vi.hoisted(() => [
  'activities.create',
  'activities.update',
  'activities.complete',
  'budgets.create',
  'budgets.update',
  'budgets.read',
  'indicators.read',
  'indicators.update',
])
const state = vi.hoisted(() => ({
  createActivity: vi.fn(),
  transitionActivity: vi.fn(),
  onSaved: vi.fn(),
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['PROJECT_MANAGER'],
    permissions: [...managerPermissions],
    assignedProjectIds: ['72000000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: state.profile.roles[0] === 'PROJECT_OFFICER' ? 'Project Officer' : 'Project Manager',
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
const officer: AssignableProjectOfficer = {
  userId: '72000000-0000-4000-8000-000000000005',
  displayName: 'Project Officer A',
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
  assignedUserIds: [officer.userId],
  assignedTo: [officer.displayName],
  assignedEmails: ['po@example.test'],
  indicatorIds: [],
  journeyStageIds: [],
  journeyStageId: '',
  targetBeneficiaries: 30,
  beneficiariesReached: 0,
  budgetAllocation: 10000,
  budgetLogged: null,
  progress: 0,

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
    state.profile.roles = ['PROJECT_MANAGER']
    state.profile.permissions = [...managerPermissions]
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
        officers={[officer]}
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
    expect(state.createActivity).toHaveBeenCalledWith(
      {
        projectId,
        title: savedActivity.title,
        description: savedActivity.description,
        startDate: savedActivity.startDate,
        dueDate: savedActivity.dueDate,
        timelineOverrideJustification: undefined,
        targetBeneficiaries: 30,
        budgetAllocation: '10000',
        assignedUserIds: [officer.userId],
        indicatorIds: [],
        journeyStageId: null,
      },
      expect.objectContaining({
        principalKey: expect.any(String),
        isCurrent: expect.any(Function),
      }),
    )
    expect(state.createActivity.mock.calls[0][1].isCurrent()).toBe(true)
    expect(state.onSaved).toHaveBeenCalledWith(savedActivity)
  })
})

describe('activity save continuation ownership', () => {
  it.each(['assignment', 'permission'] as const)(
    'does not transition or notify after %s changes during save',
    async (change) => {
      state.profile.assignedProjectIds = [projectId]
      state.profile.permissions = [...managerPermissions]
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
          officers={[officer]}
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
      state.profile.permissions = [...managerPermissions]
    },
  )
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })
})

describe('Project Officer activity creation and locked fields', () => {
  const officerPermissions = ['activities.create', 'activities.complete', 'journeys.read']
  const indicator = {
    id: '72000000-0000-4000-8000-000000000009',
    projectId,
    code: 'IND-1',
    label: 'Reading sessions',
  }
  beforeEach(() => {
    state.createActivity.mockReset().mockResolvedValue(savedActivity)
    state.onSaved.mockReset()
    state.transitionActivity.mockReset()
    state.profile.roles = ['PROJECT_OFFICER']
    state.profile.permissions = [...officerPermissions]
    state.profile.assignedProjectIds = [projectId]
  })
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
    state.profile.roles = ['PROJECT_MANAGER']
    state.profile.permissions = [...managerPermissions]
  })

  const fillRequired = () => {
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
  }

  it('creates with officers from the scoped read and never sends a locked budget or links', async () => {
    render(
      <ActivityFormDialog
        activity={null}
        indicators={[indicator]}
        journeyStages={[]}
        onCreatedOrUpdated={state.onSaved}
        onOpenChange={vi.fn()}
        open
        projectId={projectId}
        officers={[officer]}
      />,
    )
    const budget = screen.getByRole('textbox', { name: 'Activity budget' })
    expect(budget.getAttribute('aria-disabled')).toBe('true')
    expect(
      document.getElementById(budget.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('You are not authorized to change this field')
    // indicators.read is missing too, so the links are omitted, not shown locked.
    expect(screen.queryByText('Connected indicators')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /IND-1/ })).toBeNull()
    // Only userId and displayName reach the dialog; no email is rendered.
    expect(document.body.textContent).not.toContain('@')

    fillRequired()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Project Officer A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Activity' }))
    await waitFor(() => expect(state.createActivity).toHaveBeenCalledOnce())
    const request = state.createActivity.mock.calls[0][0]
    expect(request.assignedUserIds).toEqual([officer.userId])
    expect(request).not.toHaveProperty('budgetAllocation')
    expect(request).not.toHaveProperty('indicatorIds')
  })

  it('shows readable indicator links locked for an editor without indicators.update', () => {
    state.profile.roles = ['PROJECT_MANAGER']
    state.profile.permissions = managerPermissions.filter(
      (permission) => permission !== 'indicators.update' && !permission.startsWith('budgets.'),
    )
    render(
      <ActivityFormDialog
        activity={{ ...savedActivity, indicatorIds: [indicator.id] }}
        indicators={[indicator]}
        journeyStages={[]}
        onCreatedOrUpdated={state.onSaved}
        onOpenChange={vi.fn()}
        open
        projectId={projectId}
        officers={[officer]}
      />,
    )
    const links = screen.getByRole('textbox', {
      name: 'Connected indicators',
    }) as HTMLTextAreaElement
    expect(links.value).toBe('IND-1 - Reading sessions')
    expect(links.readOnly).toBe(true)
    // Without budgets.read an existing allocation is not readable, so it is omitted.
    expect(screen.queryByRole('textbox', { name: 'Activity budget' })).toBeNull()
    expect(screen.queryByLabelText('Activity budget')).toBeNull()
  })

  it('keeps an unreadable logged budget empty, never a fabricated 0', () => {
    state.profile.roles = ['PROJECT_MANAGER']
    state.profile.permissions = [...managerPermissions]
    render(
      <ActivityFormDialog
        activity={{ ...savedActivity, budgetLogged: null }}
        indicators={[]}
        journeyStages={[]}
        onCreatedOrUpdated={state.onSaved}
        onOpenChange={vi.fn()}
        open
        projectId={projectId}
        officers={[officer]}
      />,
    )
    const logged = screen.getByLabelText('Logged budget') as HTMLInputElement
    expect(logged.value).toBe('')
    expect(logged.placeholder).toBe('Unavailable')
  })

  it('locks the budget on edit for a creator without budgets.update', () => {
    state.profile.roles = ['PROJECT_MANAGER']
    state.profile.permissions = managerPermissions.filter(
      (permission) => permission !== 'budgets.update',
    )
    render(
      <ActivityFormDialog
        activity={savedActivity}
        indicators={[]}
        journeyStages={[]}
        onCreatedOrUpdated={state.onSaved}
        onOpenChange={vi.fn()}
        open
        projectId={projectId}
        officers={[officer]}
      />,
    )
    const budget = screen.getByRole('textbox', { name: 'Activity budget' }) as HTMLInputElement
    expect(budget.value).toBe('₱10,000.00')
    expect(budget.getAttribute('aria-disabled')).toBe('true')
  })
})
