/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity, UserRecord } from '@/types/pathways'

const state = vi.hoisted(() => ({ createActivity: vi.fn(), onSaved: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Project Manager' }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { createActivity: state.createActivity, updateActivity: vi.fn() },
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
