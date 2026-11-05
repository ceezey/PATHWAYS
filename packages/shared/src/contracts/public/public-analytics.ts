import { z } from 'zod'

import { metricCellSchema } from '../../metrics/metric-cell'
import { participationBreakdownSchema } from '../analytics/analytics-insights'
import { timelineAnalyticsSchema } from '../analytics/timeline-analytics'
import { metricBucketSchema } from '../dashboards/metric-contract'
import { indicatorListResponse } from '../indicators/indicator-responses'
import { projectMapPlaceSchema } from '../projects/project-map'

// Live figures a published public page may show; none carries a name, budget or record-level row.
export const publicKpiResponse = z.object({ indicators: indicatorListResponse }).strict()
export const publicSadddResponse = z
  .object({
    total: metricCellSchema,
    sex: z.array(metricBucketSchema).max(5),
    age: z.array(metricBucketSchema).max(6),
    disability: z.array(metricBucketSchema).max(3),
  })
  .strict()
export const publicParticipationResponse = participationBreakdownSchema
export const publicTimelineResponse = timelineAnalyticsSchema
export const publicMapResponse = z
  .object({ places: z.array(projectMapPlaceSchema).max(20) })
  .strict()

// Body of GET public/projects/:projectId/analytics/:view, tagged by the requested view.
export const publicAnalyticsResponse = z.discriminatedUnion('view', [
  publicKpiResponse.extend({ view: z.literal('kpi') }),
  publicSadddResponse.extend({ view: z.literal('saddd') }),
  publicParticipationResponse.extend({ view: z.literal('participation') }),
  publicTimelineResponse.extend({ view: z.literal('timeline') }),
  publicMapResponse.extend({ view: z.literal('map') }),
])
export type PublicAnalyticsResponse = z.infer<typeof publicAnalyticsResponse>
