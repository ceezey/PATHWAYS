import {
  type DescriptiveAnalytics,
  type DescriptiveAnalyticsQuery,
  type SurveyAnalytics,
  type TimelineAnalytics,
  descriptiveAnalyticsQuerySchema,
  descriptiveAnalyticsSchema,
  surveyAnalyticsSchema,
  timelineAnalyticsSchema,
} from '@pathways/shared'
import { z } from 'zod'

import { requestFoundation } from '@/lib/api/core/request'

export const analyticsClient = {
  async getDescriptiveAnalytics(query: DescriptiveAnalyticsQuery): Promise<DescriptiveAnalytics> {
    return descriptiveAnalyticsSchema.parse(
      await requestFoundation(`/analytics/descriptive${descriptiveAnalyticsSearch(query)}`),
    )
  },

  async getSurveyAnalytics(query: DescriptiveAnalyticsQuery): Promise<SurveyAnalytics> {
    return surveyAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'survey' })}`,
      ),
    )
  },

  async getTimelineAnalytics(query: DescriptiveAnalyticsQuery): Promise<TimelineAnalytics> {
    return timelineAnalyticsSchema.parse(
      await requestFoundation(
        `/analytics/descriptive${descriptiveAnalyticsSearch({ ...query, view: 'timeline' })}`,
      ),
    )
  },
}

/** Validated query string shared by the descriptive read and its CSV export. */
export function descriptiveAnalyticsSearch(query: DescriptiveAnalyticsQuery): string {
  const parsed = descriptiveAnalyticsQuerySchema.parse(query)
  const params = new URLSearchParams({ projectId: parsed.projectId })
  if (parsed.periodStart && parsed.periodEnd) {
    params.set('periodStart', parsed.periodStart)
    params.set('periodEnd', parsed.periodEnd)
  }
  if (parsed.view) params.set('view', parsed.view)
  return `?${params.toString()}`
}

const analyticsExportPreviewSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  totalRows: z.number().int().nonnegative(),
})

/** First rows of the aggregate table a descriptive export would contain, with suppression applied. */
export async function getAnalyticsExportPreview(query: DescriptiveAnalyticsQuery) {
  return analyticsExportPreviewSchema.parse(
    await requestFoundation(
      `/analytics/descriptive/export/preview${descriptiveAnalyticsSearch(query)}`,
    ),
  )
}
