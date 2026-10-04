import {
  type AnalyticsInsightsQuery,
  type BudgetSummary,
  type IndicatorTrends,
  type ParticipationBreakdown,
  analyticsInsightsQuerySchema,
  budgetSummarySchema,
  indicatorTrendsSchema,
  participationBreakdownSchema,
} from '@pathways/shared'

import { requestFoundation } from './pathways-client'

/** Validated query string: one project and an optional complete period. */
export function analyticsInsightsSearch(query: AnalyticsInsightsQuery): string {
  const parsed = analyticsInsightsQuerySchema.parse(query)
  const params = new URLSearchParams({ projectId: parsed.projectId })
  if (parsed.periodStart && parsed.periodEnd) {
    params.set('periodStart', parsed.periodStart)
    params.set('periodEnd', parsed.periodEnd)
  }
  return `?${params.toString()}`
}

const get = (name: string, query: AnalyticsInsightsQuery, signal?: AbortSignal) =>
  requestFoundation(`/analytics/insights/${name}${analyticsInsightsSearch(query)}`, { signal })

export const analyticsInsightsClient = {
  participation: async (query: AnalyticsInsightsQuery, signal?: AbortSignal) =>
    participationBreakdownSchema.parse(
      await get('participation', query, signal),
    ) as ParticipationBreakdown,
  indicatorTrends: async (query: AnalyticsInsightsQuery, signal?: AbortSignal) =>
    indicatorTrendsSchema.parse(await get('indicator-trends', query, signal)) as IndicatorTrends,
  budget: async (query: AnalyticsInsightsQuery, signal?: AbortSignal) =>
    budgetSummarySchema.parse(await get('budget', query, signal)) as BudgetSummary,
}
