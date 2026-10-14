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
})
