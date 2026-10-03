import { z } from 'zod'
import { isCalendarDate } from './metric-math'

const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')

export const ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'COMPLETED',
  'NOT_COMPLETED',
  'EXCUSED',
] as const

/** One authorized project; the optional period must be complete and ordered. */
export const analyticsInsightsQuerySchema = z
  .object({
    projectId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    periodStart: date.optional(),
    periodEnd: date.optional(),
  })
  .strict()
  .refine((input) => Boolean(input.periodStart) === Boolean(input.periodEnd), {
    message: 'Both period dates are required.',
  })
  .refine(
    (input) => !input.periodStart || !input.periodEnd || input.periodStart <= input.periodEnd,
    {
      message: 'The period start must not be after the period end.',
    },
  )
export type AnalyticsInsightsQuery = z.infer<typeof analyticsInsightsQuerySchema>

const cell = { count: z.number().int().nonnegative().nullable(), suppressed: z.boolean() }

export const participationBreakdownSchema = z
  .object({
    projectId: z.string().uuid(),
    total: z.number().int().nonnegative().nullable(),
    totalSuppressed: z.boolean(),
    byActivity: z.array(
      z.object({ activityId: z.string().uuid(), activityName: z.string(), ...cell }).strict(),
    ),
    byMonth: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), ...cell }).strict()),
    byAttendanceStatus: z.array(
      z.object({ status: z.enum(ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES), ...cell }).strict(),
    ),
  })
  .strict()
export type ParticipationBreakdown = z.infer<typeof participationBreakdownSchema>

export const indicatorTrendsSchema = z
  .object({
    projectId: z.string().uuid(),
    indicators: z.array(
      z
        .object({
          indicatorId: z.string().uuid(),
          name: z.string(),
          unit: z.string(),
          target: z.number().nullable(),
          points: z.array(
            z.object({ periodStart: date, periodEnd: date, value: z.number() }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
export type IndicatorTrends = z.infer<typeof indicatorTrendsSchema>

export const budgetSummarySchema = z
  .object({
    projectId: z.string().uuid(),
    currencies: z.array(
      z
        .object({
          currency: z.string().length(3),
          planned: z.number(),
          approved: z.number(),
          pending: z.number(),
          utilizationPercent: z.number().nullable(),
        })
        .strict(),
    ),
  })
  .strict()
export type BudgetSummary = z.infer<typeof budgetSummarySchema>
