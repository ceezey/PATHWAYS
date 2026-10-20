/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSummary } from '@/types/pathways'
import type { SadddDashboard } from '@pathways/shared'

import { useSadddDashboard } from './use-saddd-dashboard'

const api = vi.hoisted(() => ({ getSadddDashboard: vi.fn() }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))

const loaded = { sex: [] } as unknown as SadddDashboard
const newer = { sex: ['b'] } as unknown as SadddDashboard
const selectedProject = { id: 'project-a' } as ProjectSummary
const params = { projectId: 'project-a', selectedProject, sadddEligible: true }
const paramsB = {
  ...params,
  projectId: 'project-b',
  selectedProject: { id: 'project-b' } as ProjectSummary,
}

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
const render = (initialProps: Parameters<typeof useSadddDashboard>[0] = params) =>
  renderHook((props) => useSadddDashboard(props), { initialProps })

describe('useSadddDashboard', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('reads the project when the role and the project dates allow it', async () => {
    api.getSadddDashboard.mockResolvedValue(loaded)
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    expect(api.getSadddDashboard).toHaveBeenCalledWith({ projectId: 'project-a' })
    expect(result.current.sadddLoading).toBe(false)
  })

  it('does not read when the project is not eligible or not selected', () => {
    renderHook(() => useSadddDashboard({ ...params, sadddEligible: false }))
    renderHook(() => useSadddDashboard({ ...params, selectedProject: undefined }))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
  })

  it('keeps the failure message and reads again on retry', async () => {
    api.getSadddDashboard.mockRejectedValueOnce(new Error('Down.')).mockResolvedValue(loaded)
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.sadddError).toBe('Down.'))
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    expect(result.current.sadddError).toBe('')
  })

  it('names a failure that carries no message', async () => {
    api.getSadddDashboard.mockRejectedValue('offline')
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.sadddError).toBe('SADDD analysis is unavailable.'))
  })

  it('clears the result, the failure and the loading flag on reset', async () => {
    api.getSadddDashboard.mockResolvedValueOnce(loaded).mockRejectedValue(new Error('Down.'))
    const { result } = renderHook(() => useSadddDashboard(params))
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    act(() => result.current.resetSaddd())
    expect(result.current.saddd).toBeNull()
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.sadddError).toBe('Down.'))
    act(() => result.current.resetSaddd())
    expect(result.current.sadddError).toBe('')
    api.getSadddDashboard.mockReturnValue(new Promise(() => {}))
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.sadddLoading).toBe(true))
    act(() => result.current.resetSaddd())
    expect(result.current.sadddLoading).toBe(false)
  })

  it('keeps the newest project result when an older request resolves late', async () => {
    const first = deferred<SadddDashboard>()
    api.getSadddDashboard.mockReturnValueOnce(first.promise).mockResolvedValue(newer)
    const { result, rerender } = render()
    rerender(paramsB)
    await waitFor(() => expect(result.current.saddd).toBe(newer))
    first.resolve(loaded)
    await settle()
    expect(result.current.saddd).toBe(newer)
  })

  it('ignores the failure and the settling of an older request', async () => {
    const first = deferred<SadddDashboard>()
    api.getSadddDashboard.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => {}))
    const { result, rerender } = render()
    rerender(paramsB)
    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalledTimes(2))
    first.reject(new Error('Old.'))
    await settle()
    expect(result.current.sadddError).toBe('')
    expect(result.current.sadddLoading).toBe(true)
  })

  it('sets no state after unmount when a request resolves', async () => {
    const first = deferred<SadddDashboard>()
    api.getSadddDashboard.mockReturnValue(first.promise)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = render()
    unmount()
    first.resolve(loaded)
    await settle()
    expect(result.current.saddd).toBeNull()
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it.each([
    ['the project id', { ...params, projectId: 'project-b' }, 'project-b'],
    [
      'the selected project',
      { ...params, selectedProject: { id: 'project-a' } as ProjectSummary },
      'project-a',
    ],
  ])('reads again when %s changes', async (_name, next, id) => {
    api.getSadddDashboard.mockResolvedValue(loaded)
    const { rerender } = render()
    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalledTimes(1))
    rerender(next)
    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalledTimes(2))
    expect(api.getSadddDashboard).toHaveBeenLastCalledWith({ projectId: id })
  })

  it('reads when the project becomes eligible', async () => {
    api.getSadddDashboard.mockResolvedValue(loaded)
    const { result, rerender } = render({ ...params, sadddEligible: false })
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    rerender(params)
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
  })

  it('holds the loading flag while a read is pending and drops it after a failure', async () => {
    const first = deferred<SadddDashboard>()
    api.getSadddDashboard.mockReturnValue(first.promise)
    const { result } = render()
    await waitFor(() => expect(result.current.sadddLoading).toBe(true))
    first.reject(new Error('Down.'))
    await waitFor(() => expect(result.current.sadddLoading).toBe(false))
    expect(result.current.sadddError).toBe('Down.')
  })

  it('clears the result and the failure at the start of a read', async () => {
    api.getSadddDashboard.mockResolvedValueOnce(loaded).mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(result.current.saddd).toBe(loaded))
    act(() => result.current.retrySaddd())
    await waitFor(() => expect(result.current.sadddLoading).toBe(true))
    expect(result.current.saddd).toBeNull()
    expect(result.current.sadddError).toBe('')
  })

  describe.each([
    ['the project is deselected', { ...params, selectedProject: undefined }],
    ['the project stops being eligible', { ...params, sadddEligible: false }],
  ])('when %s', (_name, next) => {
    it('clears the result', async () => {
      api.getSadddDashboard.mockResolvedValue(loaded)
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.saddd).toBe(loaded))
      rerender(next)
      expect(result.current.saddd).toBeNull()
    })

    it('clears the failure', async () => {
      api.getSadddDashboard.mockRejectedValue(new Error('Down.'))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.sadddError).toBe('Down.'))
      rerender(next)
      expect(result.current.sadddError).toBe('')
    })

    it('clears the loading flag', async () => {
      api.getSadddDashboard.mockReturnValue(new Promise(() => {}))
      const { result, rerender } = render()
      await waitFor(() => expect(result.current.sadddLoading).toBe(true))
      rerender(next)
      expect(result.current.sadddLoading).toBe(false)
    })
  })
})
