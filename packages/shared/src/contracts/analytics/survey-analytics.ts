import { z } from 'zod'
import { metricCellSchema } from '../../metrics/metric-cell'
import { date, uuid } from '../../metrics/metric-fields'
import { type MetricCell, missingMetric, numericMetric } from '../../metrics/metric-math'
import { round1 } from '../../metrics/metric-round'

export const SURVEY_ANALYTICS_CONTRACT_VERSION = 'analytics.descriptive.survey.v1' as const

export const surveyGroupSchema = z
  .object({
    key: z.string().max(80),
    label: z.string().max(160),
    pairs: metricCellSchema,
    meanPre: metricCellSchema,
    meanPost: metricCellSchema,
    meanChange: metricCellSchema,
    improved: metricCellSchema,
    same: metricCellSchema,
    declined: metricCellSchema,
  })
  .strict()
export type SurveyGroup = z.infer<typeof surveyGroupSchema>

export const surveyAnalyticsSchema = z
  .object({
    contractVersion: z.literal(SURVEY_ANALYTICS_CONTRACT_VERSION),
    projectId: uuid,
    generatedAt: z.string().datetime({ offset: true }),
    period: z.object({ periodStart: date, periodEnd: date }).strict(),
    excludedRecords: z.number().int().min(0),
    overall: surveyGroupSchema,
    byActivity: z.array(surveyGroupSchema).max(200),
  })
  .strict()
export type SurveyAnalytics = z.infer<typeof surveyAnalyticsSchema>

/**
 * Group aggregate for paired pre/post assessments, as returned by the trusted
 * pathways.p10_f9_survey_aggregate function. It carries counts and sums only: no
 * row, enrollment, Beneficiary, or assessment identifier. `activityId` is the
 * group key (null is the no-activity group). computeSurveyAnalyticsFromAggregates
 * releases its counts exactly (cr-pathways-saddd-exact-counts).
 */
export const surveyAggregateGroupSchema = z
  .object({
    activityId: z.string().min(1).max(80).nullable(),
    pairs: z.number().int().min(0),
    sumPre: z.number().finite(),
    sumPost: z.number().finite(),
    improved: z.number().int().min(0),
    same: z.number().int().min(0),
    declined: z.number().int().min(0),
  })
  .strict()
  .refine((group) => group.improved + group.same + group.declined === group.pairs, {
    message: 'Improved, same and declined must add up to the pair count.',
  })
export type SurveyAggregateGroup = z.infer<typeof surveyAggregateGroupSchema>

export const surveyAggregateSchema = z
  .object({
    excludedRecords: z.number().int().min(0),
    groups: z.array(surveyAggregateGroupSchema).max(5000),
  })
  .strict()
export type SurveyAggregate = z.infer<typeof surveyAggregateSchema>

/** One PRE_TEST or POST_TEST assessment row; used only by the row-to-aggregate test adapter. */
export type SurveyAssessmentRow = {
  /** Stable tie-break key only; never used as a display or grouping identity. */
  id: string
  type: 'PRE_TEST' | 'POST_TEST' | 'OUTCOME_SURVEY' | 'FEEDBACK_SURVEY' | 'OTHER'
  score: string | null
  maximumScore: string | null
  assessmentDate: string
  enrollmentId: string | null
  activityId: string | null
}

type NormalizedRow = {
  id: string
  enrollmentId: string
  activityId: string | null
  type: 'PRE_TEST' | 'POST_TEST'
  normalizedScore: number
  assessmentDate: string
}

type Pair = { pre: NormalizedRow; post: NormalizedRow; activityId: string | null }

/** Appends without the quadratic cost of a spread-and-rebuild on every row. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Deterministic "latest wins" ordering: assessmentDate descending, then id
 * descending as a stable tie-break. Never returns 0 (ids are unique), so the
 * result does not depend on the input array's original order.
 */
function byLatest(left: NormalizedRow, right: NormalizedRow): number {
  if (left.assessmentDate !== right.assessmentDate)
    return left.assessmentDate < right.assessmentDate ? 1 : -1
  return left.id < right.id ? 1 : -1
}

/**
 * Pairs the latest PRE_TEST with the latest POST_TEST per enrollment, within the
 * already-filtered period. Rows with a null score, a non-finite score/maximum, or
 * a non-positive maximum score, are excluded and counted; rows without an
 * enrollment cannot be paired. This is the reference semantics the SQL function
 * pathways.p10_f9_survey_aggregate mirrors; production reads never call it.
 */
function pairAssessments(rows: SurveyAssessmentRow[]): { pairs: Pair[]; excluded: number } {
  let excluded = 0
  const byEnrollment = new Map<string, NormalizedRow[]>()
  for (const row of rows) {
    if (row.type !== 'PRE_TEST' && row.type !== 'POST_TEST') continue
    const score = row.score === null ? null : Number(row.score)
    const max = row.maximumScore === null ? null : Number(row.maximumScore)
    if (
      score === null ||
      max === null ||
      !Number.isFinite(score) ||
      !Number.isFinite(max) ||
      !(max > 0)
    ) {
      excluded += 1
      continue
    }
    if (!row.enrollmentId) continue
    const normalized: NormalizedRow = {
      id: row.id,
      enrollmentId: row.enrollmentId,
      activityId: row.activityId,
      type: row.type,
      normalizedScore: (score / max) * 100,
      assessmentDate: row.assessmentDate,
    }
    pushTo(byEnrollment, row.enrollmentId, normalized)
  }
  const pairs: Pair[] = []
  for (const enrollmentRows of byEnrollment.values()) {
    const latestOf = (type: 'PRE_TEST' | 'POST_TEST') =>
      enrollmentRows.filter((row) => row.type === type).sort(byLatest)[0]
    const pre = latestOf('PRE_TEST')
    const post = latestOf('POST_TEST')
    if (pre && post) pairs.push({ pre, post, activityId: post.activityId ?? pre.activityId })
  }
  return { pairs, excluded }
}

/**
 * Test/parity adapter only: folds already-scoped assessment rows into the same group
 * aggregate the trusted SQL function returns, so row-based fixtures keep validating the
 * pairing semantics (latest by date then id, finite score, max > 0, improved/same/declined
 * by normalized difference). Production code never reads assessment rows.
 */
export function surveyAggregateFromRows(rows: SurveyAssessmentRow[]): SurveyAggregate {
  const { pairs, excluded } = pairAssessments(rows)
  const groups = new Map<string | null, SurveyAggregateGroup>()
  for (const pair of pairs) {
    const group = groups.get(pair.activityId) ?? {
      activityId: pair.activityId,
      pairs: 0,
      sumPre: 0,
      sumPost: 0,
      improved: 0,
      same: 0,
      declined: 0,
    }
    group.pairs += 1
    group.sumPre += pair.pre.normalizedScore
    group.sumPost += pair.post.normalizedScore
    const change = pair.post.normalizedScore - pair.pre.normalizedScore
    if (change > 0) group.improved += 1
    else if (change < 0) group.declined += 1
    else group.same += 1
    groups.set(pair.activityId, group)
  }
  return { excludedRecords: excluded, groups: [...groups.values()] }
}

/** Every cell MISSING for the same reason, never a fabricated zero. */
function missingSurveyGroup(key: string, label: string, reason: string): SurveyGroup {
  const missing = missingMetric(reason)
  return {
    key,
    label,
    pairs: reason === 'NO_PAIRED_ASSESSMENTS' ? numericMetric('0') : missing,
    meanPre: missing,
    meanPost: missing,
    meanChange: missing,
    improved: missing,
    same: missing,
    declined: missing,
  }
}

type GroupTotals = Omit<SurveyAggregateGroup, 'activityId'>

const emptyTotals = (): GroupTotals => ({
  pairs: 0,
  sumPre: 0,
  sumPost: 0,
  improved: 0,
  same: 0,
  declined: 0,
})

function addTotals(target: GroupTotals, group: GroupTotals): GroupTotals {
  target.pairs += group.pairs
  target.sumPre += group.sumPre
  target.sumPost += group.sumPost
  target.improved += group.improved
  target.same += group.same
  target.declined += group.declined
  return target
}

/**
 * Builds one survey improvement group with exact counts. A group with zero pairs is
 * MISSING (NO_PAIRED_ASSESSMENTS), never a fabricated zero. Means come from the group sums.
 */
function buildSurveyGroup(key: string, label: string, totals: GroupTotals): SurveyGroup {
  if (totals.pairs === 0) return missingSurveyGroup(key, label, 'NO_PAIRED_ASSESSMENTS')
  const meanPre = totals.sumPre / totals.pairs
  const meanPost = totals.sumPost / totals.pairs
  return {
    key,
    label,
    pairs: numericMetric(String(totals.pairs)),
    meanPre: numericMetric(round1(meanPre)),
    meanPost: numericMetric(round1(meanPost)),
    meanChange: numericMetric(round1(meanPost - meanPre)),
    improved: numericMetric(String(totals.improved)),
    same: numericMetric(String(totals.same)),
    declined: numericMetric(String(totals.declined)),
  }
}

/**
 * Pure paired pre/post survey improvement calculator (analytics.descriptive.survey.v1)
 * over the group aggregate returned by the trusted database function. Input never
 * carries a row or any beneficiary identity; activity IDs are group keys only.
 * Every count is released exactly.
 */
export function computeSurveyAnalyticsFromAggregates(input: {
  projectId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  aggregate: SurveyAggregate
}): SurveyAnalytics {
  const base = {
    contractVersion: SURVEY_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    period: { periodStart: input.periodStart, periodEnd: input.periodEnd },
  }
  const aggregate = surveyAggregateSchema.parse(input.aggregate)
  const overallTotals = emptyTotals()
  const activityTotals = new Map<string, GroupTotals>()
  for (const group of aggregate.groups) {
    addTotals(overallTotals, group)
    if (group.activityId)
      activityTotals.set(
        group.activityId,
        addTotals(activityTotals.get(group.activityId) ?? emptyTotals(), group),
      )
  }
  const overall = buildSurveyGroup('OVERALL', 'All activities (cohort change)', overallTotals)
  const byActivity = [...activityTotals.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([activityId, totals]) => buildSurveyGroup(activityId, activityId, totals))
  return surveyAnalyticsSchema.parse({
    ...base,
    excludedRecords: aggregate.excludedRecords,
    overall,
    byActivity,
  })
}

/**
 * Row-based entry point kept for the pure-calculator tests and the aggregate parity
 * test: folds rows into the trusted aggregate shape, then applies the same calculator
 * production uses. Production never passes assessment rows.
 */
export function computeSurveyAnalytics(input: {
  projectId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  rows: SurveyAssessmentRow[]
}): SurveyAnalytics {
  return computeSurveyAnalyticsFromAggregates({
    projectId: input.projectId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt: input.generatedAt,
    aggregate: surveyAggregateFromRows(input.rows),
  })
}
