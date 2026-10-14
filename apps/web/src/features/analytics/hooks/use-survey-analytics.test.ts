/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SurveyAnalytics } from '@pathways/shared'

import { useSurveyAnalytics } from './use-survey-analytics'

const api = vi.hoisted(() => ({ getSurveyAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { overall: {} } as unknown as SurveyAnalytics
const surveyPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const params = {
  analysisView: 'survey' as 'kpi' | 'survey',
  projectId: 'project-a',
  surveyFrozenOnly: false,
  surveyPeriod,
  surveyUnavailable: false,
}
const refused = (status: number) => Object.assign(new Error('Refused.'), { status })
const newer = { overall: { n: 2 } } as unknown as SurveyAnalytics
const octoberPeriod = { value: 'o', label: 'October', start: '2026-10-01', end: '2026-10-31' }
const render = (initialProps: Parameters<typeof useSurveyAnalytics>[0] = params) =>
  renderHook((props) => useSurveyAnalytics(props), { initialProps })

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}
type Read<T> = ReturnType<typeof deferred<T>>
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

describe('useSurveyAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the survey period on the survey view only', async () => {
    api.getSurveyAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = renderHook((props) => useSurveyAnalytics(props), {
      initialProps: { ...params, analysisView: 'kpi' as 'kpi' | 'survey' },
    })
    expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
    rerender({ ...params, analysisView: 'survey' })
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
  })

  it('does not read when the survey is unavailable to the role', () => {
    renderHook(() => useSurveyAnalytics({ ...params, surveyUnavailable: true }))
    expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
  })

  it.each([
    [403, false, 'restricted', 'Survey improvement is restricted for your role.'],
    [400, false, 'period', 'This reporting period cannot be used for survey results.'],
    [
      400,
      true,
      'period',
      'Survey results for your role are released after the reporting period closes. Choose a closed period.',
    ],
  ])('maps a %i refusal (frozen only %s) to the %s kind', async (status, frozen, kind, message) => {
    api.getSurveyAnalytics.mockRejectedValue(refused(status))
    const { result } = renderHook(() => useSurveyAnalytics({ ...params, surveyFrozenOnly: frozen }))
    await waitFor(() => expect(result.current.surveyErrorKind).toBe(kind))
    expect(result.current.surveyError).toBe(message)
  })

  it('keeps the server message of a retryable failure and reads again on retry', async () => {
    api.getSurveyAnalytics.mockRejectedValueOnce(refused(503)).mockResolvedValue(loaded)
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() => expect(result.current.surveyError).toBe('Refused.'))
    expect(result.current.surveyErrorKind).toBe('retry')
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    expect(result.current.surveyError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getSurveyAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() =>
      expect(result.current.surveyError).toBe('Survey analytics could not be loaded.'),
    )
  })

  it('clears the result, the failure and the error kind on reset', async () => {
    api.getSurveyAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(refused(403))
    const { result } = renderHook(() => useSurveyAnalytics(params))
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    act(() => result.current.resetSurvey())
    expect(result.current.survey).toBeNull()
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.surveyErrorKind).toBe('restricted'))
    act(() => result.current.resetSurvey())
    expect(result.current.surveyError).toBe('')
    expect(result.current.surveyErrorKind).toBe('retry')
  })

  it('keeps the newest result when an older request resolves late', async () => {
    const first = deferred<SurveyAnalytics>()
    api.getSurveyAnalytics.mockReturnValueOnce(first.promise).mockResolvedValue(newer)
    const { result, rerender } = render()
    rerender({ ...params, projectId: 'project-b' })
    await waitFor(() => expect(result.current.survey).toBe(newer))
    first.resolve(loaded)
    await settle()
    expect(result.current.survey).toBe(newer)
  })

  it('ignores the failure, the error kind and the settling of an older request', async () => {
    const first = deferred<SurveyAnalytics>()
    api.getSurveyAnalytics.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => {}))
    const { result, rerender } = render()
    rerender({ ...params, surveyPeriod: octoberPeriod })
    await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(2))
    first.reject(refused(403))
    await settle()
    expect(result.current.surveyError).toBe('')
    expect(result.current.surveyErrorKind).toBe('retry')
    expect(result.current.surveyLoading).toBe(true)
  })

  it('sets no state after unmount when a request resolves', async () => {
    const first = deferred<SurveyAnalytics>()
    api.getSurveyAnalytics.mockReturnValue(first.promise)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = render()
    unmount()
    first.resolve(loaded)
    await settle()
    expect(result.current.survey).toBeNull()
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it.each([
    ['the project id', { ...params, projectId: 'project-b' }, 'project-b', '2026-09-01'],
    ['the survey period', { ...params, surveyPeriod: octoberPeriod }, 'project-a', '2026-10-01'],
    ['the frozen-only flag', { ...params, surveyFrozenOnly: true }, 'project-a', '2026-09-01'],
  ])('reads again when %s changes', async (_name, next, id, start) => {
    api.getSurveyAnalytics.mockResolvedValue(loaded)
    const { rerender } = render()
    await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(1))
    rerender(next)
    await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(2))
    expect(api.getSurveyAnalytics).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: id, periodStart: start }),
    )
  })

  it('reads when the survey becomes available', async () => {
    api.getSurveyAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = render({ ...params, surveyUnavailable: true })
    expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
    rerender(params)
    await waitFor(() => expect(result.current.survey).toBe(loaded))
  })

  it.each([
    ['a success', (read: Read<SurveyAnalytics>) => read.resolve(loaded)],
    ['a failure', (read: Read<SurveyAnalytics>) => read.reject(new Error('Down.'))],
  ])('holds the loading flag while pending and drops it after %s', async (_name, settleWith) => {
    const pending = deferred<SurveyAnalytics>()
    api.getSurveyAnalytics.mockReturnValue(pending.promise)
    const { result } = render()
    await waitFor(() => expect(result.current.surveyLoading).toBe(true))
    settleWith(pending)
    await waitFor(() => expect(result.current.surveyLoading).toBe(false))
  })

  it('clears the result, the failure and the error kind at the start of a read', async () => {
    api.getSurveyAnalytics
      .mockRejectedValueOnce(refused(403))
      .mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(result.current.surveyErrorKind).toBe('restricted'))
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.surveyLoading).toBe(true))
    expect(result.current.surveyError).toBe('')
    expect(result.current.surveyErrorKind).toBe('retry')
    expect(result.current.survey).toBeNull()
  })

  it('clears the result at the start of a read', async () => {
    api.getSurveyAnalytics.mockResolvedValueOnce(loaded).mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(result.current.survey).toBe(loaded))
    act(() => result.current.retrySurvey())
    await waitFor(() => expect(result.current.surveyLoading).toBe(true))
    expect(result.current.survey).toBeNull()
  })

  describe.each([
    ['the view leaves the survey', { ...params, analysisView: 'kpi' as const }],
    ['the survey becomes unavailable', { ...params, surveyUnavailable: true }],
    ['the period disappears', { ...params, surveyPeriod: undefined }],
    ['the project is cleared', { ...params, projectId: '' }],
  ])('when %s', (_name, next) => {
    it('clears the result', async () => {
      api.getSurveyAnalytics.mockResolvedValue(loaded)
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.survey).toBe(loaded))
      rerender(next)
      expect(result.current.survey).toBeNull()
    })

    it('clears the failure and the error kind', async () => {
      api.getSurveyAnalytics.mockRejectedValue(refused(403))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.surveyErrorKind).toBe('restricted'))
      rerender(next)
      expect(result.current.surveyError).toBe('')
      expect(result.current.surveyErrorKind).toBe('retry')
    })

    it('clears the loading flag', async () => {
      api.getSurveyAnalytics.mockReturnValue(new Promise(() => {}))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.surveyLoading).toBe(true))
      rerender(next)
      expect(result.current.surveyLoading).toBe(false)
    })
  })
})
