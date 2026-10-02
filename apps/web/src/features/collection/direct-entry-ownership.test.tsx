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
  getSurveySubjectPage: vi.fn(),
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
  formType: 'ACTIVITY_MONITORING',
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
  it('offers direct entry for survey forms but not for a published OTHER form', async () => {
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'OTHER' })
    const other = render(<DirectFormEntryWorkspace {...props} />)
    await screen.findByText('Direct entry is available only for survey and monitoring forms.')
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
    other.unmount()
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: null })
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
  })
  it.each(['save', 'submit'] as const)(
    'rejects a %s acknowledgement for another contributor without displaying its values',
    async (operation) => {
      const subject = '70000000-0000-4000-8000-000000000007'
      const otherSubject = '80000000-0000-4000-8000-000000000008'
      state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
      api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
      api.getDirectSubmission.mockResolvedValue({ ...draft, beneficiaryId: subject })
      const mismatched = {
        ...draft,
        beneficiaryId: otherSubject,
        values: { note: 'Another contributor private response' },
      }
      api.updateDirectSubmission.mockResolvedValue(
        operation === 'save' ? mismatched : { ...draft, beneficiaryId: subject },
      )
      api.submitDirectSubmission.mockResolvedValue({ ...mismatched, status: 'VALIDATED' })
      render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
      await ready()
      fireEvent.click(
        screen.getByRole('button', { name: operation === 'save' ? 'Save draft' : 'Submit' }),
      )
      await screen.findByText('The saved contributor does not match this submission.')
      expect(screen.queryByDisplayValue('Another contributor private response')).toBeNull()
      expect(screen.getByDisplayValue('Saved private note')).toBeTruthy()
      expect(screen.queryByText(/Draft saved to PATHWAYS|and finalized/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Submit' }).hasAttribute('disabled')).toBe(false)
      if (operation === 'save') expect(api.submitDirectSubmission).not.toHaveBeenCalled()
      else expect(api.submitDirectSubmission).toHaveBeenCalledOnce()
    },
  )
  it('keeps the new anonymous retry identity when an obsolete identified reload finishes later', async () => {
    const subject = '70000000-0000-4000-8000-000000000007'
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    const survey = { ...definition, formType: 'TRAINING_SURVEY' }
    let finish: (value: typeof survey) => void = () => {}
    api.getDigitalForm.mockResolvedValueOnce(survey).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: subject })
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Open a separate response' }))
    await ready()
    const newPointer = window.sessionStorage.getItem(pointerKey())
    await act(async () => finish(survey))
    expect(window.sessionStorage.getItem(pointerKey())).toBe(newPointer)
    expect(screen.queryByDisplayValue('Saved private note')).toBeNull()
    expect(screen.getByLabelText('Note')).toBeTruthy()
    expect(screen.getByText(/A separate response is ready/)).toBeTruthy()
    expect(api.getDirectSubmissionByClientId).toHaveBeenCalledOnce()
    expect(api.saveDirectSubmission).not.toHaveBeenCalled()
    expect(api.updateDirectSubmission).not.toHaveBeenCalled()
  })
  it('rejects a delayed identified save callback when detail authority is lost but write authority remains', async () => {
    const subject = '70000000-0000-4000-8000-000000000007'
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: subject })
    let finish: (value: unknown) => void = () => {}
    api.updateDirectSubmission.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledOnce())
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    expect(screen.queryByDisplayValue('Saved private note')).toBeNull()
    await act(async () => finish({ ...draft, beneficiaryId: subject }))
    expect(api.submitDirectSubmission).not.toHaveBeenCalled()
    expect(screen.queryByText(/finalized/)).toBeNull()
  })
  it('clears only the destination retry pointer for a separate response from an existing identified entry', async () => {
    const subject = '70000000-0000-4000-8000-000000000007'
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
    api.getDirectSubmission.mockResolvedValue({ ...draft, beneficiaryId: subject })
    window.sessionStorage.setItem(
      pointerKey(),
      JSON.stringify({ clientSubmissionId: subject, formVersion: 1 }),
    )
    window.sessionStorage.setItem('unrelated-owned-pointer', 'preserved')
    render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await ready()
    const link = screen.getByRole('link', { name: 'Start a separate response' })
    link.addEventListener('click', (event) => event.preventDefault())
    expect(link.getAttribute('href')).toBe(
      `/collection/projects/${projectId}/forms/${formId}/entries/new`,
    )
    fireEvent.click(link)
    expect(window.sessionStorage.getItem(pointerKey())).toBeNull()
    expect(window.sessionStorage.getItem('unrelated-owned-pointer')).toBe('preserved')
    expect(api.saveDirectSubmission).not.toHaveBeenCalled()
    expect(api.updateDirectSubmission).not.toHaveBeenCalled()
  })
  it('hides identified survey values immediately after detail loss and resets an anonymous response on the same new route', async () => {
    const subject = '70000000-0000-4000-8000-000000000007'
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: subject })
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    expect(screen.getByDisplayValue('Saved private note')).toBeTruthy()
    const oldKey = window.sessionStorage.getItem(pointerKey())
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    expect(screen.queryByDisplayValue('Saved private note')).toBeNull()
    expect(screen.queryByLabelText('Note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open a separate response' }))
    await ready()
    expect(window.sessionStorage.getItem(pointerKey())).not.toBe(oldKey)
    expect(screen.getByLabelText('Note')).toBeTruthy()
    expect(screen.queryByDisplayValue('Saved private note')).toBeNull()
    api.saveDirectSubmission.mockResolvedValue({
      ...draft,
      values: { note: null },
      beneficiaryId: null,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.saveDirectSubmission).toHaveBeenCalledOnce())
    expect(api.saveDirectSubmission.mock.calls[0][4]).toBeUndefined()
    expect(api.updateDirectSubmission).not.toHaveBeenCalled()
  })
  it('preserves an identified contributor and exact request key after an uncertain save', async () => {
    const subject = '70000000-0000-4000-8000-000000000007'
    state.profile.permissions = ['submissions.write', 'beneficiaries.records.read']
    api.getDigitalForm.mockResolvedValue({ ...definition, formType: 'TRAINING_SURVEY' })
    api.getDirectSubmissionByClientId.mockRejectedValue(
      Object.assign(Error('Missing'), { code: 'not_found' }),
    )
    // Use the same exported boundary error class the component checks.
    const { PathwaysClientError } = await import('@/lib/services/pathways-client')
    api.getDirectSubmissionByClientId.mockRejectedValue(
      new PathwaysClientError('Missing', 'not_found'),
    )
    api.getSurveySubjectPage.mockResolvedValue({
      items: [{ id: subject, code: 'synthetic', displayName: 'Synthetic contributor' }],
      nextCursor: null,
    })
    api.saveDirectSubmission
      .mockRejectedValueOnce(Error('Response lost'))
      .mockResolvedValue({ ...draft, beneficiaryId: subject, values: { note: 'New note' } })
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    await screen.findByRole('option', { name: /synthetic.*Synthetic contributor/ })
    fireEvent.change(screen.getByLabelText('Contributor (optional)'), {
      target: { value: subject },
    })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'New note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Response lost')
    expect(screen.queryByLabelText('Contributor (optional)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText(/Draft saved to PATHWAYS/)
    expect(api.saveDirectSubmission.mock.calls[1]).toEqual(api.saveDirectSubmission.mock.calls[0])
    expect(api.saveDirectSubmission.mock.calls[0][4]).toBe(subject)
  })
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
