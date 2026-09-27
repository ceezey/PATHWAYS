import { clearSensitiveDraftStorage, sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectFormEntryWorkspace } from './direct-form-entry-workspace'

const state = vi.hoisted(() => ({
  profile: {
    id: '90000000-0000-4000-8000-000000000009',
    userId: '20000000-0000-4000-8000-000000000002',
    organizationId: '10000000-0000-4000-8000-000000000001',
    roles: ['PROJECT_OFFICER'],
    permissions: ['submissions.write'],
    assignedProjectIds: ['30000000-0000-4000-8000-000000000003'],
  },
}))
const api = vi.hoisted(() => ({
  getDigitalForm: vi.fn(),
  getDirectSubmission: vi.fn(),
  getDirectSubmissionByClientId: vi.fn(),
  saveDirectSubmission: vi.fn(),
  updateDirectSubmission: vi.fn(),
  submitDirectSubmission: vi.fn(),
  validateDigitalFormValues: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => state }))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class extends Error {
    code = 'not_found'
    fieldErrors = []
  },
  pathwaysClient: api,
}))
const projectId = '30000000-0000-4000-8000-000000000003'
const formId = '40000000-0000-4000-8000-000000000004'
const props = { projectId, formId }
const definition = {
  id: formId,
  projectId,
  code: 'notes',
  name: 'Notes',
  version: 1,
  status: 'PUBLISHED',
  formType: 'OTHER',
  fields: [{ id: 'field-1', code: 'note', label: 'Note', dataType: 'TEXT', required: false }],
}
const draft = {
  id: '50000000-0000-4000-8000-000000000005',
  status: 'DRAFT',
  formId,
  formVersion: 1,
  updatedAt: '2026-09-27T00:00:00Z',
  values: { note: 'Saved private note' },
}
const pointerKey = () =>
  sensitiveDraftKey('direct-entry-retry', {
    organizationId: state.profile.organizationId,
    userId: state.profile.userId,
    projectId,
    resourceId: JSON.stringify([formId, null]),
  })
const initialUser = state.profile.userId
async function ready() {
  await screen.findByRole('button', { name: 'Save draft' })
}
describe('direct entry scoped retry and continuation ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.sessionStorage.clear()
    window.localStorage.clear()
    state.profile = {
      ...state.profile,
      userId: initialUser,
      permissions: ['submissions.write'],
      assignedProjectIds: [projectId],
    }
    api.getDigitalForm.mockResolvedValue(definition)
    api.getDirectSubmissionByClientId.mockResolvedValue(draft)
    api.getDirectSubmission.mockResolvedValue(draft)
    api.updateDirectSubmission.mockResolvedValue(draft)
    api.submitDirectSubmission.mockResolvedValue({ ...draft, status: 'VALIDATED' })
    api.validateDigitalFormValues.mockResolvedValue({ valid: true, errors: [] })
  })
  afterEach(cleanup)
  it('preserves the owned request pointer through provider legacy cleanup and remount', async () => {
    const clientSubmissionId = '60000000-0000-4000-8000-000000000006'
    window.sessionStorage.setItem(
      pointerKey(),
      JSON.stringify({ clientSubmissionId, formVersion: 1 }),
    )
    clearSensitiveDraftStorage(true)
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    expect(api.getDirectSubmissionByClientId).toHaveBeenCalledWith(
      projectId,
      formId,
      clientSubmissionId,
    )
    view.unmount()
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    expect(api.getDirectSubmissionByClientId).toHaveBeenLastCalledWith(
      projectId,
      formId,
      clientSubmissionId,
    )
    expect(screen.getByDisplayValue('Saved private note')).toBeTruthy()
  })
  it('allocates a new pointer for another actor without reading the previous actor pointer', async () => {
    window.sessionStorage.setItem(
      pointerKey(),
      JSON.stringify({
        clientSubmissionId: '60000000-0000-4000-8000-000000000006',
        formVersion: 1,
      }),
    )
    state.profile = { ...state.profile, userId: '20000000-0000-4000-8000-000000000003' }
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    expect(api.getDirectSubmissionByClientId.mock.calls[0][2]).not.toBe(
      '60000000-0000-4000-8000-000000000006',
    )
  })
  it.each(['logout', 'permission', 'assignment', 'unmount'])(
    'does not finalize a saved draft after %s invalidation',
    async (reason) => {
      let resolve!: (value: typeof draft) => void
      api.updateDirectSubmission.mockReturnValue(
        new Promise((resolvePromise) => {
          resolve = resolvePromise
        }),
      )
      const view = render(<DirectFormEntryWorkspace {...props} />)
      await ready()
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
      await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledTimes(1))
      if (reason === 'logout') act(() => clearSensitiveDraftStorage())
      else if (reason === 'unmount') view.unmount()
      else {
        state.profile = {
          ...state.profile,
          ...(reason === 'permission' ? { permissions: [] } : { assignedProjectIds: [] }),
        }
        view.rerender(<DirectFormEntryWorkspace {...props} />)
      }
      await act(async () => {
        resolve(draft)
        await Promise.resolve()
      })
      expect(api.submitDirectSubmission).not.toHaveBeenCalled()
    },
  )
  it('validates the currently edited values rather than previously stored values', async () => {
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Current unsaved value' } })
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await waitFor(() =>
      expect(api.validateDigitalFormValues).toHaveBeenCalledWith(projectId, formId, {
        note: 'Current unsaved value',
      }),
    )
  })
  it('withholds stale initial loads and preserves synchronous single mutation', async () => {
    let resolve!: (value: typeof draft) => void
    api.updateDirectSubmission.mockReturnValue(
      new Promise((resolvePromise) => {
        resolve = resolvePromise
      }),
    )
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    const submit = screen.getByRole('button', { name: 'Submit' })
    act(() => {
      fireEvent.click(submit)
      fireEvent.click(submit)
    })
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledTimes(1))
    await act(async () => {
      resolve(draft)
    })
    expect(api.submitDirectSubmission).toHaveBeenCalledTimes(1)
  })
})
