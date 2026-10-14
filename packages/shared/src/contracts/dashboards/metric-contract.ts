import { z } from 'zod'
import { P06_CONTRACT_VERSION, metricCellSchema } from '../../metrics/metric-cell'
import { date, uuid } from '../../metrics/metric-fields'
import { validateMetricPeriod } from '../../metrics/metric-math'
import { indicatorListResponse } from '../indicators/indicator-responses'

export const sadddAgeBands = ['0-9', '10-14', '15-17', '18-24', '25+', 'Unknown'] as const

export const dashboardQuerySchema = z
  .object({
    projectId: uuid.optional(),
    programId: uuid.optional(),
    periodStart: date.optional(),
    periodEnd: date.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.projectId && input.programId)
      ctx.addIssue({ code: 'custom', message: 'Choose a project or a program, not both.' })
    if (Boolean(input.periodStart) !== Boolean(input.periodEnd))
      ctx.addIssue({ code: 'custom', message: 'Both period dates are required.' })
    if (input.periodStart && input.periodEnd) {
      try {
        validateMetricPeriod(input.periodStart, input.periodEnd)
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : 'Invalid period.',
        })
      }
    }
  })

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

export const sadddQuerySchema = z
  .object({
    projectId: uuid,
  })
  .strict()

export type SadddQuery = z.infer<typeof sadddQuerySchema>

const bucket = z
  .object({ key: z.string().max(80), label: z.string().max(160), metric: metricCellSchema })
  .strict()

const contextFields = {
  contractVersion: z.literal(P06_CONTRACT_VERSION),
  periodStart: date,
  periodEnd: date,
  businessTimeZone: z.string().max(100),
  generatedAt: z.string().datetime({ offset: true }),
  refresh: z.literal('READ_TIME_NO_CACHE'),
}

export const sadddDashboardSchema = z
  .object({
    ...contextFields,
    periodStart: date.nullable(),
    periodEnd: date.nullable(),
    releaseState: z.enum(['RELEASED', 'STALE']),
    population: z.literal('DISTINCT_INDIVIDUALS_WITH_OVERLAPPING_ENROLLMENT'),
    demographicBasis: z.literal('CURRENT_PROFILE_NOT_HISTORICAL_SNAPSHOT'),
    privacy: z
      .object({
        threshold: z.literal(5),
        complementarySuppression: z.literal(true),
        policy: z.literal('FIXED_CLOSED_PROJECT_PERIOD_V1'),
        crossFilters: z.literal('PROJECT_ONLY_NO_CROSS_FILTERS'),
      })
      .strict(),
    total: metricCellSchema,
    sex: z.array(bucket).max(5),
    age: z.array(bucket).max(6),
    disability: z.array(bucket).max(3),
    completeness: z.array(bucket).max(6),
  })
  .strict()
export type SadddDashboard = z.infer<typeof sadddDashboardSchema>
export const monitoringDashboardSchema = z
  .object({
    ...contextFields,
    projects: z
      .array(z.object({ id: uuid, code: z.string(), title: z.string() }).strict())
      .max(100),
    scopeProjectCount: z.number().int().min(0).max(100),
    activities: z.array(bucket).max(5),
    milestones: z.array(bucket).max(4),
    participationRecords: metricCellSchema,
    attendingIndividuals: metricCellSchema,
    enrolledBeneficiaryRecords: metricCellSchema,
    enrolledIndividuals: metricCellSchema,
    indicators: indicatorListResponse,
    indicatorNote: z.string().max(300),
  })
  .strict()
export type MonitoringDashboard = z.infer<typeof monitoringDashboardSchema>
