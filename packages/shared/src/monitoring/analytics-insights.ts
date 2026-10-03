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
const amount = z.number().finite().nonnegative()
const unique = <T>(items: T[], key: (item: T) => string) =>
  new Set(items.map(key)).size === items.length
const ascending = (values: string[], strict: boolean) =>
  values.every((value, i) => i === 0 || (strict ? values[i - 1] < value : values[i - 1] <= value))

export const participationBreakdownSchema = z
  .object({
    projectId: z.string().uuid(),
    total: z.number().int().nonnegative().nullable(),
    totalSuppressed: z.boolean(),
    byActivity: z
      .array(
        z.object({ activityId: z.string().uuid(), activityName: z.string(), ...cell }).strict(),
      )
      .max(1000)
      .refine((rows) => unique(rows, (row) => row.activityId), 'Activity ids must be unique.'),
    byMonth: z
      .array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), ...cell }).strict())
      .max(1200)
      .refine(
        (rows) =>
          ascending(
            rows.map((row) => row.month),
            true,
          ),
        'Months must ascend.',
      ),
    byAttendanceStatus: z
      .array(z.object({ status: z.enum(ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES), ...cell }).strict())
      .length(ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES.length)
      .refine((rows) => unique(rows, (row) => row.status), 'Statuses must be unique.'),
  })
  .strict()
export type ParticipationBreakdown = z.infer<typeof participationBreakdownSchema>

const trendPoint = z
  .object({ periodStart: date, periodEnd: date, value: z.number().finite() })
  .strict()
  .refine((point) => point.periodStart <= point.periodEnd, 'Point start must not be after end.')

export const indicatorTrendsSchema = z
  .object({
    projectId: z.string().uuid(),
    indicators: z
      .array(
        z
          .object({
            indicatorId: z.string().uuid(),
            name: z.string(),
            unit: z.string(),
            target: z.number().finite().nullable(),
            points: z
              .array(trendPoint)
              .max(120)
              .refine(
                (points) =>
                  ascending(
                    points.map((point) => point.periodEnd),
                    false,
                  ),
                'Points must be ascending by period end.',
              ),
          })
          .strict(),
      )
      .max(50)
      .refine((rows) => unique(rows, (row) => row.indicatorId), 'Indicator ids must be unique.'),
  })
  .strict()
export type IndicatorTrends = z.infer<typeof indicatorTrendsSchema>

export const budgetSummarySchema = z
  .object({
    projectId: z.string().uuid(),
    currencies: z
      .array(
        z
          .object({
            currency: z.string().length(3),
            planned: amount,
            approved: amount,
            pending: amount,
            utilizationPercent: amount.nullable(),
          })
          .strict(),
      )
      .max(50)
      .refine((rows) => unique(rows, (row) => row.currency), 'Currencies must be unique.'),
  })
  .strict()
export type BudgetSummary = z.infer<typeof budgetSummarySchema>
