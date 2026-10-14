/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DescriptiveAnalytics } from '@pathways/shared'

import { useDescriptiveAnalytics } from './use-descriptive-analytics'

const api = vi.hoisted(() => ({ getDescriptiveAnalytics: vi.fn() }))
vi.mock('@/lib/api/analytics', () => ({ analyticsClient: api }))

const loaded = { counts: [] } as unknown as DescriptiveAnalytics
const selectedPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const params = { canReadDescriptive: true, projectId: 'project-a', selectedPeriod }
const newer = { counts: ['b'] } as unknown as DescriptiveAnalytics
const octoberPeriod = { value: 'o', label: 'October', start: '2026-10-01', end: '2026-10-31' }
const render = (initialProps: Parameters<typeof useDescriptiveAnalytics>[0] = params) =>
  renderHook((props) => useDescriptiveAnalytics(props), { initialProps })

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)))

describe('useDescriptiveAnalytics', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the selected period of the project', async () => {
    api.getDescriptiveAnalytics.mockResolvedValue(loaded)
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    expect(api.getDescriptiveAnalytics).toHaveBeenCalledWith({
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
    expect(result.current.descriptiveLoading).toBe(false)
  })

  it('does not read without the permission or without a period', () => {
    const denied = { ...params, canReadDescriptive: false }
    const noPeriod = { ...params, selectedPeriod: undefined }
    renderHook(() => useDescriptiveAnalytics(denied))
    renderHook(() => useDescriptiveAnalytics(noPeriod))
    expect(api.getDescriptiveAnalytics).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getDescriptiveAnalytics.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptiveError).toBe('Down.'))
    act(() => result.current.retryDescriptive())
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    expect(result.current.descriptiveError).toBe('')
    expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2)
  })

  it('names a failure that carries no message', async () => {
    api.getDescriptiveAnalytics.mockRejectedValue('offline')
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() =>
      expect(result.current.descriptiveError).toBe('Descriptive statistics are unavailable.'),
    )
  })

  it('clears the result and the failure on reset', async () => {
    api.getDescriptiveAnalytics.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useDescriptiveAnalytics(params))
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    act(() => result.current.resetDescriptive())
    expect(result.current.descriptive).toBeNull()
    act(() => result.current.retryDescriptive())
    await waitFor(() => expect(result.current.descriptiveError).toBe('Down.'))
    act(() => result.current.resetDescriptive())
    expect(result.current.descriptiveError).toBe('')
  })

  it('keeps the newest result when an older request resolves late', async () => {
    const first = deferred<DescriptiveAnalytics>()
    api.getDescriptiveAnalytics.mockReturnValueOnce(first.promise).mockResolvedValue(newer)
    const { result, rerender } = render()
    rerender({ ...params, projectId: 'project-b' })
    await waitFor(() => expect(result.current.descriptive).toBe(newer))
    first.resolve(loaded)
    await settle()
    expect(result.current.descriptive).toBe(newer)
  })

  it('ignores the failure and the settling of an older request', async () => {
    const first = deferred<DescriptiveAnalytics>()
    api.getDescriptiveAnalytics
      .mockReturnValueOnce(first.promise)
      .mockReturnValue(new Promise(() => {}))
    const { result, rerender } = render()
    rerender({ ...params, selectedPeriod: octoberPeriod })
    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2))
    first.reject(new Error('Old.'))
    await settle()
    expect(result.current.descriptiveError).toBe('')
    expect(result.current.descriptiveLoading).toBe(true)
  })

  it('sets no state after unmount when a request resolves', async () => {
    const first = deferred<DescriptiveAnalytics>()
    api.getDescriptiveAnalytics.mockReturnValue(first.promise)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = render()
    unmount()
    first.resolve(loaded)
    await settle()
    expect(result.current.descriptive).toBeNull()
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it.each([
    ['the project id', { ...params, projectId: 'project-b' }, 'project-b', '2026-09-01'],
    [
      'the selected period',
      { ...params, selectedPeriod: octoberPeriod },
      'project-a',
      '2026-10-01',
    ],
  ])('reads again when %s changes', async (_name, next, id, start) => {
    api.getDescriptiveAnalytics.mockResolvedValue(loaded)
    const { rerender } = render()
    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(1))
    rerender(next)
    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2))
    expect(api.getDescriptiveAnalytics).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: id, periodStart: start }),
    )
  })

  it('reads when the permission is granted', async () => {
    api.getDescriptiveAnalytics.mockResolvedValue(loaded)
    const { result, rerender } = render({ ...params, canReadDescriptive: false })
    expect(api.getDescriptiveAnalytics).not.toHaveBeenCalled()
    rerender(params)
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
  })

  it.each([
    [
      'a success',
      (read: ReturnType<typeof deferred<DescriptiveAnalytics>>) => read.resolve(loaded),
    ],
    [
      'a failure',
      (read: ReturnType<typeof deferred<DescriptiveAnalytics>>) => read.reject(new Error('Down.')),
    ],
  ])('holds the loading flag while pending and drops it after %s', async (_name, settleWith) => {
    const pending = deferred<DescriptiveAnalytics>()
    api.getDescriptiveAnalytics.mockReturnValue(pending.promise)
    const { result } = render()
    await waitFor(() => expect(result.current.descriptiveLoading).toBe(true))
    settleWith(pending)
    await waitFor(() => expect(result.current.descriptiveLoading).toBe(false))
  })

  it('clears the result and the failure at the start of a read', async () => {
    api.getDescriptiveAnalytics.mockResolvedValueOnce(loaded).mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(result.current.descriptive).toBe(loaded))
    act(() => result.current.retryDescriptive())
    await waitFor(() => expect(result.current.descriptiveLoading).toBe(true))
    expect(result.current.descriptive).toBeNull()
    expect(result.current.descriptiveError).toBe('')
  })

  describe.each([
    ['the permission is taken away', { ...params, canReadDescriptive: false }],
    ['the period disappears', { ...params, selectedPeriod: undefined }],
    ['the project is cleared', { ...params, projectId: '' }],
  ])('when %s', (_name, next) => {
    it('clears the result', async () => {
      api.getDescriptiveAnalytics.mockResolvedValue(loaded)
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.descriptive).toBe(loaded))
      rerender(next)
      expect(result.current.descriptive).toBeNull()
    })

    it('clears the failure', async () => {
      api.getDescriptiveAnalytics.mockRejectedValue(new Error('Down.'))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.descriptiveError).toBe('Down.'))
      rerender(next)
      expect(result.current.descriptiveError).toBe('')
    })

    it('clears the loading flag', async () => {
      api.getDescriptiveAnalytics.mockReturnValue(new Promise(() => {}))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.descriptiveLoading).toBe(true))
      rerender(next)
      expect(result.current.descriptiveLoading).toBe(false)
    })
  })
})
