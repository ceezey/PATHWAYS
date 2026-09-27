import {
  type MetricObservation,
  type RuleMetricKey,
  conditionIdSchema,
  decimalSchema,
  metricCellSchema,
  metricObservationSchema,
  metricReasons,
  uuidSchema,
} from '@/features/analytics/rules-validation'
import {
  indicatorProgress,
  isCalendarDate,
  normalizeMetricDecimal,
  numericKinds,
  metricCellSchema as sharedCellSchema,
  numericMetric as sharedNumericMetric,
} from '@pathways/shared'
import { z } from 'zod'

const scopeSchema = z.object({ organizationId: uuidSchema, projectId: uuidSchema }).strict()
const instant = z.string().datetime({ offset: true })
const revision = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/)
type Cell = MetricObservation['cell']
function numericMetric(value: string): Cell {
  return metricCellSchema.parse(sharedNumericMetric(value))
}
const unavailable = (reason: Cell['reason'], state: Cell['state'] = 'MISSING'): Cell => ({
  state,
  value: null,
  reason,
})
function safeCell(input: unknown): Cell {
  const parsed = sharedCellSchema.safeParse(input)
  if (!parsed.success) return unavailable('INVALID_METRIC')
  const cell = parsed.data
  if (cell.state === 'SUPPRESSED') return unavailable('SUPPRESSED', 'SUPPRESSED')
  if (cell.value === null)
    return unavailable(
      metricReasons.includes(cell.reason as (typeof metricReasons)[number])
        ? (cell.reason as Cell['reason'])
        : 'NOT_APPLICABLE',
      cell.state,
    )
  return numericMetric(cell.value)
}
const indicatorInputSchema = z
  .object({
    scope: scopeSchema,
    conditionId: conditionIdSchema,
    asOf: instant,
    metric: z.enum(['INDICATOR_CURRENT_VALUE', 'INDICATOR_PROGRESS_PERCENT']),
    indicator: z
      .object({
        organizationId: uuidSchema,
        projectId: uuidSchema,
        id: uuidSchema,
        revision,
        status: z.enum(['ACTIVE', 'ARCHIVED', 'LEGACY_REVIEW_REQUIRED']),
        mode: z.enum(['MANUAL', 'DERIVED']).nullable(),
        recipe: z.string().max(80).nullable(),
        numericKind: z.enum(numericKinds).nullable(),
        unitLabel: z.string().max(80).nullable().default(null),
        direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'DESCRIPTIVE']).nullable(),
        baseline: decimalSchema.nullable(),
        target: decimalSchema.nullable(),
        current: z.unknown(),
      })
      .strict(),
  })
  .strict()

/** Input is a projection from an already scoped provider, never a beneficiary/form payload. */
export function indicatorObservation(input: unknown): MetricObservation {
  const { scope, conditionId, asOf, metric, indicator } = indicatorInputSchema.parse(input)
  if (indicator.organizationId !== scope.organizationId || indicator.projectId !== scope.projectId)
    throw new Error('Indicator scope does not match the evaluation project.')
  const supported =
    (indicator.mode === 'MANUAL' && indicator.recipe === null) ||
    (indicator.mode === 'DERIVED' &&
      indicator.recipe === 'ACTIVITY_COMPLETION_PERCENTAGE' &&
      indicator.numericKind === 'PERCENTAGE')
  let cell: Cell
  let current: Cell | null = null
  if (!supported) cell = unavailable('UNSUPPORTED_SOURCE')
  else if (indicator.status !== 'ACTIVE') cell = unavailable('LEGACY_REVIEW_REQUIRED')
  else {
    cell = safeCell(indicator.current)
    if (cell.value !== null) {
      try {
        if (!indicator.numericKind) throw new Error('Legacy numeric kind.')
        cell = numericMetric(normalizeMetricDecimal(cell.value, indicator.numericKind))
      } catch {
        cell = unavailable('INVALID_METRIC')
      }
    }
    current = cell
    if (metric === 'INDICATOR_PROGRESS_PERCENT' && cell.state !== 'SUPPRESSED')
      cell = indicator.direction
        ? safeCell(
            indicatorProgress(cell, indicator.baseline, indicator.target, indicator.direction),
          )
        : unavailable('BASELINE_TARGET_DIRECTION_REQUIRED', 'NOT_APPLICABLE')
  }
  return metricObservationSchema.parse({
    ...scope,
    conditionId,
    asOf,
    metric,
    indicatorId: indicator.id,
    cell,
    calculation:
      cell.value === null || current?.value === null || current === null
        ? null
        : {
            kind: 'INDICATOR',
            mode: indicator.mode,
            recipe: indicator.recipe,
            numericKind: indicator.numericKind,
            unitLabel: indicator.unitLabel,
            direction: indicator.direction,
            baseline: indicator.baseline,
            target: indicator.target,
            current: current.value,
          },
    source:
      cell.value === null
        ? null
        : {
            kind:
              indicator.mode === 'MANUAL' ? 'MANUAL_INDICATOR' : 'ACTIVITY_COMPLETION_INDICATOR',
            recordId: indicator.id,
            revision: indicator.revision,
          },
  })
}

const dateInput = z.string().max(10).nullable()
function calendarDays(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
}
function timelineCells(
  start: string | null,
  end: string | null,
  date: string,
): {
  PROJECT_TIMELINE_ELAPSED_PERCENT: Cell
  PROJECT_REMAINING_DAYS: Cell
  PROJECT_OVERDUE_DAYS: Cell
} {
  let reason: Cell['reason'] = null
  if (start === null || end === null) reason = 'MISSING_DATES'
  else if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) reason = 'INVALID_DATES'
  if (reason)
    return {
      PROJECT_TIMELINE_ELAPSED_PERCENT: unavailable(reason),
      PROJECT_REMAINING_DAYS: unavailable(reason),
      PROJECT_OVERDUE_DAYS: unavailable(reason),
    }
  // Validation above proves both dates exist. Same-day projects have no elapsed-ratio denominator.
  const remaining = calendarDays(date, end as string)
  const duration = calendarDays(start as string, end as string)
  const elapsed = Math.max(0, calendarDays(start as string, date))
  return {
    PROJECT_TIMELINE_ELAPSED_PERCENT:
      duration === 0
        ? unavailable('ZERO_DENOMINATOR')
        : safeCell(
            indicatorProgress(
              numericMetric(String(elapsed)),
              '0',
              String(duration),
              'HIGHER_IS_BETTER',
            ),
          ),
    PROJECT_REMAINING_DAYS: numericMetric(String(remaining)),
    PROJECT_OVERDUE_DAYS: numericMetric(String(Math.max(0, -remaining))),
  }
}
const timelineInputSchema = z
  .object({
    scope: scopeSchema,
    conditionId: conditionIdSchema,
    asOf: instant,
    reportingDate: z.string().refine(isCalendarDate),
    projectStatus: z
      .enum(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'])
      .default('PLANNED'),
    projectArchived: z.boolean().default(false),
    revision,
    metric: z.enum([
      'PROJECT_TIMELINE_ELAPSED_PERCENT',
      'PROJECT_REMAINING_DAYS',
      'PROJECT_OVERDUE_DAYS',
    ]),
    startDate: dateInput,
    endDate: dateInput,
  })
  .strict()

/** Entered test dates use the approved business calendar; no live project authority is read. */
export function timelineObservation(input: unknown): MetricObservation {
  const {
    scope,
    conditionId,
    asOf,
    reportingDate,
    projectStatus,
    projectArchived,
    metric,
    startDate,
    endDate,
    revision: sourceRevision,
  } = timelineInputSchema.parse(input)
  return metricObservationSchema.parse({
    ...scope,
    conditionId,
    asOf,
    metric,
    cell:
      projectArchived || !['PLANNED', 'ONGOING'].includes(projectStatus)
        ? unavailable('NOT_APPLICABLE', 'NOT_APPLICABLE')
        : timelineCells(startDate, endDate, reportingDate)[metric],
    calculation: {
      kind: 'PROJECT_TIMELINE',
      projectStatus,
      projectArchived,
      reportingDate,
      startDate: startDate !== null && isCalendarDate(startDate) ? startDate : null,
      endDate: endDate !== null && isCalendarDate(endDate) ? endDate : null,
    },
    source: { kind: 'PROJECT', recordId: scope.projectId, revision: sourceRevision },
  })
}

const activitySchema = z
  .object({
    id: uuidSchema,
    organizationId: uuidSchema,
    projectId: uuidSchema,
    revision,
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED']),
    archived: z.boolean(),
    plannedEndDate: dateInput,
  })
  .strict()
const activityInputSchema = z
  .object({
    scope: scopeSchema,
    conditionId: conditionIdSchema,
    asOf: instant,
    reportingDate: z.string().refine(isCalendarDate),
    populationRevision: revision,
    metric: z.enum([
      'ACTIVITY_COMPLETION_PERCENT',
      'ACTIVITY_OVERDUE_COUNT',
      'ACTIVITY_OVERDUE_DAYS',
    ]),
    activityId: uuidSchema.optional(),
    activities: z.array(activitySchema).max(1000),
  })
  .strict()

/** Caller must supply the complete bounded population, not a paginated partial selection. */
export function activityObservation(input: unknown): MetricObservation {
  const data = activityInputSchema.parse(input)
  const { scope, conditionId, asOf, reportingDate, metric, activityId } = data
  if ((metric === 'ACTIVITY_OVERDUE_DAYS') !== Boolean(activityId))
    throw new Error('Bind an activity only for activity overdue days.')
  const ids = new Set<string>()
  for (const activity of data.activities) {
    if (
      activity.organizationId !== scope.organizationId ||
      activity.projectId !== scope.projectId ||
      ids.has(activity.id)
    )
      throw new Error('Activity population must contain unique project-scoped records.')
    ids.add(activity.id)
  }
  const population = data.activities.filter(
    (activity) => !activity.archived && activity.status !== 'CANCELLED',
  )
  const sourceActivity =
    metric === 'ACTIVITY_OVERDUE_DAYS'
      ? population.find((activity) => activity.id === activityId)
      : undefined
  let cell: Cell
  if (metric === 'ACTIVITY_COMPLETION_PERCENT')
    cell =
      population.length === 0
        ? unavailable('EMPTY_POPULATION')
        : safeCell(
            indicatorProgress(
              numericMetric(
                String(population.filter((activity) => activity.status === 'COMPLETED').length),
              ),
              '0',
              String(population.length),
              'HIGHER_IS_BETTER',
            ),
          )
  else {
    const applicable =
      metric === 'ACTIVITY_OVERDUE_DAYS' ? (sourceActivity ? [sourceActivity] : []) : population
    if (applicable.length === 0) cell = unavailable('EMPTY_POPULATION')
    else if (
      applicable.some(
        (activity) =>
          activity.status !== 'COMPLETED' &&
          (activity.plannedEndDate === null || !isCalendarDate(activity.plannedEndDate)),
      )
    )
      cell = unavailable('MISSING_DATES')
    else {
      const delays = applicable.map((activity) =>
        activity.status === 'COMPLETED'
          ? 0
          : Math.max(0, calendarDays(activity.plannedEndDate as string, reportingDate)),
      )
      cell = numericMetric(
        String(
          metric === 'ACTIVITY_OVERDUE_DAYS' ? delays[0] : delays.filter((days) => days > 0).length,
        ),
      )
    }
  }
  return metricObservationSchema.parse({
    ...scope,
    conditionId,
    asOf,
    metric,
    ...(activityId ? { activityId } : {}),
    cell,
    calculation:
      metric === 'ACTIVITY_OVERDUE_DAYS' && !sourceActivity
        ? null
        : {
            kind: 'ACTIVITY_POPULATION',
            reportingDate,
            members: (sourceActivity ? [sourceActivity] : population)
              .map((member) => ({
                id: member.id,
                revision: member.revision,
                status: member.status,
                plannedEndDate:
                  member.plannedEndDate !== null && isCalendarDate(member.plannedEndDate)
                    ? member.plannedEndDate
                    : null,
              }))
              .sort((left, right) => left.id.localeCompare(right.id)),
          },
    source: {
      kind: metric === 'ACTIVITY_OVERDUE_DAYS' ? 'ACTIVITY' : 'ACTIVITY_POPULATION',
      recordId: activityId ?? scope.projectId,
      revision: sourceActivity?.revision ?? data.populationRevision,
    },
  })
}

export const supportedInitialMetrics: readonly RuleMetricKey[] = [
  'INDICATOR_CURRENT_VALUE',
  'INDICATOR_PROGRESS_PERCENT',
  'PROJECT_TIMELINE_ELAPSED_PERCENT',
  'PROJECT_REMAINING_DAYS',
  'PROJECT_OVERDUE_DAYS',
  'ACTIVITY_COMPLETION_PERCENT',
  'ACTIVITY_OVERDUE_COUNT',
  'ACTIVITY_OVERDUE_DAYS',
]
