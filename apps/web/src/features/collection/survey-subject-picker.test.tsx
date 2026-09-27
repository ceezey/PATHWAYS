/* @vitest-environment jsdom */
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveySubjectPicker } from './survey-subject-picker'

const state = vi.hoisted(() => ({ allowed: true, user: 'reviewer', page: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: state.allowed ? ['beneficiaries.records.read'] : [],
      assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
    },
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    getSurveySubjectPage: (...args: unknown[]) => state.page(...args),
  },
}))
const projectId = '10000000-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const subjectId = '30000000-0000-4000-8000-000000000003'
const page = {
  items: [{ id: subjectId, code: 'SYN-1', displayName: 'Fictional contributor' }],
  nextCursor: null,
}
const props = { projectId, formId, value: '', locked: false, onChange: vi.fn() }
beforeEach(() => {
  vi.resetAllMocks()
  state.allowed = true
  state.user = 'reviewer'
  state.page.mockResolvedValue(page)
})
afterEach(cleanup)

describe('survey contributor current ownership and recovery', () => {
  it('selects only the scoped page choice and explicitly allows anonymous selection', async () => {
    render(<SurveySubjectPicker {...props} />)
    const select = await screen.findByLabelText('Contributor (optional)')
    fireEvent.change(select, { target: { value: subjectId } })
    expect(props.onChange).toHaveBeenLastCalledWith(subjectId)
    fireEvent.click(screen.getByRole('button', { name: 'Use anonymous response' }))
    expect(props.onChange).toHaveBeenLastCalledWith('')
    expect(state.page).toHaveBeenCalledWith(projectId, '', undefined, expect.any(AbortSignal))
  })
  it('clears cached labels during a failed search and retries the same query', async () => {
    state.page
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(Error('Denied'))
      .mockResolvedValueOnce(page)
    render(<SurveySubjectPicker {...props} />)
    await screen.findByRole('option', { name: /Fictional contributor/ })
    fireEvent.change(screen.getByLabelText('Search current project contributors'), {
      target: { value: ' Fictional ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('button', { name: 'Retry contributors' })
    expect(screen.queryByRole('option', { name: /Fictional contributor/ })).toBeNull()
    expect(props.onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry contributors' }))
    await screen.findByRole('option', { name: /Fictional contributor/ })
    expect(state.page.mock.calls[1].slice(0, 3)).toEqual([projectId, 'Fictional', undefined])
    expect(state.page.mock.calls[2].slice(0, 3)).toEqual([projectId, 'Fictional', undefined])
  })
  it('does not fetch or permit retargeting a locked identified response', () => {
    render(<SurveySubjectPicker {...props} value={subjectId} locked />)
    expect(screen.getByText('An identified contributor is fixed for this submission.')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(state.page).not.toHaveBeenCalled()
    expect(props.onChange).not.toHaveBeenCalled()
  })
  it('aborts and suppresses late labels when detail permission is independently revoked', async () => {
    let finish: (value: typeof page) => void = () => {}
    state.page.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = render(<SurveySubjectPicker {...props} value={subjectId} />)
    const signal = state.page.mock.calls[0][3] as AbortSignal
    state.allowed = false
    view.rerender(<SurveySubjectPicker {...props} value={subjectId} />)
    expect(signal.aborted).toBe(true)
    expect(screen.getByText(/existing identified submission is unchanged/)).toBeTruthy()
    await act(async () => finish(page))
    expect(screen.queryByRole('option', { name: /Fictional contributor/ })).toBeNull()
    expect(props.onChange).not.toHaveBeenCalled()
  })
  it('aborts the old generation and never lets its late page replace the new page', async () => {
    let finish: (value: typeof page) => void = () => {}
    state.page
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    render(<SurveySubjectPicker {...props} />)
    const signal = state.page.mock.calls[0][3] as AbortSignal
    await act(async () => clearSensitiveDraftStorage())
    await waitFor(() => expect(state.page).toHaveBeenCalledTimes(2))
    expect(signal.aborted).toBe(true)
    await act(async () => finish(page))
    expect(screen.queryByRole('option', { name: /Fictional contributor/ })).toBeNull()
    expect(screen.getByRole('option', { name: 'Anonymous' })).toBeTruthy()
  })
  it('keeps anonymous entry available without detail authority and makes no sensitive request', () => {
    state.allowed = false
    render(<SurveySubjectPicker {...props} />)
    expect(screen.getByText(/An anonymous response is available/)).toBeTruthy()
    expect(state.page).not.toHaveBeenCalled()
  })
})
