/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAnalyticsExport } from './use-analytics-export'

const api = vi.hoisted(() => ({ preview: vi.fn() }))
vi.mock('@/constants/feature-flags', () => ({ ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: false }))
vi.mock('@/lib/api/analytics', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAnalyticsExportPreview: api.preview,
}))

const period = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }

describe('useAnalyticsExport with the export flag off', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('previews nothing even for a permitted project and period', async () => {
    const { result } = renderHook(() =>
      useAnalyticsExport({
        analysisView: 'kpi',
        canExportAnalytics: true,
        projectId: '79300000-0000-4000-8000-000000000001',
        selectedPeriod: period,
        surveyPeriod: period,
        surveyUnavailable: false,
      }),
    )
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).not.toHaveBeenCalled()
    expect(result.current.exportPreview).toBeNull()
    expect(result.current.exporting).toBe(false)
  })
})
