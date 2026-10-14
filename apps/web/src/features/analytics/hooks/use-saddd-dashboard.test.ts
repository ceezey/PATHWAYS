/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSummary } from '@/types/pathways'
import type { SadddDashboard } from '@pathways/shared'

import { useSadddDashboard } from './use-saddd-dashboard'

const api = vi.hoisted(() => ({ getSadddDashboard: vi.fn() }))
vi.mock('@/lib/api/dashboards', () => ({ dashboardsClient: api }))

const loaded = { sex: [] } as unknown as SadddDashboard
const selectedProject = { id: 'project-a' } as ProjectSummary
const params = { projectId: 'project-a', selectedProject, sadddEligible: true }

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
})
