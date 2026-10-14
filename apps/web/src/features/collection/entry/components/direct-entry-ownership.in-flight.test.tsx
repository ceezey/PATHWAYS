import { sensitiveDraftKey } from '@/lib/auth/sensitive-drafts'
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
vi.mock('@/lib/api/forms', () => ({ formsClient: api }))
vi.mock('@/lib/api/beneficiaries', () => ({ beneficiariesClient: api }))
vi.mock('@/lib/api/core/request', () => ({
  PathwaysClientError: class extends Error {
    code = 'not_found'
    fieldErrors = []
  },
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
const survey = { ...definition, formType: 'TRAINING_SURVEY' }
const contributor = '70000000-0000-4000-8000-000000000007'
const withDetail = ['submissions.write', 'beneficiaries.records.read']
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
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
  it.each(['unmount', 'form', 'project'] as const)(
    'ignores a form that lands after the screen left it (%s)',
    async (change) => {
      const next = {
        projectId: change === 'project' ? '30000000-0000-4000-8000-0000000000a3' : projectId,
        formId: change === 'form' ? '40000000-0000-4000-8000-0000000000a4' : formId,
      }
      state.profile.assignedProjectIds = [projectId, next.projectId]
      const older = deferred<typeof definition>()
      api.getDigitalForm.mockReturnValueOnce(older.promise)
      const view = render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
      await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledOnce())
      if (change === 'unmount') view.unmount()
      else {
        api.getDigitalForm.mockResolvedValue({
          ...definition,
          id: next.formId,
          projectId: next.projectId,
        })
        api.getDirectSubmission.mockResolvedValue({ ...draft, formId: next.formId })
        view.rerender(<DirectFormEntryWorkspace {...next} initialSubmissionId={draft.id} />)
        await ready()
      }
      await act(async () => older.resolve(definition))
      expect(api.getDirectSubmission).toHaveBeenCalledTimes(change === 'unmount' ? 0 : 1)
      if (change !== 'unmount')
        expect(api.getDirectSubmission).toHaveBeenCalledWith(next.projectId, next.formId, draft.id)
    },
  )
  it('ignores a form that lands after a newer load of the same screen started', async () => {
    const older = deferred<typeof definition>()
    api.getDigitalForm.mockReturnValueOnce(older.promise)
    const view = render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledOnce())
    state.profile.permissions = withDetail
    view.rerender(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await ready()
    expect(api.getDirectSubmission).toHaveBeenCalledOnce()
    await act(async () => older.resolve(definition))
    expect(api.getDirectSubmission).toHaveBeenCalledOnce()
  })
  it.each([
    ['project', { projectId: '30000000-0000-4000-8000-0000000000a3' }],
    ['form', { id: '40000000-0000-4000-8000-0000000000a4' }],
  ])('rejects a form definition that belongs to another %s', async (_, other) => {
    api.getDigitalForm.mockResolvedValue({ ...definition, ...other })
    render(<DirectFormEntryWorkspace {...props} />)
    await screen.findByRole('button', { name: 'Retry' })
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull()
    expect(api.getDirectSubmissionByClientId).not.toHaveBeenCalled()
  })
  it('keeps a newer response when an older persisted record lands after a newer load', async () => {
    const older = deferred<typeof draft>()
    api.getDirectSubmission
      .mockReturnValueOnce(older.promise)
      .mockResolvedValue({ ...draft, values: { note: 'Newer response' } })
    const view = render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await waitFor(() => expect(api.getDirectSubmission).toHaveBeenCalledOnce())
    state.profile.permissions = withDetail
    view.rerender(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await screen.findByDisplayValue('Newer response')
    await act(async () => older.resolve({ ...draft, values: { note: 'Older response' } }))
    expect(screen.queryByDisplayValue('Older response')).toBeNull()
    expect(screen.getByDisplayValue('Newer response')).toBeTruthy()
  })
  it('keeps a separate response when an obsolete persisted record lands afterwards', async () => {
    state.profile.permissions = withDetail
    api.getDigitalForm.mockResolvedValue(survey)
    const older = deferred<typeof draft & { beneficiaryId: null }>()
    api.getDirectSubmissionByClientId
      .mockResolvedValueOnce({ ...draft, beneficiaryId: contributor })
      .mockReturnValueOnce(older.promise)
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    await waitFor(() => expect(api.getDirectSubmissionByClientId).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Open a separate response' }))
    await ready()
    await act(async () => older.resolve({ ...draft, beneficiaryId: null }))
    expect(screen.queryByDisplayValue('Saved private note')).toBeNull()
    expect(screen.queryByText('Your persisted draft was restored.')).toBeNull()
    expect(screen.getByText(/A separate response is ready/)).toBeTruthy()
  })
  it('keeps the loaded form when an older load fails after a newer one finished', async () => {
    const older = deferred<typeof definition>()
    api.getDigitalForm.mockReturnValueOnce(older.promise)
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledOnce())
    state.profile.permissions = withDetail
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    await ready()
    await act(async () => older.reject(new Error('Down')))
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
  it('keeps a separate response when an obsolete reload fails afterwards', async () => {
    state.profile.permissions = withDetail
    const older = deferred<typeof survey>()
    api.getDigitalForm.mockResolvedValueOnce(survey).mockReturnValueOnce(older.promise)
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: contributor })
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Open a separate response' }))
    await ready()
    await act(async () => older.reject(new Error('Down')))
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
  it('loads the form again when Retry is pressed after a load failure', async () => {
    api.getDigitalForm.mockRejectedValueOnce(new Error('Down'))
    render(<DirectFormEntryWorkspace {...props} />)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    const again = deferred<typeof definition>()
    api.getDigitalForm.mockReturnValueOnce(again.promise)
    fireEvent.click(retry)
    await waitFor(() => expect(api.getDigitalForm).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    await act(async () => again.resolve(definition))
    await ready()
    expect(api.getDigitalForm).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
  it('does nothing for a second action while one is running', async () => {
    const saving = deferred<typeof draft>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
      fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledOnce())
    expect(api.validateDigitalFormValues).not.toHaveBeenCalled()
    await act(async () => saving.resolve(draft))
    await screen.findByText(/Draft saved to PATHWAYS/)
    expect(api.updateDirectSubmission).toHaveBeenCalledOnce()
  })
  it('shows the running action and clears the previous notice while it runs', async () => {
    const saving = deferred<typeof draft>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await screen.findByText('All fields passed server validation.')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByRole('button', { name: 'Saving...' })
    expect(screen.queryByText('All fields passed server validation.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Validate' }).hasAttribute('disabled')).toBe(true)
    await act(async () => saving.resolve(draft))
    await screen.findByRole('button', { name: 'Save draft' })
  })
  it('ignores an edit made while a save is running', async () => {
    const saving = deferred<typeof draft>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByRole('button', { name: 'Saving...' })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Typed during the save' } })
    expect(screen.queryByDisplayValue('Typed during the save')).toBeNull()
    await act(async () => saving.resolve({ ...draft, values: { note: 'Saved answer' } }))
    await screen.findByText(/Draft saved to PATHWAYS/)
    expect(screen.getByDisplayValue('Saved answer')).toBeTruthy()
  })
  it('discards the result of a save when the form was reloaded at another version', async () => {
    const saving = deferred<typeof draft>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    const view = render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledOnce())
    api.getDigitalForm.mockResolvedValue({ ...definition, version: 2 })
    api.getDirectSubmission.mockResolvedValue({
      ...draft,
      formVersion: 2,
      values: { note: 'Reloaded note' },
    })
    state.profile.permissions = withDetail
    view.rerender(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await screen.findByDisplayValue('Reloaded note')
    await act(async () => saving.resolve({ ...draft, values: { note: 'Stale save' } }))
    expect(screen.queryByDisplayValue('Stale save')).toBeNull()
    expect(screen.queryByText(/Draft saved to PATHWAYS/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('does not open a separate response while a save is running', async () => {
    state.profile.permissions = withDetail
    api.getDigitalForm.mockResolvedValue(survey)
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: contributor })
    const saving = deferred<unknown>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    const pointer = window.sessionStorage.getItem(pointerKey())
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledOnce())
    state.profile.permissions = ['submissions.write']
    view.rerender(<DirectFormEntryWorkspace {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open a separate response' }))
    expect(screen.getByRole('button', { name: 'Open a separate response' })).toBeTruthy()
    expect(window.sessionStorage.getItem(pointerKey())).toBe(pointer)
    await act(async () => saving.resolve({ ...draft, beneficiaryId: contributor }))
  })
  it('ignores a link to a separate response pressed during a save', async () => {
    state.profile.permissions = withDetail
    api.getDigitalForm.mockResolvedValue(survey)
    api.getDirectSubmission.mockResolvedValue({ ...draft, beneficiaryId: contributor })
    const saving = deferred<unknown>()
    api.updateDirectSubmission.mockReturnValue(saving.promise)
    const pointer = JSON.stringify({ clientSubmissionId: contributor, formVersion: 1 })
    window.sessionStorage.setItem(pointerKey(), pointer)
    let prevented = false
    const record = (event: Event) => {
      prevented = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', record)
    render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(api.updateDirectSubmission).toHaveBeenCalledOnce())
    const link = screen.getByRole('link', { name: 'Start a separate response' })
    fireEvent.click(link)
    expect(prevented).toBe(true)
    expect(window.sessionStorage.getItem(pointerKey())).toBe(pointer)
    await act(async () => saving.resolve({ ...draft, beneficiaryId: contributor }))
    await screen.findByText(/Draft saved to PATHWAYS/)
    fireEvent.click(link)
    document.removeEventListener('click', record)
    expect(prevented).toBe(false)
    expect(window.sessionStorage.getItem(pointerKey())).toBeNull()
  })
  it('starts a fresh record after a submitted one when Start another record is pressed', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const view = render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    const first = api.getDirectSubmissionByClientId.mock.calls[0][2]
    expect(JSON.parse(window.sessionStorage.getItem(pointerKey()) ?? '{}').clientSubmissionId).toBe(
      first,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await screen.findByText(/and finalized/)
    fireEvent.click(screen.getByRole('button', { name: 'Start another record' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(pointerKey())).toBeNull()
    view.unmount()
    render(<DirectFormEntryWorkspace {...props} />)
    await ready()
    expect(api.getDirectSubmissionByClientId.mock.calls[1][2]).not.toBe(first)
    vi.unstubAllGlobals()
  })
  it('links a submitted saved record to a new response and clears only its retry pointer', async () => {
    api.getDirectSubmission.mockResolvedValue({ ...draft, status: 'VALIDATED' })
    window.sessionStorage.setItem(
      pointerKey(),
      JSON.stringify({ clientSubmissionId: contributor, formVersion: 1 }),
    )
    render(<DirectFormEntryWorkspace {...props} initialSubmissionId={draft.id} />)
    const link = await screen.findByRole('link', { name: 'Start another record' })
    link.addEventListener('click', (event) => event.preventDefault())
    expect(link.getAttribute('href')).toBe(
      `/collection/projects/${projectId}/forms/${formId}/entries/new`,
    )
    fireEvent.click(link)
    expect(window.sessionStorage.getItem(pointerKey())).toBeNull()
  })
  it('resets the contributor, answers and request identity when a separate response starts', async () => {
    state.profile.permissions = withDetail
    api.getDigitalForm.mockResolvedValue(survey)
    api.getDirectSubmissionByClientId.mockResolvedValue({ ...draft, beneficiaryId: contributor })
    api.getSurveySubjectPage.mockResolvedValue({
      items: [{ id: contributor, code: 'synthetic', displayName: 'Synthetic contributor' }],
      nextCursor: null,
    })
    api.validateDigitalFormValues.mockResolvedValue({
      valid: false,
      errors: [{ fieldCode: 'note', message: 'Note is too short' }],
    })
    api.saveDirectSubmission.mockResolvedValue({ ...draft, beneficiaryId: null })
    render(<DirectFormEntryWorkspace {...props} />)
    await screen.findByDisplayValue('Saved private note')
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await screen.findByText('Note is too short')
    fireEvent.click(screen.getByRole('button', { name: 'Start a separate response' }))
    await screen.findByText(/A separate response is ready/)
    const picker = (await screen.findByLabelText('Contributor (optional)')) as HTMLSelectElement
    expect(picker.value).toBe('')
    expect((screen.getByLabelText('Note') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Note is too short')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText(/Draft saved to PATHWAYS/)
    expect(api.updateDirectSubmission).not.toHaveBeenCalled()
    expect(api.saveDirectSubmission.mock.calls[0][2]).not.toBe(
      api.getDirectSubmissionByClientId.mock.calls[0][2],
    )
    expect(api.saveDirectSubmission.mock.calls[0][4]).toBeUndefined()
  })
})
