import { z } from 'zod'
import { metricCellSchema } from '../../metrics/metric-cell'
import { date, decimal, uuid } from '../../metrics/metric-fields'

export const DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION = 'analytics.descriptive.v1' as const

export const descriptiveAnalyticsViews = ['kpi', 'participation', 'survey', 'timeline'] as const
export type DescriptiveAnalyticsView = (typeof descriptiveAnalyticsViews)[number]

/**
 * One authorized project; the optional period applies to monitoring counts only.
 * `view` is optional and defaults to the combined (pre-existing) payload for callers
 * that have not adopted the per-view contract yet.
 */
export const descriptiveAnalyticsQuerySchema = z
  .object({
    projectId: uuid,
    periodStart: date.optional(),
    periodEnd: date.optional(),
    view: z.enum(descriptiveAnalyticsViews).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.periodStart) === Boolean(input.periodEnd), {
    message: 'Both period dates are required.',
  })
export type DescriptiveAnalyticsQuery = z.infer<typeof descriptiveAnalyticsQuerySchema>

export const descriptiveSections = [
  'ACTIVITY_STATE',
  'MILESTONE_STATE',
  'SADDD_SEX',
  'SADDD_AGE',
  'SADDD_DISABILITY',
] as const
export type DescriptiveSection = (typeof descriptiveSections)[number]

export const descriptiveDistributionRowSchema = z
  .object({
    section: z.enum(descriptiveSections),
    key: z.string().max(80),
    label: z.string().max(160),
    metric: metricCellSchema,
    /** Share of the visible section total; null whenever any cell in the section is not visible. */
    share: decimal.nullable(),
  })
  .strict()

export const descriptiveCountRowSchema = z
  .object({ key: z.string().max(80), label: z.string().max(160), metric: metricCellSchema })
  .strict()

export const descriptiveIndicatorSummarySchema = z
  .object({
    unitLabel: z.string().max(100).nullable(),
    numericKind: z.string().max(40).nullable(),
    indicatorCount: z.number().int().min(0).max(100),
    reportedCount: z.number().int().min(0).max(100),
    mean: decimal.nullable(),
    minimum: decimal.nullable(),
    maximum: decimal.nullable(),
  })
  .strict()

export const descriptiveAnalyticsSchema = z
  .object({
    contractVersion: z.literal(DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION),
    projectId: uuid,
    generatedAt: z.string().datetime({ offset: true }),
    monitoringPeriod: z
      .object({ periodStart: date, periodEnd: date, businessTimeZone: z.string().max(100) })
      .strict(),
    sadddPeriod: z.object({ periodStart: date.nullable(), periodEnd: date.nullable() }).strict(),
    sadddReleaseState: z.enum(['RELEASED', 'STALE', 'UNAVAILABLE']),
    privacy: z
      .object({
        threshold: z.literal(0),
        complementarySuppression: z.literal(false),
        source: z.literal('P06_SADDD_RELEASE'),
        beneficiaryRows: z.literal(false),
      })
      .strict(),
    counts: z.array(descriptiveCountRowSchema).max(10),
    distributions: z.array(descriptiveDistributionRowSchema).max(40),
    indicatorSummaries: z.array(descriptiveIndicatorSummarySchema).max(100),
  })
  .strict()
export type DescriptiveAnalytics = z.infer<typeof descriptiveAnalyticsSchema>
