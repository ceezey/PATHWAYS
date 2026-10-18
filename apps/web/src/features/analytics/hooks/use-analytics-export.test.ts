/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AnalysisView } from '../analytics.copy'
import { useAnalyticsExport } from './use-analytics-export'

const api = vi.hoisted(() => ({ preview: vi.fn(), download: vi.fn(), toastError: vi.fn() }))
vi.mock('@/constants/feature-flags', () => ({ ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true }))
vi.mock('@/lib/api/analytics', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAnalyticsExportPreview: api.preview,
}))
vi.mock('@/lib/api/core/artifact-download', () => ({ downloadCoreArtifact: api.download }))
vi.mock('sonner', () => ({ toast: { error: api.toastError } }))

const projectId = '79300000-0000-4000-8000-000000000001'
const selectedPeriod = { value: 'p', label: 'September', start: '2026-09-01', end: '2026-09-30' }
const surveyPeriod = { value: 's', label: 'Third quarter', start: '2026-07-01', end: '2026-09-30' }
const params = {
  analysisView: 'kpi' as AnalysisView,
  canExportAnalytics: true,
  projectId,
  selectedPeriod,
  surveyPeriod,
  surveyUnavailable: false,
}
const rows = { title: 'Rows', columns: [], rows: [], totalRows: 0 }

describe('useAnalyticsExport', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('previews the shared period and names the file after the project', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({
      projectId,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
    expect(result.current.exportPreview).toEqual({
      format: 'CSV',
      data: rows,
      path: `/analytics/descriptive/export?projectId=${projectId}&periodStart=2026-09-01&periodEnd=2026-09-30`,
      fileName: `descriptive-analytics-${projectId}.csv`,
    })
    expect(result.current.exporting).toBe(false)
  })

  it('adds the format parameter for a spreadsheet', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('XLSX'))
    expect(result.current.exportPreview?.path).toMatch(/&format=XLSX$/)
    expect(result.current.exportPreview?.fileName).toBe(`descriptive-analytics-${projectId}.xlsx`)
  })

  it('uses the survey period and view on the survey view', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport({ ...params, analysisView: 'survey' }))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({
      projectId,
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      view: 'survey',
    })
    expect(result.current.exportPreview?.fileName).toBe(`survey-analytics-${projectId}.csv`)
  })

  it('sends no period on the timeline view', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() =>
      useAnalyticsExport({ ...params, analysisView: 'timeline', selectedPeriod: undefined }),
    )
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).toHaveBeenCalledWith({ projectId, view: 'timeline' })
  })

  it.each([
    ['without the permission', { canExportAnalytics: false }],
    ['without a project', { projectId: '' }],
    ['without a period', { selectedPeriod: undefined }],
    ['on an unavailable survey', { analysisView: 'survey' as const, surveyUnavailable: true }],
  ])('previews nothing %s', async (_name, change) => {
    const { result } = renderHook(() => useAnalyticsExport({ ...params, ...change }))
    await act(() => result.current.previewExport('CSV'))
    expect(api.preview).not.toHaveBeenCalled()
    expect(result.current.exportPreview).toBeNull()
  })

  it('ignores a second preview while one is running', async () => {
    api.preview.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAnalyticsExport(params))
    act(() => {
      void result.current.previewExport('CSV')
    })
    await waitFor(() => expect(result.current.exporting).toBe(true))
    await act(() => result.current.previewExport('PDF'))
    expect(api.preview).toHaveBeenCalledTimes(1)
  })

  it('downloads the previewed file and closes the preview', async () => {
    api.preview.mockResolvedValue(rows)
    api.download.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('PDF'))
    const { path, fileName } = result.current.exportPreview ?? { path: '', fileName: '' }
    await act(() => result.current.downloadExport())
    expect(api.download).toHaveBeenCalledWith(path, fileName)
    expect(result.current.exportPreview).toBeNull()
  })

  it('keeps the preview open and reports a failed download', async () => {
    api.preview.mockResolvedValue(rows)
    api.download.mockRejectedValue(new Error('Download refused.'))
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    await act(() => result.current.downloadExport())
    expect(api.toastError).toHaveBeenCalledWith('Download refused.')
    expect(result.current.exportPreview).not.toBeNull()
    expect(result.current.exporting).toBe(false)
  })

  it('reports the server reason of a failed preview or a generic line', async () => {
    api.preview
      .mockRejectedValueOnce(new Error('Verification is unavailable.'))
      .mockRejectedValue('x')
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    expect(api.toastError).toHaveBeenLastCalledWith('Verification is unavailable.')
    await act(() => result.current.previewExport('CSV'))
    expect(api.toastError).toHaveBeenLastCalledWith('Aggregate export unavailable.')
    expect(result.current.exportPreview).toBeNull()
  })

  it('closes the preview', async () => {
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    act(() => result.current.closeExportPreview())
    expect(result.current.exportPreview).toBeNull()
  })

  it('lowercases the project id in the file name', async () => {
    const upper = '79300000-0000-4000-8000-00000000000A'
    api.preview.mockResolvedValue(rows)
    const { result } = renderHook(() => useAnalyticsExport({ ...params, projectId: upper }))
    await act(() => result.current.previewExport('CSV'))
    expect(result.current.exportPreview?.fileName).toBe(
      'descriptive-analytics-79300000-0000-4000-8000-00000000000a.csv',
    )
  })

  it('downloads nothing without a preview', async () => {
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.downloadExport())
    expect(api.download).not.toHaveBeenCalled()
    expect(api.toastError).not.toHaveBeenCalled()
    expect(result.current.exporting).toBe(false)
  })

  it('holds the exporting flag during a download and ignores a second one', async () => {
    api.preview.mockResolvedValue(rows)
    api.download.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAnalyticsExport(params))
    await act(() => result.current.previewExport('CSV'))
    act(() => {
      void result.current.downloadExport()
    })
    await waitFor(() => expect(result.current.exporting).toBe(true))
    await act(() => result.current.downloadExport())
    expect(api.download).toHaveBeenCalledTimes(1)
    expect(result.current.exportPreview).not.toBeNull()
  })
})
