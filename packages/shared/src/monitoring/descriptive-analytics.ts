import { z } from 'zod'
import { metricCellSchema } from './metric-contract'
import { type MetricCell, isCalendarDate, missingMetric, numericMetric } from './metric-math'

export const DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION = 'analytics.descriptive.v1' as const

const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/)

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
        threshold: z.literal(5),
        complementarySuppression: z.literal(true),
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

/** Locked SADDD RFC G4 threshold, mirrored here for the pure survey calculator: 1-4 is suppressed. */
export const SURVEY_SMALL_CELL_THRESHOLD = 5
function suppressSmallSurveyCount(metric: MetricCell): MetricCell {
  if (metric.state !== 'AVAILABLE' || metric.value === null) return metric
  const value = Number(metric.value)
  return value > 0 && value < SURVEY_SMALL_CELL_THRESHOLD
    ? { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    : metric
}

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

/** One PRE_TEST or POST_TEST assessment row projected from an already scoped query. */
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

/** Round half away from zero to 1 decimal place and format as a plain decimal string. */
function round1(value: number): string {
  const rounded = (Math.sign(value) || 1) * Math.round(Math.abs(value) * 10) / 10
  const fixed = rounded.toFixed(1).replace(/\.0$/, '')
  return fixed === '-0' ? '0' : fixed
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
 * enrollment cannot be paired.
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

/** Every cell suppressed as one unit: no sub-cell can be partially revealed. */
function suppressedSurveyGroup(key: string, label: string): SurveyGroup {
  const suppressed: MetricCell = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
  return {
    key,
    label,
    pairs: suppressed,
    meanPre: suppressed,
    meanPost: suppressed,
    meanChange: suppressed,
    improved: suppressed,
    same: suppressed,
    declined: suppressed,
  }
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

/** Raw improved/same/declined counts for a set of pairs, before any suppression. */
function rawSurveyCounts(pairs: readonly Pair[]): {
  improved: number
  same: number
  declined: number
} {
  let improved = 0
  let same = 0
  let declined = 0
  for (const pair of pairs) {
    const change = pair.post.normalizedScore - pair.pre.normalizedScore
    if (change > 0) improved += 1
    else if (change < 0) declined += 1
    else same += 1
  }
  return { improved, same, declined }
}

/** A count is safe to reveal on its own only when it is exactly zero or clears the threshold. */
function clearsThresholdOrZero(count: number): boolean {
  return count === 0 || count >= SURVEY_SMALL_CELL_THRESHOLD
}

/**
 * Builds one survey improvement group. A group with fewer than 5 pairs is fully
 * suppressed (never partially revealed). A group with zero pairs is MISSING
 * (NO_PAIRED_ASSESSMENTS), never a fabricated zero. Improved/same/declined receive
 * complementary suppression among themselves so a small sub-count cannot be
 * recovered from the visible pair total.
 */
function buildSurveyGroup(key: string, label: string, pairs: Pair[]): SurveyGroup {
  const pairsCell = suppressSmallSurveyCount(numericMetric(String(pairs.length)))
  if (pairsCell.state === 'SUPPRESSED') return suppressedSurveyGroup(key, label)
  if (pairs.length === 0) return missingSurveyGroup(key, label, 'NO_PAIRED_ASSESSMENTS')
  const meanPre = pairs.reduce((sum, pair) => sum + pair.pre.normalizedScore, 0) / pairs.length
  const meanPost = pairs.reduce((sum, pair) => sum + pair.post.normalizedScore, 0) / pairs.length
  const counts = rawSurveyCounts(pairs)
  let improved = suppressSmallSurveyCount(numericMetric(String(counts.improved)))
  let same = suppressSmallSurveyCount(numericMetric(String(counts.same)))
  let declined = suppressSmallSurveyCount(numericMetric(String(counts.declined)))
  if (
    improved.state === 'SUPPRESSED' ||
    same.state === 'SUPPRESSED' ||
    declined.state === 'SUPPRESSED'
  ) {
    const suppressed: MetricCell = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    improved = suppressed
    same = suppressed
    declined = suppressed
  }
  return {
    key,
    label,
    pairs: pairsCell,
    meanPre: numericMetric(round1(meanPre)),
    meanPost: numericMetric(round1(meanPost)),
    meanChange: numericMetric(round1(meanPost - meanPre)),
    improved,
    same,
    declined,
  }
}

/**
 * Pure paired pre/post survey improvement calculator (analytics.descriptive.survey.v1).
 * Input rows must already be scoped to one project/period and must never carry
 * beneficiary identity; only enrollment and activity IDs are used, for pairing only.
 *
 * `truncated` is set by the caller when the source query hit its population cap
 * (fail closed rather than silently truncate): every cell reports MISSING
 * (POPULATION_LIMIT_EXCEEDED) instead of a partial, misleading computation.
 */
export function computeSurveyAnalytics(input: {
  projectId: string
  periodStart: string
  periodEnd: string
  generatedAt: string
  rows: SurveyAssessmentRow[]
  truncated?: boolean
}): SurveyAnalytics {
  const base = {
    contractVersion: SURVEY_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    period: { periodStart: input.periodStart, periodEnd: input.periodEnd },
  }
  if (input.truncated) {
    return surveyAnalyticsSchema.parse({
      ...base,
      excludedRecords: 0,
      overall: missingSurveyGroup(
        'OVERALL',
        'All activities (cohort change)',
        'POPULATION_LIMIT_EXCEEDED',
      ),
      byActivity: [],
    })
  }
  const { pairs, excluded } = pairAssessments(input.rows)
  const overall = buildSurveyGroup('OVERALL', 'All activities (cohort change)', pairs)
  const activityGroups = new Map<string, Pair[]>()
  const residualPairs: Pair[] = []
  for (const pair of pairs) {
    if (pair.activityId) pushTo(activityGroups, pair.activityId, pair)
    else residualPairs.push(pair)
  }
  const groupEntries = [...activityGroups.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  const rawByActivity = groupEntries.map(([activityId, groupPairs]) =>
    buildSurveyGroup(activityId, activityId, groupPairs),
  )
  // Cross-group complementary suppression, extended to every sub-cell (build guide
  // section 5, SADDD suppression is part of correctness). An activity group's own
  // pair count or improved/same/declined split can be small enough to be
  // suppressed on its own, but so can the *residual* of pairs that carry no
  // activity — the overall total minus the sum of every visible byActivity group,
  // computed at both the pair level and the improved/same/declined level. Any of
  // these lets a hidden count be recovered by subtraction from the overall total
  // and its visible siblings, so the whole breakdown is withheld (never partially
  // revealed) rather than just the one small group or sub-cell.
  const residualCounts = rawSurveyCounts(residualPairs)
  const residualPairCount = residualPairs.length
  const anyGroupPairsSuppressed = rawByActivity.some((group) => group.pairs.state === 'SUPPRESSED')
  const anyGroupSubCellsSuppressed = rawByActivity.some(
    (group) => group.pairs.state !== 'SUPPRESSED' && group.improved.state === 'SUPPRESSED',
  )
  const residualPairsSmall = !clearsThresholdOrZero(residualPairCount)
  const residualSubCellsSmall =
    !clearsThresholdOrZero(residualCounts.improved) ||
    !clearsThresholdOrZero(residualCounts.same) ||
    !clearsThresholdOrZero(residualCounts.declined)
  const overallSuppressed =
    overall.pairs.state === 'SUPPRESSED' || overall.improved.state === 'SUPPRESSED'
  const withholdBreakdown =
    anyGroupPairsSuppressed ||
    anyGroupSubCellsSuppressed ||
    residualPairsSmall ||
    residualSubCellsSmall ||
    overallSuppressed
  const byActivity = withholdBreakdown
    ? rawByActivity.map((group) => suppressedSurveyGroup(group.key, group.label))
    : rawByActivity
  return surveyAnalyticsSchema.parse({
    ...base,
    excludedRecords: excluded,
    overall,
    byActivity,
  })
}

export const TIMELINE_ANALYTICS_CONTRACT_VERSION = 'analytics.descriptive.timeline.v1' as const

export const timelineAnalyticsSchema = z
  .object({
    contractVersion: z.literal(TIMELINE_ANALYTICS_CONTRACT_VERSION),
    projectId: uuid,
    generatedAt: z.string().datetime({ offset: true }),
    reportingDate: date,
    elapsedPercent: metricCellSchema,
    remainingDays: metricCellSchema,
    overdueDays: metricCellSchema,
    activityCompletionPercent: metricCellSchema,
    activityOverdueCount: metricCellSchema,
    milestoneOnTimePercent: metricCellSchema,
  })
  .strict()
export type TimelineAnalytics = z.infer<typeof timelineAnalyticsSchema>

export type TimelineMilestoneRow = {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  targetDate: string | null
  completionDate: string | null
}

/**
 * Milestone on-time percent = completed milestones with completion_date <= target_date,
 * divided by completed milestones. Cancelled milestones are excluded. MISSING
 * (NO_COMPLETED_MILESTONES) when there are no completed milestones to rate, never 0.
 */
export function milestoneOnTimeCell(milestones: readonly TimelineMilestoneRow[]): MetricCell {
  const completed = milestones.filter((milestone) => milestone.status === 'COMPLETED')
  if (completed.length === 0) return missingMetric('NO_COMPLETED_MILESTONES')
  const rated = completed.filter(
    (milestone) => milestone.targetDate !== null && milestone.completionDate !== null,
  )
  if (rated.length === 0) return missingMetric('NO_COMPLETED_MILESTONES')
  const onTime = rated.filter(
    (milestone) => (milestone.completionDate as string) <= (milestone.targetDate as string),
  ).length
  const percent = (onTime / rated.length) * 100
  return numericMetric(round1(percent))
}
