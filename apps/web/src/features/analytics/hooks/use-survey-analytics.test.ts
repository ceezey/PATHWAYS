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
})
