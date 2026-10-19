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
const newer = { elapsedPercent: 50 } as unknown as TimelineAnalytics
const render = (initialProps: Parameters<typeof useTimelineAnalytics>[0] = params) =>
  renderHook((props) => useTimelineAnalytics(props), { initialProps })

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

  it('keeps the newest result when an older request resolves late', async () => {
    const first = deferred<TimelineAnalytics>()
    api.getTimelineAnalytics.mockReturnValueOnce(first.promise).mockResolvedValue(newer)
    const { result, rerender } = render()
    rerender({ ...params, projectId: 'project-b' })
    await waitFor(() => expect(result.current.timeline).toBe(newer))
    first.resolve(loaded)
    await settle()
    expect(result.current.timeline).toBe(newer)
  })

  it('ignores the failure and the settling of an older request', async () => {
    const first = deferred<TimelineAnalytics>()
    api.getTimelineAnalytics
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(new Promise(() => {}))
    const { result, rerender } = render()
    rerender({ ...params, projectId: 'project-b' })
    await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(2))
    first.reject(new Error('Old.'))
    await settle()
    expect(result.current.timelineError).toBe('')
    expect(result.current.timelineLoading).toBe(true)
  })

  it('sets no state after unmount when a request resolves', async () => {
    const first = deferred<TimelineAnalytics>()
    api.getTimelineAnalytics.mockReturnValue(first.promise)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = render()
    unmount()
    first.resolve(loaded)
    await settle()
    expect(result.current.timeline).toBeNull()
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('reads again when the project id changes', async () => {
    api.getTimelineAnalytics.mockResolvedValue(loaded)
    const { rerender } = render()
    await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(1))
    rerender({ ...params, projectId: 'project-b' })
    await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(2))
    expect(api.getTimelineAnalytics).toHaveBeenLastCalledWith({ projectId: 'project-b' })
  })

  it('reads when the permissions are granted', async () => {
    api.getTimelineAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = render({ ...params, canReadSurveyTimeline: false })
    expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
    rerender(params)
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
  })

  it.each([
    ['a success', (read: Read<TimelineAnalytics>) => read.resolve(loaded)],
    ['a failure', (read: Read<TimelineAnalytics>) => read.reject(new Error('Down.'))],
  ])('holds the loading flag while pending and drops it after %s', async (_name, settleWith) => {
    const pending = deferred<TimelineAnalytics>()
    api.getTimelineAnalytics.mockReturnValue(pending.promise)
    const { result } = render()
    await waitFor(() => expect(result.current.timelineLoading).toBe(true))
    settleWith(pending)
    await waitFor(() => expect(result.current.timelineLoading).toBe(false))
  })

  it('clears the result and the failure at the start of a read', async () => {
    api.getTimelineAnalytics.mockResolvedValueOnce(loaded).mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(result.current.timeline).toBe(loaded))
    act(() => result.current.retryTimeline())
    await waitFor(() => expect(result.current.timelineLoading).toBe(true))
    expect(result.current.timeline).toBeNull()
    expect(result.current.timelineError).toBe('')
  })

  describe.each([
    ['the view leaves the timeline', { ...params, analysisView: 'kpi' as const }],
    ['the permissions are taken away', { ...params, canReadSurveyTimeline: false }],
    ['the project is cleared', { ...params, projectId: '' }],
  ])('when %s', (_name, next) => {
    it('clears the result', async () => {
      api.getTimelineAnalytics.mockResolvedValue(loaded)
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.timeline).toBe(loaded))
      rerender(next)
      expect(result.current.timeline).toBeNull()
    })

    it('clears the failure', async () => {
      api.getTimelineAnalytics.mockRejectedValue(new Error('Down.'))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.timelineError).toBe('Down.'))
      rerender(next)
      expect(result.current.timelineError).toBe('')
    })

    it('clears the loading flag', async () => {
      api.getTimelineAnalytics.mockReturnValue(new Promise(() => {}))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.timelineLoading).toBe(true))
      rerender(next)
      expect(result.current.timelineLoading).toBe(false)
    })
  })
})
