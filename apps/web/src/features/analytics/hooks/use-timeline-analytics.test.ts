/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TimelineAnalytics } from '@pathways/shared'

import { useTimelineAnalytics } from './use-timeline-analytics'

const api = vi.hoisted(() => ({ getTimelineAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { elapsedPercent: null } as unknown as TimelineAnalytics
const params = {
  analysisView: 'timeline' as const,
  canReadSurveyTimeline: true,
  projectId: 'project-a',
}

describe('useTimelineAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the project on the timeline view only', async () => {
    api.getTimelineAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = renderHook((props) => useTimelineAnalytics(props), {
      initialProps: { ...params, analysisView: 'kpi' as 'kpi' | 'timeline' },
    })
    expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
    rerender({ ...params, analysisView: 'timeline' })
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    expect(api.getTimelineAnalytics).toHaveBeenCalledWith({ projectId: 'project-a' })
  })

  it('does not read without the survey and timeline permissions', () => {
    renderHook(() => useTimelineAnalytics({ ...params, canReadSurveyTimeline: false }))
    expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getTimelineAnalytics.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() => expect(result.current.timelineError).toBe('Down.'))
    act(() => result.current.retryTimeline())
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    expect(result.current.timelineError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getTimelineAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() =>
      expect(result.current.timelineError).toBe('Timeline analytics could not be loaded.'),
    )
  })

  it('clears the result and the failure on reset', async () => {
    api.getTimelineAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useTimelineAnalytics(params))
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    act(() => result.current.resetTimeline())
    expect(result.current.timeline).toBeNull()
    act(() => result.current.retryTimeline())
    await waitFor(() => expect(result.current.timelineError).toBe('Down.'))
    act(() => result.current.resetTimeline())
    expect(result.current.timelineError).toBe('')
  })
})
