import {
  DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
  type DescriptiveAnalytics,
  type DescriptiveSection,
  type MetricCell,
  type MonitoringDashboard,
  type SadddDashboard,
  type SurveyAnalytics,
  TIMELINE_ANALYTICS_CONTRACT_VERSION,
  type TimelineAnalytics,
  milestoneCountsSchema,
  milestoneOnTimeFromCounts,
} from '@pathways/shared'
import { z } from 'zod'
import { activityAggregateCells, timelineObservation } from '../rules/rule-metrics'

type Bucket = { key: string; label: string; metric: MetricCell }
type Distribution = DescriptiveAnalytics['distributions'][number]

const visible = (cell: MetricCell) => cell.state === 'AVAILABLE' || cell.state === 'ZERO'

/** Locked SADDD RFC G4 threshold: 1-4 is suppressed; 0 and 5 or more stay visible. */
export const SMALL_CELL_THRESHOLD = 5

export function suppressSmallCount(metric: MetricCell): MetricCell {
  if (metric.state !== 'AVAILABLE' || metric.value === null) return metric
  const value = Number(metric.value)
  return value > 0 && value < SMALL_CELL_THRESHOLD
    ? { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    : metric
}

/** Four-decimal fixed output without trailing zeros; inputs are already bounded decimals. */
export function formatDescriptiveDecimal(value: number): string {
  const fixed = (Math.round(value * 10_000) / 10_000).toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

/**
 * Shares are derived only when every cell of the section is visible. A suppressed
 * or missing cell withholds all shares so no hidden value can be recovered by
 * subtraction (complementary suppression is preserved, never undone).
 */
function distribution(section: DescriptiveSection, buckets: readonly Bucket[]): Distribution[] {
  const allVisible = buckets.length > 0 && buckets.every((bucket) => visible(bucket.metric))
  const total = allVisible
    ? buckets.reduce((sum, bucket) => sum + Number(bucket.metric.value), 0)
    : 0
  return buckets.map((bucket) => ({
    section,
    key: bucket.key,
    label: bucket.label,
    metric: bucket.metric,
    share:
      allVisible && total > 0
        ? formatDescriptiveDecimal(Number(bucket.metric.value) / total)
        : null,
  }))
}

function indicatorSummaries(indicators: MonitoringDashboard['indicators']) {
  const groups = new Map<string, MonitoringDashboard['indicators']>()
  for (const indicator of indicators) {
    // Different units are never averaged together.
    const key = JSON.stringify([indicator.unitLabel, indicator.numericKind])
    const group = groups.get(key)
    if (group) group.push(indicator)
    else groups.set(key, [indicator])
  }
  return [...groups.values()].map((group) => {
    const values = group
      .filter((indicator) => visible(indicator.current))
      .map((indicator) => Number(indicator.current.value))
    return {
      unitLabel: group[0]?.unitLabel ?? null,
      numericKind: group[0]?.numericKind ?? null,
      indicatorCount: group.length,
      reportedCount: values.length,
      mean: values.length
        ? formatDescriptiveDecimal(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
      minimum: values.length ? formatDescriptiveDecimal(Math.min(...values)) : null,
      maximum: values.length ? formatDescriptiveDecimal(Math.max(...values)) : null,
    }
  })
}

/**
 * Builds descriptive statistics exclusively from the already-validated aggregate
 * contracts. SADDD cells arrive banded and suppressed by the p06_saddd release;
 * this function never receives Beneficiary rows.
 */
export function buildDescriptiveAnalytics(input: {
  projectId: string
  monitoring: MonitoringDashboard
  saddd: SadddDashboard | null
  generatedAt: string
}): DescriptiveAnalytics {
  const { monitoring, saddd } = input
  // Complementary suppression: a suppressed SADDD total also suppresses every
  // person-derived monitoring count so it cannot be reconstructed by subtraction.
  const sadddTotalHidden = saddd !== null && !visible(saddd.total)
  const person = (metric: MetricCell): MetricCell =>
    sadddTotalHidden && visible(metric) && metric.state !== 'ZERO'
      ? { state: 'SUPPRESSED', value: null, reason: 'COMPLEMENTARY_SUPPRESSION' }
      : suppressSmallCount(metric)
  const counts: DescriptiveAnalytics['counts'] = [
    {
      key: 'participationRecords',
      label: 'Participation records',
      metric: person(monitoring.participationRecords),
    },
    {
      key: 'attendingIndividuals',
      label: 'Attending individuals',
      metric: person(monitoring.attendingIndividuals),
    },
    {
      key: 'enrolledBeneficiaryRecords',
      label: 'Enrolled Beneficiary records',
      metric: person(monitoring.enrolledBeneficiaryRecords),
    },
    // The monitoring individual total duplicates the SADDD total, so it is
    // omitted whenever a SADDD release is present.
    ...(saddd
      ? []
      : [
          {
            key: 'enrolledIndividuals',
            label: 'Enrolled individuals',
            metric: person(monitoring.enrolledIndividuals),
          },
        ]),
    {
      key: 'indicatorDefinitions',
      label: 'Indicator definitions',
      metric: {
        state: monitoring.indicators.length ? 'AVAILABLE' : 'ZERO',
        value: String(monitoring.indicators.length),
        reason: null,
      },
    },
  ]
  if (saddd)
    counts.push({
      key: 'sadddTotal',
      label: 'SADDD individuals',
      metric: suppressSmallCount(saddd.total),
    })
  return {
    contractVersion: DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    monitoringPeriod: {
      periodStart: monitoring.periodStart,
      periodEnd: monitoring.periodEnd,
      businessTimeZone: monitoring.businessTimeZone,
    },
    sadddPeriod: {
      periodStart: saddd?.periodStart ?? null,
      periodEnd: saddd?.periodEnd ?? null,
    },
    sadddReleaseState: saddd?.releaseState ?? 'UNAVAILABLE',
    privacy: {
      threshold: 5,
      complementarySuppression: true,
      source: 'P06_SADDD_RELEASE',
      beneficiaryRows: false,
    },
    counts,
    distributions: [
      ...distribution('ACTIVITY_STATE', monitoring.activities),
      ...distribution('MILESTONE_STATE', monitoring.milestones),
      ...(saddd
        ? [
            ...distribution('SADDD_SEX', saddd.sex),
            ...distribution('SADDD_AGE', saddd.age),
            ...distribution('SADDD_DISABILITY', saddd.disability),
          ]
        : []),
    ],
    indicatorSummaries: indicatorSummaries(monitoring.indicators),
  }
}

function withReason(cell: MetricCell, from: string, to: string): MetricCell {
  return cell.reason === from ? { ...cell, reason: to } : cell
}

/**
 * Activity and milestone counts returned by the trusted
 * pathways.p10_f9_timeline_aggregate function. Counts only: no row or identifier.
 * `maxOverdueDays` is the SQL mirror of the largest per-activity overdue days and
 * is validated but not part of the timeline view contract.
 */
export const timelineAggregateSchema = z
  .object({
    activities: z
      .object({
        eligible: z.number().int().min(0),
        completed: z.number().int().min(0),
        overdue: z.number().int().min(0),
        missingDates: z.number().int().min(0),
        maxOverdueDays: z.number().int().min(0).nullable(),
      })
      .strict(),
    milestones: milestoneCountsSchema,
  })
  .strict()
export type TimelineAggregate = z.infer<typeof timelineAggregateSchema>

/**
 * Builds the timeline adherence view (analytics.descriptive.timeline.v1). Project
 * level elapsed/remaining/overdue days come from the project row through the rule
 * engine's pure timelineObservation; activity metrics come from database-side counts
 * through activityAggregateCells (the aggregate form of activityObservation), so the
 * two never drift. Reasons are remapped to the descriptive-analytics vocabulary
 * (NO_PROJECT_DATES/NO_ACTIVITIES) so callers see one consistent set of MISSING
 * reasons for this view.
 */
export function buildTimelineAnalytics(input: {
  projectId: string
  organizationId: string
  generatedAt: string
  reportingDate: string
  project: {
    status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
    archived: boolean
    startDate: string | null
    endDate: string | null
  }
  aggregate: TimelineAggregate
}): TimelineAnalytics {
  const aggregate = timelineAggregateSchema.parse(input.aggregate)
  const scope = { organizationId: input.organizationId, projectId: input.projectId }
  const timelineInput = {
    scope,
    conditionId: 'analytics-timeline-view',
    asOf: input.generatedAt,
    reportingDate: input.reportingDate,
    projectStatus: input.project.status,
    projectArchived: input.project.archived,
    revision: '1',
    startDate: input.project.startDate,
    endDate: input.project.endDate,
  }
  const elapsedPercent = withReason(
    timelineObservation({ ...timelineInput, metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT' }).cell,
    'MISSING_DATES',
    'NO_PROJECT_DATES',
  )
  const remainingDays = withReason(
    timelineObservation({ ...timelineInput, metric: 'PROJECT_REMAINING_DAYS' }).cell,
    'MISSING_DATES',
    'NO_PROJECT_DATES',
  )
  const overdueDays = withReason(
    timelineObservation({ ...timelineInput, metric: 'PROJECT_OVERDUE_DAYS' }).cell,
    'MISSING_DATES',
    'NO_PROJECT_DATES',
  )
  const { maxOverdueDays: _maxOverdueDays, ...activityCounts } = aggregate.activities
  const activityCells = activityAggregateCells(activityCounts)
  return {
    contractVersion: TIMELINE_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    reportingDate: input.reportingDate,
    elapsedPercent,
    remainingDays,
    overdueDays,
    activityCompletionPercent: withReason(
      activityCells.ACTIVITY_COMPLETION_PERCENT,
      'EMPTY_POPULATION',
      'NO_ACTIVITIES',
    ),
    activityOverdueCount: withReason(
      activityCells.ACTIVITY_OVERDUE_COUNT,
      'EMPTY_POPULATION',
      'NO_ACTIVITIES',
    ),
    milestoneOnTimePercent: milestoneOnTimeFromCounts(aggregate.milestones),
  }
}

/** Neutralizes spreadsheet formula prefixes and quotes every field. */
function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export type AnalyticsTable = Array<Array<string | number | null>>

/** Serializes an export table as quoted, formula-safe CSV. */
export function analyticsTableCsv(table: AnalyticsTable): string {
  return `${table.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}

/** Aggregate-only table: suppressed cells export as their state with an empty value. */
export function descriptiveAnalyticsTable(data: DescriptiveAnalytics): AnalyticsTable {
  const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
  const rows: Array<Array<string | number | null>> = [
    ...data.counts.map((row) => [
      'COUNT',
      row.key,
      row.label,
      row.metric.state,
      row.metric.value,
      null,
      row.metric.reason,
    ]),
    ...data.distributions.map((row) => [
      row.section,
      row.key,
      row.label,
      row.metric.state,
      row.metric.value,
      row.share,
      row.metric.reason,
    ]),
    ...data.indicatorSummaries.flatMap((row) => {
      const key = `${row.unitLabel ?? 'no-unit'}|${row.numericKind ?? 'no-kind'}`
      return [
        ['INDICATOR_SUMMARY', key, 'Indicator count', 'AVAILABLE', row.indicatorCount, null, null],
        ['INDICATOR_SUMMARY', key, 'Reported count', 'AVAILABLE', row.reportedCount, null, null],
        [
          'INDICATOR_SUMMARY',
          key,
          'Mean',
          row.mean ? 'AVAILABLE' : 'MISSING',
          row.mean,
          null,
          null,
        ],
        [
          'INDICATOR_SUMMARY',
          key,
          'Minimum',
          row.minimum ? 'AVAILABLE' : 'MISSING',
          row.minimum,
          null,
          null,
        ],
        [
          'INDICATOR_SUMMARY',
          key,
          'Maximum',
          row.maximum ? 'AVAILABLE' : 'MISSING',
          row.maximum,
          null,
          null,
        ],
      ]
    }),
  ]
  return [header, ...rows]
}

type SurveyMetricField = Exclude<keyof SurveyAnalytics['overall'], 'key' | 'label'>

/** Same header/marker convention as the combined CSV; one row per survey group cell. */
export function surveyAnalyticsTable(data: SurveyAnalytics): AnalyticsTable {
  const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
  const cells: Array<[SurveyMetricField, string]> = [
    ['pairs', 'Paired assessments'],
    ['meanPre', 'Mean PRE_TEST (%)'],
    ['meanPost', 'Mean POST_TEST (%)'],
    ['meanChange', 'Mean change (pp)'],
    ['improved', 'Improved'],
    ['same', 'Same'],
    ['declined', 'Declined'],
  ]
  const rows: Array<Array<string | number | null>> = [
    ...[data.overall, ...data.byActivity].flatMap((group) =>
      cells.map(([field, label]) => {
        const metric = group[field]
        return [
          'SURVEY',
          group.key,
          `${group.label} - ${label}`,
          metric.state,
          metric.value,
          null,
          metric.reason,
        ]
      }),
    ),
  ]
  return [header, ...rows]
}

type TimelineMetricField = Exclude<
  keyof TimelineAnalytics,
  'contractVersion' | 'projectId' | 'generatedAt' | 'reportingDate'
>

/** Same header/marker convention as the combined CSV; one row per timeline metric. */
export function timelineAnalyticsTable(data: TimelineAnalytics): AnalyticsTable {
  const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
  const cells: Array<[TimelineMetricField, string]> = [
    ['elapsedPercent', 'Timeline elapsed (%)'],
    ['remainingDays', 'Remaining days'],
    ['overdueDays', 'Overdue days'],
    ['activityCompletionPercent', 'Activity completion (%)'],
    ['activityOverdueCount', 'Overdue activities'],
    ['milestoneOnTimePercent', 'Milestones on time (%)'],
  ]
  const rows: Array<Array<string | number | null>> = cells.map(([field, label]) => {
    const metric = data[field]
    return ['TIMELINE', field, label, metric.state, metric.value, null, metric.reason]
  })
  return [header, ...rows]
}
