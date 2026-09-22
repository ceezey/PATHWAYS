import { z } from 'zod'
import {
  type MetricCell,
  indicatorProgress,
  isCalendarDate,
  normalizeMetricDecimal,
  numericKinds,
  validateMetricPeriod,
} from './metric-math'
export * from './metric-math'

export const P06_CONTRACT_VERSION = 'p06.v1' as const
export const sadddAgeBands = ['0-9', '10-14', '15-17', '18-24', '25+', 'Unknown'] as const
export const metricRecipes = [
  'PARTICIPATION_RECORD_COUNT',
  'DISTINCT_ATTENDING_INDIVIDUALS',
  'ATTENDANCE_RECORDS_PER_INDIVIDUAL',
  'EFFECTIVE_JOURNEY_EVENT_COUNT',
  'FORM_NUMERIC_SUM',
  'FORM_NUMERIC_AVERAGE',
  'ACTIVITY_COMPLETION_PERCENTAGE',
] as const
export type MetricRecipe = (typeof metricRecipes)[number]
const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/)
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
export const metricCellSchema = z
  .object({
    state: z.enum(['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED']),
    value: decimal.nullable(),
    reason: z.string().max(100).nullable(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    const visible = cell.state === 'AVAILABLE' || cell.state === 'ZERO'
    if (visible !== (cell.value !== null) || (visible && cell.reason !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Unavailable metrics must not contain a value.' })
    }
    if (cell.state === 'ZERO' && cell.value !== '0')
      ctx.addIssue({ code: 'custom', message: 'ZERO requires an exact zero.' })
    if (cell.state === 'AVAILABLE' && cell.value !== null && Number(cell.value) === 0) {
      ctx.addIssue({ code: 'custom', message: 'An exact zero requires ZERO state.' })
    }
  })

export const indicatorBindingSchema = z
  .object({
    recipe: z.enum(metricRecipes),
    activityId: uuid.optional(),
    formId: uuid.optional(),
    formVersion: z.number().int().min(1).max(2147483647).optional(),
    fieldId: uuid.optional(),
  })
  .strict()
  .superRefine((binding, ctx) => {
    const formMetric =
      binding.recipe === 'FORM_NUMERIC_SUM' || binding.recipe === 'FORM_NUMERIC_AVERAGE'
    if (
      formMetric &&
      (!binding.formId || !binding.fieldId || !binding.formVersion || binding.activityId)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Form metrics require an exact form ID/version and numeric field ID only.',
      })
    }
    if (!formMetric && (binding.formId || binding.fieldId || binding.formVersion)) {
      ctx.addIssue({ code: 'custom', message: 'This metric cannot bind to form fields.' })
    }
    if (binding.recipe === 'ACTIVITY_COMPLETION_PERCENTAGE' && binding.activityId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Activity completion uses the project activity population, not one activity.',
      })
    }
  })
export type IndicatorBinding = z.infer<typeof indicatorBindingSchema>

const definitionFields = {
  code: z.string().regex(/^[A-Z][A-Z0-9_\-]{1,39}$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  unitLabel: z.string().trim().min(1).max(80),
  dataSource: z.string().trim().min(1).max(300),
  mode: z.enum(['MANUAL', 'DERIVED']),
  numericKind: z.enum(numericKinds),
  direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']),
  displayPrecision: z.number().int().min(0).max(4),
  periodStart: date,
  periodEnd: date,
  baseline: decimal.nullable(),
  target: decimal.nullable(),
  binding: indicatorBindingSchema.optional(),
}
export const createIndicatorSchema = z
  .object(definitionFields)
  .strict()
  .superRefine((input, ctx) => {
    try {
      validateMetricPeriod(input.periodStart, input.periodEnd)
      for (const value of [input.baseline, input.target])
        if (value !== null) normalizeMetricDecimal(value, input.numericKind)
      if (input.numericKind === 'COUNT' && input.displayPrecision !== 0)
        throw new Error('Counts use zero display decimal places.')
      if ((input.mode === 'DERIVED') !== Boolean(input.binding))
        throw new Error('Exactly derived indicators require a binding.')
      const recipe = input.binding?.recipe
      if (
        recipe &&
        [
          'PARTICIPATION_RECORD_COUNT',
          'DISTINCT_ATTENDING_INDIVIDUALS',
          'EFFECTIVE_JOURNEY_EVENT_COUNT',
        ].includes(recipe) &&
        input.numericKind !== 'COUNT'
      )
        throw new Error('This recipe produces a count.')
      if (recipe === 'ATTENDANCE_RECORDS_PER_INDIVIDUAL' && input.numericKind !== 'RATIO')
        throw new Error('This recipe produces an uncapped non-negative ratio.')
      if (recipe === 'ACTIVITY_COMPLETION_PERCENTAGE' && input.numericKind !== 'PERCENTAGE')
        throw new Error('This recipe produces a percentage.')
      if (input.baseline !== null && input.target !== null && input.direction !== 'DESCRIPTIVE') {
        const progress = indicatorProgress(
          { state: 'AVAILABLE', value: '1', reason: null },
          input.baseline,
          input.target,
          input.direction,
        )
        if (progress.reason === 'DIRECTION_CONFLICT')
          throw new Error('Target conflicts with the selected direction.')
      }
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid metric definition.',
      })
    }
  })
export type CreateIndicatorInput = z.infer<typeof createIndicatorSchema>
/** Semantic fields are immutable: create a new code/definition for a different metric or period. */
export const updateIndicatorSchema = z
  .object({
    name: definitionFields.name,
    description: definitionFields.description,
    expectedRevision: z.number().int().min(1),
  })
  .strict()
export type UpdateIndicatorInput = z.infer<typeof updateIndicatorSchema>
export const archiveIndicatorSchema = z
  .object({ expectedRevision: z.number().int().min(1) })
  .strict()
export const manualMeasurementSchema = z
  .object({
    clientMeasurementId: uuid,
    periodStart: date,
    periodEnd: date,
    value: decimal,
    source: z.string().trim().min(1).max(300),
    note: z.string().trim().max(1000).optional(),
    correctsMeasurementId: uuid.optional(),
    correctionReason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    try {
      validateMetricPeriod(input.periodStart, input.periodEnd)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid measurement period.' })
    }
    if (Boolean(input.correctsMeasurementId) !== Boolean(input.correctionReason))
      ctx.addIssue({
        code: 'custom',
        message: 'A correction requires the previous measurement ID and a reason.',
      })
  })
export type ManualMeasurementInput = z.infer<typeof manualMeasurementSchema>

export const monitoringIndicatorSchema = z
  .object({
    id: uuid,
    projectId: uuid,
    code: z.string().max(100),
    name: z.string().max(250),
    description: z.string().nullable(),
    unitLabel: z.string().nullable(),
    dataSource: z.string().nullable(),
    mode: z.enum(['MANUAL', 'DERIVED']).nullable(),
    numericKind: z.enum(numericKinds).nullable(),
    direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']).nullable(),
    displayPrecision: z.number().int().min(0).max(4).nullable(),
    periodStart: date.nullable(),
    periodEnd: date.nullable(),
    baseline: decimal.nullable(),
    target: decimal.nullable(),
    current: metricCellSchema,
    progress: metricCellSchema,
    binding: indicatorBindingSchema.nullable(),
    measurementId: uuid.nullable(),
    measuredAt: z.string().datetime({ offset: true }).nullable(),
    measurementSource: z.string().max(300).nullable(),
    revision: z.number().int().min(1),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'LEGACY_REVIEW_REQUIRED']),
    contractVersion: z.literal(P06_CONTRACT_VERSION),
  })
  .strict()
export type MonitoringIndicator = z.infer<typeof monitoringIndicatorSchema>
export const monitoringIndicatorListSchema = z.array(monitoringIndicatorSchema).max(100)

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
    indicators: monitoringIndicatorListSchema,
    indicatorNote: z.string().max(300),
  })
  .strict()
export type MonitoringDashboard = z.infer<typeof monitoringDashboardSchema>
export function formatMetricCell(cell: MetricCell): string {
  if (cell.value !== null) return cell.value
  return cell.state === 'SUPPRESSED'
    ? 'Suppressed'
    : cell.state === 'NOT_APPLICABLE'
      ? 'Not applicable'
      : 'Not available'
}
