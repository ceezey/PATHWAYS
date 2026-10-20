/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSensitiveDraft, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'

const projectId = '72100000-0000-4000-8000-000000000004'
const state = vi.hoisted(() => ({
  profile: {
    userId: 'actor-a',
    organizationId: 'org-a',
    roles: ['PROJECT_MANAGER'],
    permissions: [
      'activities.create',
      'activities.update',
      'budgets.create',
      'budgets.update',
      'budgets.read',
      'indicators.read',
      'indicators.update',
    ],
    assignedProjectIds: ['72100000-0000-4000-8000-000000000004'],
  },
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ role: 'Project Manager', profile: state.profile }),
}))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: {} }))

import { ActivityFormDialog } from './activity-form-dialog'

const officer = { userId: '72100000-0000-4000-8000-000000000005', displayName: 'Project Officer A' }
const draftKey = sensitiveDraftKey('activity', {
  organizationId: 'org-a',
  userId: 'actor-a',
  projectId,
  resourceId: null,
})
const stored = (value: Record<string, unknown>) =>
  window.sessionStorage.setItem(draftKey, JSON.stringify(value))
const renderDialog = () =>
  render(
    <ActivityFormDialog
      activity={null}
      indicators={[]}
      journeyStages={[]}
      onCreatedOrUpdated={vi.fn()}
      onOpenChange={vi.fn()}
      open
      projectId={projectId}
      officers={[officer]}
    />,
  )

describe('activity form draft', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('restores a stored draft, says so, and drops officers the project no longer offers', async () => {
    stored({
      projectId,
      title: 'Stored title',
      assignedOfficers: [officer.userId, 'removed-officer'],
      journeyStageId: 'unknown-stage',
    })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('Stored title')
    expect(screen.getByText('Recovered your unsaved activity draft.')).toBeTruthy()
    expect(
      (screen.getByRole('checkbox', { name: /Project Officer A/ }) as HTMLInputElement).checked,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: 'Edited' } })
    await waitFor(() =>
      expect(readSensitiveDraft(draftKey)).toMatchObject({
        title: 'Edited',
        assignedOfficers: [officer.userId],
        journeyStageId: '',
      }),
    )
  })

  it('ignores a draft stored for another project', () => {
    stored({ projectId: '72100000-0000-4000-8000-0000000000ff', title: 'Other project' })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Recovered your unsaved activity draft.')).toBeNull()
  })

  it('keeps only stored values of the right type and size', () => {
    stored({ projectId, title: 42, description: 'x'.repeat(10_001), dueDate: '2026-11-01' })
    renderDialog()
    expect((screen.getByLabelText(/Activity title/) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText(/Due date/) as HTMLInputElement).value).toBe('2026-11-01')
  })

  it('writes the draft while the officer types and removes it once the form is back to its start', async () => {
    renderDialog()
    expect(readSensitiveDraft(draftKey)).toBeNull()
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: 'Typed title' } })
    await waitFor(() =>
      expect(readSensitiveDraft(draftKey)).toMatchObject({ projectId, title: 'Typed title' }),
    )
    fireEvent.change(screen.getByLabelText(/Activity title/), { target: { value: '' } })
    await waitFor(() => expect(readSensitiveDraft(draftKey)).toBeNull())
  })
})
