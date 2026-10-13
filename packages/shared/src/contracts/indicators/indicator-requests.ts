import { z } from 'zod'
import { type MetricRecipe, metricRecipes } from '../../monitoring/metric-cell'
import { date, decimal, uuid } from '../../monitoring/metric-fields'
import {
  indicatorProgress,
  normalizeMetricDecimal,
  numericKinds,
  validateMetricPeriod,
} from '../../monitoring/metric-math'

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

export const indicatorTypes = [
  'OUTPUT',
  'OUTCOME',
  'ACTIVITY',
  'BUDGET',
  'TIMELINE',
  'PARTICIPATION',
  'SURVEY_SCORE',
] as const
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
  // Classification label only; omitted means OUTPUT, the column default.
  indicatorType: z.enum(indicatorTypes).optional(),
}
const draftDefinitionSchema = z.object(definitionFields).strict()
const validateIndicatorDefinition = (
  input: z.infer<typeof draftDefinitionSchema>,
  ctx: z.RefinementCtx,
) => {
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
}
export const createIndicatorDraftRequest = draftDefinitionSchema.superRefine(
  validateIndicatorDefinition,
)
export type CreateIndicatorDraftRequest = z.infer<typeof createIndicatorDraftRequest>
export const createIndicatorRequest = z
  .object({ ...definitionFields, clientMutationId: uuid })
  .strict()
  .superRefine(validateIndicatorDefinition)
export type CreateIndicatorRequest = z.infer<typeof createIndicatorRequest>
/** Library entries are definition templates: no period, targets or project, activity or form IDs. */
export const libraryRecipes = metricRecipes.filter((recipe) => !recipe.startsWith('FORM_'))
export const createIndicatorLibraryEntryRequest = z
  .object({
    code: definitionFields.code,
    name: definitionFields.name,
    description: definitionFields.description,
    unitLabel: definitionFields.unitLabel,
    dataSource: definitionFields.dataSource,
    mode: definitionFields.mode,
    numericKind: definitionFields.numericKind,
    direction: definitionFields.direction,
    displayPrecision: definitionFields.displayPrecision,
    recipe: z.enum(libraryRecipes as [MetricRecipe, ...MetricRecipe[]]).optional(),
    clientMutationId: uuid,
  })
  .strict()
  .superRefine(({ recipe, clientMutationId: _id, ...entry }, ctx) =>
    validateIndicatorDefinition(
      {
        ...entry,
        periodStart: '2000-01-01',
        periodEnd: '2000-12-31',
        baseline: null,
        target: null,
        binding: recipe ? { recipe } : undefined,
      },
      ctx,
    ),
  )
export type CreateIndicatorLibraryEntryRequest = z.infer<typeof createIndicatorLibraryEntryRequest>
/** Project-specific values supplied when a library definition is copied into a project. */
export const createIndicatorFromLibraryRequest = z
  .object({
    libraryEntryId: uuid,
    clientMutationId: uuid,
    periodStart: date,
    periodEnd: date,
    baseline: decimal.nullable(),
    target: decimal.nullable(),
  })
  .strict()
export type CreateIndicatorFromLibraryRequest = z.infer<typeof createIndicatorFromLibraryRequest>
/** Semantic fields are immutable: create a new code/definition for a different metric or period. */
export const updateIndicatorRequest = z
  .object({
    clientMutationId: uuid,
    name: definitionFields.name,
    description: definitionFields.description,
    expectedRevision: z.number().int().min(1),
  })
  .strict()
export type UpdateIndicatorRequest = z.infer<typeof updateIndicatorRequest>
export const archiveIndicatorRequest = z
  .object({ clientMutationId: uuid, expectedRevision: z.number().int().min(1) })
  .strict()
export type ArchiveIndicatorRequest = z.infer<typeof archiveIndicatorRequest>
export const recordIndicatorMeasurementRequest = z
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
export type RecordIndicatorMeasurementRequest = z.infer<typeof recordIndicatorMeasurementRequest>
