import {
  isCalendarDate,
  normalizeMetricDecimal,
  numericKinds,
  scaledDecimal,
} from '@pathways/shared'
import { z } from 'zod'

export const RULE_CONTRACT_VERSION = 'f10.v1' as const
export const MAX_GROUP_DEPTH = 4
export const MAX_CONDITIONS = 32
export const ruleMetrics = [
  'INDICATOR_CURRENT_VALUE',
  'INDICATOR_PROGRESS_PERCENT',
  'PROJECT_TIMELINE_ELAPSED_PERCENT',
  'PROJECT_REMAINING_DAYS',
  'PROJECT_OVERDUE_DAYS',
  'ACTIVITY_COMPLETION_PERCENT',
  'ACTIVITY_OVERDUE_COUNT',
  'ACTIVITY_OVERDUE_DAYS',
] as const
export type RuleMetricKey = (typeof ruleMetrics)[number]
export const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
export const decimalSchema = z
  .string()
  .max(20)
  .refine((value) => {
    try {
      scaledDecimal(value)
      return true
    } catch {
      return false
    }
  }, 'Use an exact decimal with at most 14 integer and 4 fractional digits.')
export const conditionIdSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
export const operators = ['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const
export type RuleCondition = {
  kind: 'CONDITION'
  id: string
  metric: RuleMetricKey
  operator: (typeof operators)[number]
  threshold: string
  thresholdMaximum?: string
  indicatorId?: string
  activityId?: string
}
export type RuleGroup = { kind: 'GROUP'; mode: 'AND' | 'OR'; children: RuleNode[] }
export type RuleNode = RuleCondition | RuleGroup

export function validateMetricDomain(metric: RuleMetricKey, value: string) {
  if (metric === 'ACTIVITY_COMPLETION_PERCENT') normalizeMetricDecimal(value, 'PERCENTAGE')
  if (['PROJECT_TIMELINE_ELAPSED_PERCENT', 'PROJECT_OVERDUE_DAYS'].includes(metric))
    normalizeMetricDecimal(value, 'NON_NEGATIVE')
  if (['ACTIVITY_OVERDUE_COUNT', 'ACTIVITY_OVERDUE_DAYS'].includes(metric))
    normalizeMetricDecimal(value, 'COUNT')
  if (['PROJECT_REMAINING_DAYS', 'PROJECT_OVERDUE_DAYS'].includes(metric)) {
    if (scaledDecimal(value) % 10000n !== 0n) throw new Error('Days must be whole numbers.')
  }
}

const conditionSchema: z.ZodType<RuleCondition> = z
  .object({
    kind: z.literal('CONDITION'),
    id: conditionIdSchema,
    metric: z.enum(ruleMetrics),
    operator: z.enum(operators),
    threshold: decimalSchema,
    thresholdMaximum: decimalSchema.optional(),
    indicatorId: uuidSchema.optional(),
    activityId: uuidSchema.optional(),
  })
  .strict()
  .superRefine((condition, ctx) => {
    const indicator = condition.metric.startsWith('INDICATOR_')
    const activity = condition.metric === 'ACTIVITY_OVERDUE_DAYS'
    if (indicator !== Boolean(condition.indicatorId) || activity !== Boolean(condition.activityId))
      ctx.addIssue({ code: 'custom', message: 'Bind exactly the record required by the metric.' })
    if ((condition.operator === 'BETWEEN') !== (condition.thresholdMaximum !== undefined))
      ctx.addIssue({ code: 'custom', message: 'Only BETWEEN requires an upper threshold.' })
    if (condition.thresholdMaximum !== undefined) {
      try {
        if (scaledDecimal(condition.threshold) > scaledDecimal(condition.thresholdMaximum))
          ctx.addIssue({ code: 'custom', message: 'Threshold bounds must be ordered.' })
      } catch {
        // Decimal validation already reports malformed thresholds.
      }
    }
    for (const value of [condition.threshold, condition.thresholdMaximum]) {
      if (value === undefined) continue
      try {
        validateMetricDomain(condition.metric, value)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Threshold is outside the metric domain.' })
      }
    }
  })
const nodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    conditionSchema,
    z
      .object({
        kind: z.literal('GROUP'),
        mode: z.enum(['AND', 'OR']),
        children: z.array(nodeSchema).min(1).max(MAX_CONDITIONS),
      })
      .strict(),
  ]),
)

/** Bound work before recursive Zod validation, including cyclic non-JSON callers. */
export function parseRuleTree(input: unknown): RuleNode {
  const pending = [{ node: input, groups: 0 }]
  const seen = new WeakSet<object>()
  const ids = new Set<string>()
  let leaves = 0
  let nodes = 0
  while (pending.length > 0) {
    const entry = pending.pop()
    if (!entry || ++nodes > MAX_CONDITIONS * (MAX_GROUP_DEPTH + 1))
      throw new Error('Rule tree exceeds its node limit.')
    const node = entry.node
    if (!node || typeof node !== 'object' || Array.isArray(node) || seen.has(node))
      throw new Error('Rule tree must contain distinct condition or group objects.')
    seen.add(node)
    const candidate = node as Record<string, unknown>
    if (candidate.kind === 'GROUP') {
      const groups = entry.groups + 1
      if (
        groups > MAX_GROUP_DEPTH ||
        !Array.isArray(candidate.children) ||
        candidate.children.length === 0 ||
        candidate.children.length > MAX_CONDITIONS
      )
        throw new Error('Rule tree exceeds its group bounds.')
      for (const child of candidate.children) pending.push({ node: child, groups })
    } else if (candidate.kind === 'CONDITION') {
      if (++leaves > MAX_CONDITIONS) throw new Error('Rule tree exceeds its condition limit.')
      if (typeof candidate.id !== 'string' || ids.has(candidate.id))
        throw new Error('Condition identifiers must be distinct.')
      ids.add(candidate.id)
    } else throw new Error('Unknown rule node kind.')
  }
  const parsed = nodeSchema.safeParse(input)
  if (!parsed.success) throw new Error('Invalid typed rule conditions.')
  return parsed.data
}

export const recommendationSchema = z
  .object({
    id: uuidSchema,
    title: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(2000),
  })
  .strict()
export const ruleDefinitionSchema = z
  .object({
    organizationId: uuidSchema,
    projectId: uuidSchema,
    ruleId: uuidSchema,
    version: z.number().int().min(1).max(2147483647),
    name: z.string().trim().min(1).max(160),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    conditions: z.unknown().transform((input, ctx): RuleNode => {
      try {
        return parseRuleTree(input)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid bounded rule tree.' })
        return z.NEVER
      }
    }),
    recommendations: z.array(recommendationSchema).min(1).max(10),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (new Set(rule.recommendations.map((item) => item.id)).size !== rule.recommendations.length)
      ctx.addIssue({ code: 'custom', message: 'Recommendation identifiers must be distinct.' })
  })
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>

export const metricReasons = [
  'NO_MEASUREMENT',
  'UNSUPPORTED_SOURCE',
  'MISSING_DATES',
  'INVALID_DATES',
  'ZERO_DENOMINATOR',
  'EMPTY_POPULATION',
  'SUPPRESSED',
  'NOT_APPLICABLE',
  'LEGACY_REVIEW_REQUIRED',
  'INVALID_METRIC',
  'BELOW_REPRESENTABLE_PRECISION',
  'PROGRESS_OUT_OF_RANGE',
  'BASELINE_TARGET_DIRECTION_REQUIRED',
  'DIRECTION_CONFLICT',
] as const
export const metricCellSchema = z
  .object({
    state: z.enum(['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED']),
    value: decimalSchema.nullable(),
    reason: z.enum(metricReasons).nullable(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    const visible = cell.state === 'AVAILABLE' || cell.state === 'ZERO'
    if (
      visible !== (cell.value !== null) ||
      (visible && cell.reason !== null) ||
      (!visible && cell.reason === null) ||
      (cell.state === 'ZERO' && cell.value !== '0') ||
      (cell.state === 'AVAILABLE' && cell.value !== null && /^-?0(?:\.0+)?$/.test(cell.value))
    )
      ctx.addIssue({ code: 'custom', message: 'Metric state and value must agree.' })
  })
const calendarDateSchema = z.string().refine(isCalendarDate)
const calculationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('INDICATOR'),
      mode: z.enum(['MANUAL', 'DERIVED']),
      recipe: z.literal('ACTIVITY_COMPLETION_PERCENTAGE').nullable(),
      numericKind: z.enum(numericKinds),
      unitLabel: z.string().max(80).nullable(),
      direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']).nullable(),
      baseline: decimalSchema.nullable(),
      target: decimalSchema.nullable(),
      current: decimalSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('PROJECT_TIMELINE'),
      reportingDate: calendarDateSchema,
      startDate: calendarDateSchema.nullable(),
      endDate: calendarDateSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ACTIVITY_POPULATION'),
      reportingDate: calendarDateSchema,
      members: z
        .array(
          z
            .object({
              id: uuidSchema,
              revision: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
              status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED']),
              plannedEndDate: calendarDateSchema.nullable(),
            })
            .strict(),
        )
        .max(1000),
    })
    .strict(),
])
export const metricObservationSchema = z
  .object({
    conditionId: conditionIdSchema,
    organizationId: uuidSchema,
    projectId: uuidSchema,
    metric: z.enum(ruleMetrics),
    indicatorId: uuidSchema.optional(),
    activityId: uuidSchema.optional(),
    asOf: z.string().datetime({ offset: true }),
    cell: metricCellSchema,
    calculation: calculationSchema.nullable(),
    source: z
      .object({
        kind: z.enum([
          'MANUAL_INDICATOR',
          'ACTIVITY_COMPLETION_INDICATOR',
          'PROJECT',
          'ACTIVITY_POPULATION',
          'ACTIVITY',
        ]),
        recordId: uuidSchema,
        revision: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((observation, ctx) => {
    if (observation.cell.value !== null) {
      try {
        validateMetricDomain(observation.metric, observation.cell.value)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Observation is outside the metric domain.' })
      }
    }
    if (
      observation.cell.state === 'SUPPRESSED' &&
      (observation.source !== null || observation.calculation !== null)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Suppressed evidence must not include source references.',
      })
    if (observation.cell.value !== null && observation.source === null)
      ctx.addIssue({
        code: 'custom',
        message: 'Visible metrics require reproducible source evidence.',
      })
    if (observation.cell.value !== null && observation.calculation === null)
      ctx.addIssue({
        code: 'custom',
        message: 'Visible metrics require reproducible calculation inputs.',
      })
    const calculation = observation.calculation
    if (calculation?.kind === 'INDICATOR') {
      if (
        !observation.metric.startsWith('INDICATOR_') ||
        (calculation.mode === 'MANUAL' && calculation.recipe !== null) ||
        (calculation.mode === 'DERIVED' &&
          (calculation.recipe !== 'ACTIVITY_COMPLETION_PERCENTAGE' ||
            calculation.numericKind !== 'PERCENTAGE'))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Indicator calculation uses an unsupported source definition.',
        })
    } else if (
      calculation?.kind === 'PROJECT_TIMELINE' &&
      !observation.metric.startsWith('PROJECT_')
    )
      ctx.addIssue({ code: 'custom', message: 'Timeline calculation does not match the metric.' })
    else if (calculation?.kind === 'ACTIVITY_POPULATION') {
      if (
        !observation.metric.startsWith('ACTIVITY_') ||
        new Set(calculation.members.map((member) => member.id)).size !==
          calculation.members.length ||
        (observation.metric === 'ACTIVITY_OVERDUE_DAYS' &&
          (calculation.members.length !== 1 ||
            calculation.members[0]?.id !== observation.activityId))
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Activity calculation does not match its metric population.',
        })
    }
  })
export type MetricObservation = z.infer<typeof metricObservationSchema>
