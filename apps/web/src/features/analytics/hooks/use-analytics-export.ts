'use client'

import { useState } from 'react'

import { ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED } from '@/constants/feature-flags'
import { descriptiveAnalyticsSearch, getAnalyticsExportPreview } from '@/lib/api/analytics'
import { downloadCoreArtifact } from '@/lib/services/core-feature-client'
import { toast } from 'sonner'

import type { AnalyticsReportingPeriod } from '../analytics-reporting-periods.utils'
import type { AnalysisView, ExportFormat } from '../analytics.copy'
import type { AnalyticsExportPreview } from '../components/analytics-export-preview'

export const useAnalyticsExport = ({
  analysisView,
  canExportAnalytics,
  projectId,
  selectedPeriod,
  surveyPeriod,
  surveyUnavailable,
}: {
  analysisView: AnalysisView
  canExportAnalytics: boolean
  projectId: string
  selectedPeriod: AnalyticsReportingPeriod | undefined
  surveyPeriod: AnalyticsReportingPeriod | undefined
  surveyUnavailable: boolean
}) => {
  const [exporting, setExporting] = useState(false)
  const [exportPreview, setExportPreview] = useState<{
    format: ExportFormat
    path: string
    fileName: string
    data: AnalyticsExportPreview
  } | null>(null)

  /** Loads the file's first rows for review; the download itself waits for confirmation. */
  const previewExport = async (format: ExportFormat) => {
    const view = analysisView === 'survey' || analysisView === 'timeline' ? analysisView : undefined
    if (!ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED || !canExportAnalytics || !projectId || exporting)
      return
    const exportPeriod = view === 'survey' ? surveyPeriod : selectedPeriod
    if (view !== 'timeline' && !exportPeriod) return
    if (view === 'survey' && surveyUnavailable) return
    const query = {
      projectId,
      ...(exportPeriod ? { periodStart: exportPeriod.start, periodEnd: exportPeriod.end } : {}),
      ...(view ? { view } : {}),
    }
    setExporting(true)
    try {
      const data = await getAnalyticsExportPreview(query)
      setExportPreview({
        format,
        data,
        path: `/analytics/descriptive/export${descriptiveAnalyticsSearch(query)}${format === 'CSV' ? '' : `&format=${format}`}`,
        fileName: `${view ?? 'descriptive'}-analytics-${projectId.toLowerCase()}.${format.toLowerCase()}`,
      })
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Aggregate export unavailable.')
    } finally {
      setExporting(false)
    }
  }

  const downloadExport = async () => {
    if (!exportPreview || exporting) return
    setExporting(true)
    try {
      await downloadCoreArtifact(exportPreview.path, exportPreview.fileName)
      setExportPreview(null)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Aggregate export unavailable.')
    } finally {
      setExporting(false)
    }
  }

  return {
    closeExportPreview: () => setExportPreview(null),
    downloadExport,
    exportPreview,
    exporting,
    previewExport,
  }
}
