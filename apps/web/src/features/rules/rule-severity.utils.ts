import {
  type RuleExpectations,
  type RuleMetricKey,
  type RuleNode,
  SEVERITY_BOUNDS,
  type SeverityLevel,
  type SeverityMissing,
  operators,
  scaledDecimal,
  severityLevels,
} from '@pathways/shared'
import { type Leaf, type MetricScope, leaves, recordBound, scopeOf } from './rules.utils'

export type RecommendationPrefill = { title: string; text: string }
export type SeverityPreview = {
  levels: SeverityLevel[]
  dependsOnDates: boolean
  explanatoryOnly: boolean
  needs: SeverityMissing[]
  contradiction: string | null
}
type Bound = { value: bigint; inclusive: boolean }
type Interval = { lower?: Bound; upper?: Bound }
/** Outcomes a condition can reach: -1 explains only, 0 to 2 index severityLevels. */
type Reach = { ranks: Set<number>; dates: boolean; needs: Set<SeverityMissing> }
const scale = 10000n
const zero = 0n
const hundred = 100n * scale
const nonNegative: Interval = { lower: { value: zero, inclusive: true } }
const percentage: Interval = {
  lower: { value: zero, inclusive: true },
  upper: { value: hundred, inclusive: true },
}
const assessment: Interval = {
  lower: { value: -hundred, inclusive: true },
  upper: { value: hundred, inclusive: true },
}
const compareBound = (left: Bound, right: Bound) =>
  left.value === right.value ? 0 : left.value < right.value ? -1 : 1
const laterBound = (left: Bound | undefined, right: Bound | undefined): Bound | undefined => {
  if (!left) return right
  if (!right) return left
  const comparison = compareBound(left, right)
  if (comparison > 0) return left
  if (comparison < 0) return right
  return { value: left.value, inclusive: left.inclusive && right.inclusive }
}
const earlierBound = (left: Bound | undefined, right: Bound | undefined): Bound | undefined => {
  if (!left) return right
  if (!right) return left
  const comparison = compareBound(left, right)
  if (comparison < 0) return left
  if (comparison > 0) return right
  return { value: left.value, inclusive: left.inclusive && right.inclusive }
}
export const matchingInterval = (leaf: Leaf): Interval => {
  const threshold = scaledDecimal(leaf.threshold)
  if (leaf.operator === 'LT') return { upper: { value: threshold, inclusive: false } }
  if (leaf.operator === 'LTE') return { upper: { value: threshold, inclusive: true } }
  if (leaf.operator === 'EQ')
    return {
      lower: { value: threshold, inclusive: true },
      upper: { value: threshold, inclusive: true },
    }
  if (leaf.operator === 'GTE') return { lower: { value: threshold, inclusive: true } }
  if (leaf.operator === 'GT') return { lower: { value: threshold, inclusive: false } }
  const maximum = scaledDecimal(leaf.thresholdMaximum as string)
  return {
    lower: { value: threshold, inclusive: true },
    upper: { value: maximum, inclusive: true },
  }
}
export const intersect = (left: Interval, right: Interval): Interval => ({
  lower: laterBound(left.lower, right.lower),
  upper: earlierBound(left.upper, right.upper),
})
export const isEmpty = (interval: Interval) => {
  if (!interval.lower || !interval.upper) return false
  return (
    interval.lower.value > interval.upper.value ||
    (interval.lower.value === interval.upper.value &&
      (!interval.lower.inclusive || !interval.upper.inclusive))
  )
}
const domainFor = (metric: RuleMetricKey): Interval => {
  if (metric === 'ACTIVITY_COMPLETION_PERCENT' || metric === 'BENEFICIARY_FOLLOW_UP_PERCENT')
    return percentage
  if (metric === 'SURVEY_MEAN_IMPROVEMENT_POINTS') return assessment
  if (
    metric === 'PROJECT_TIMELINE_ELAPSED_PERCENT' ||
    metric === 'PROJECT_OVERDUE_DAYS' ||
    metric === 'ACTIVITY_OVERDUE_COUNT' ||
    metric === 'ACTIVITY_OVERDUE_DAYS' ||
    metric === 'BUDGET_UTILIZATION_PERCENT'
  )
    return nonNegative
  return {}
}
const ALL = [0, 1, 2]
const SHARE_METRICS: readonly RuleMetricKey[] = [
  'PROJECT_OVERDUE_DAYS',
  'ACTIVITY_OVERDUE_DAYS',
  'ACTIVITY_OVERDUE_COUNT',
]
const reach = (ranks: number[], dates = false, need?: SeverityMissing): Reach => ({
  ranks: new Set(ranks),
  dates,
  needs: new Set(need ? [need] : []),
})
/** Bands of actual values for Low, Medium and High when a higher value is worse. */
const rising = (low: bigint, medium: bigint): Interval[] => [
  { upper: { value: low, inclusive: true } },
  { lower: { value: low, inclusive: false }, upper: { value: medium, inclusive: true } },
  { lower: { value: medium, inclusive: false } },
]
/** Bands of actual values for Low, Medium and High when a lower value is worse. */
const falling = (low: bigint, medium: bigint): Interval[] => [
  { lower: { value: low, inclusive: true } },
  { lower: { value: medium, inclusive: true }, upper: { value: low, inclusive: false } },
  { upper: { value: medium, inclusive: false } },
]
const ranksIn = (interval: Interval, bands: Interval[]) =>
  bands.flatMap((band, rank) => (isEmpty(intersect(interval, band)) ? [] : [rank]))
const expectation = (value?: string | null) => {
  try {
    return value?.trim() ? scaledDecimal(value.trim()) : null
  } catch {
    return null
  }
}
const rangeOf = (leaf: Leaf): Interval => {
  try {
    return intersect(matchingInterval(leaf), domainFor(leaf.metric))
  } catch {
    return domainFor(leaf.metric)
  }
}
/** Metric and record a condition compares, or null while its record is still unchosen. */
const bindingKey = (leaf: Leaf) =>
  recordBound(leaf.metric) && !leaf.indicatorId && !leaf.activityId
    ? null
    : `${leaf.metric}:${leaf.indicatorId ?? ''}:${leaf.activityId ?? ''}`
const leafReach = (leaf: Leaf, expectations: RuleExpectations, range = rangeOf(leaf)): Reach => {
  if (isEmpty(range)) return reach([])
  const metric = leaf.metric
  if (metric === 'PROJECT_TIMELINE_ELAPSED_PERCENT') return reach([-1])
  if (metric === 'BUDGET_UTILIZATION_PERCENT') {
    const [within, medium] = SEVERITY_BOUNDS.BUDGET_PERCENT
    return reach(ranksIn(range, rising(within * scale, medium * scale)).map((rank) => rank || -1))
  }
  if (metric === 'BENEFICIARY_FOLLOW_UP_PERCENT') {
    const manageable = expectation(expectations.manageableFollowUpPercent)
    if (manageable === null) return reach(ALL, false, 'MANAGEABLE_FOLLOW_UP_LEVEL')
    const [low, medium] = SEVERITY_BOUNDS.POINTS_ABOVE
    return reach(ranksIn(range, rising(manageable + low * scale, manageable + medium * scale)))
  }
  if (metric === 'SURVEY_MEAN_IMPROVEMENT_POINTS') {
    const expected = expectation(expectations.expectedScoreImprovement)
    if (expected === null) return reach(ALL, false, 'EXPECTED_SCORE_IMPROVEMENT')
    const [low, medium] = SEVERITY_BOUNDS.POINTS_BELOW
    return reach(ranksIn(range, falling(expected - low * scale, expected - medium * scale)))
  }
  if (metric === 'PROJECT_REMAINING_DAYS') {
    const late = !isEmpty(intersect(range, { upper: { value: zero, inclusive: false } }))
    const early = !isEmpty(intersect(range, { lower: { value: zero, inclusive: true } }))
    return reach([...(early ? [-1] : []), ...(late ? ALL : [])], late)
  }
  if (SHARE_METRICS.includes(metric))
    return reach(range.upper && range.upper.value <= zero ? [0] : ALL, true)
  // Indicator progress is expected at 100% from its target date and needs context before it.
  if (metric === 'INDICATOR_PROGRESS_PERCENT') {
    const [low, medium] = SEVERITY_BOUNDS.BEHIND_PERCENT
    const bands = falling(hundred - low * scale, hundred - medium * scale)
    return reach(ranksIn(range, bands), true, 'EXPECTED_PROGRESS_FOR_DATE')
  }
  // Completion at or above 100% is never behind any expectation.
  const ahead = metric === 'ACTIVITY_COMPLETION_PERCENT' && (range.lower?.value ?? -1n) >= hundred
  return reach(ahead ? [0] : ALL, true)
}
/** AND reaches levels at or above every child minimum; OR reaches any child level. */
const nodeReach = (node: RuleNode, expectations: RuleExpectations): Reach => {
  if (node.kind === 'CONDITION') return leafReach(node, expectations)
  const children: Reach[] = []
  // An AND group narrows one metric and record to the overlap of its comparisons.
  const merged = new Map<string, { leaf: Leaf; range: Interval }>()
  for (const child of node.children) {
    const key = node.mode === 'AND' && child.kind === 'CONDITION' ? bindingKey(child) : null
    if (key === null || child.kind !== 'CONDITION') {
      children.push(nodeReach(child, expectations))
      continue
    }
    const previous = merged.get(key)?.range
    merged.set(key, {
      leaf: child,
      range: previous ? intersect(previous, rangeOf(child)) : rangeOf(child),
    })
  }
  for (const { leaf, range } of merged.values()) children.push(leafReach(leaf, expectations, range))
  const floor =
    node.mode === 'AND' ? Math.max(...children.map((child) => Math.min(...child.ranks))) : -1
  return {
    ranks: new Set(children.flatMap((child) => [...child.ranks]).filter((rank) => rank >= floor)),
    dates: children.some((child) => child.dates),
    needs: new Set(children.flatMap((child) => [...child.needs])),
  }
}
/** True when an AND group compares one metric and binding in ranges that never overlap. */
const contradicts = (node: RuleNode): boolean => {
  if (node.kind === 'CONDITION') return false
  if (node.children.some(contradicts)) return true
  if (node.mode !== 'AND') return false
  const ranges = new Map<string, Interval>()
  for (const child of node.children) {
    const key = child.kind === 'CONDITION' ? bindingKey(child) : null
    if (key === null || child.kind !== 'CONDITION') continue
    let range: Interval
    try {
      range = matchingInterval(child)
    } catch {
      continue
    }
    const previous = ranges.get(key)
    const next = previous ? intersect(previous, range) : range
    if (isEmpty(next)) return true
    ranges.set(key, next)
  }
  return false
}
/**
 * Levels the rule could reach when it fires, from the condition ranges and stored
 * expectations; the official level is classified from actual figures server-side.
 */
export const previewSeverity = (
  conditions: RuleNode,
  expectations: RuleExpectations,
): SeverityPreview => {
  const result = nodeReach(conditions, expectations)
  const levels = severityLevels.filter((_, rank) => result.ranks.has(rank))
  const explains = result.ranks.has(-1)
  return {
    levels,
    dependsOnDates: result.dates,
    explanatoryOnly: explains && levels.length === 0,
    needs: [...result.needs, ...(explains ? (['DELIVERY_EXPECTATION'] as const) : [])],
    contradiction: contradicts(conditions) ? 'These conditions cannot happen together.' : null,
  }
}
// Without these expectations any range could reach a level, so no operator is marked preferred.
const UNSET_EXPECTATIONS: SeverityMissing[] = [
  'MANAGEABLE_FOLLOW_UP_LEVEL',
  'EXPECTED_SCORE_IMPROVEMENT',
]
const valid = (leaf: Leaf) => {
  try {
    matchingInterval(leaf)
    return true
  } catch {
    return false
  }
}
/** Operators that, with the value typed, let this condition reach a level on its own. */
export const preferredOperators = (leaf: Leaf, expectations: RuleExpectations) =>
  leaf.metric === 'INDICATOR_CURRENT_VALUE'
    ? []
    : operators.filter((operator) => {
        const candidate = { ...leaf, operator }
        if (!valid(candidate)) return false
        const preview = previewSeverity(candidate, expectations)
        return (
          preview.levels.length > 0 &&
          !preview.needs.some((need) => UNSET_EXPECTATIONS.includes(need))
        )
      })
/** Expectations for the metrics the rule uses; blank or unused fields save as null. */
export const relevantExpectations = (
  conditions: RuleNode,
  expectations: RuleExpectations,
): Required<RuleExpectations> => {
  const metrics = new Set(leaves(conditions).map((leaf) => leaf.metric))
  const keep = (metric: RuleMetricKey, value?: string | null) =>
    metrics.has(metric) && value?.trim() ? value.trim() : null
  return {
    expectedScoreImprovement: keep(
      'SURVEY_MEAN_IMPROVEMENT_POINTS',
      expectations.expectedScoreImprovement,
    ),
    manageableFollowUpPercent: keep(
      'BENEFICIARY_FOLLOW_UP_PERCENT',
      expectations.manageableFollowUpPercent,
    ),
  }
}
const recommendationPrefills: Record<MetricScope, RecommendationPrefill> = {
  Project: {
    title: 'Review project timeline',
    text: 'Check the current schedule and recorded evidence with the project team, then agree on a follow-up.',
  },
  Indicator: {
    title: 'Review indicator result',
    text: 'Verify the latest indicator measurement and its target context with the project team, then agree on a response.',
  },
  Activity: {
    title: 'Review activity progress',
    text: 'Check the activity status and recorded evidence with assigned staff, then agree on a follow-up.',
  },
  Budget: {
    title: 'Review budget utilization',
    text: 'Review approved spending and remaining allocation with authorized budget staff before considering any adjustment.',
  },
  'Beneficiary Group': {
    title: 'Review aggregate follow-up',
    text: 'Review the aggregate follow-up trend with authorized project staff and agree on a privacy-preserving response.',
  },
  Assessment: {
    title: 'Review assessment results',
    text: 'Check the aggregate assessment results and data quality with the project team, then agree on an improvement action.',
  },
}
const combinedRecommendation: RecommendationPrefill = {
  title: 'Review combined signals',
  text: 'Review each condition and its recorded evidence with the project team, then agree on a response.',
}
/** Predefined editable starting copy, never a runtime recommendation generator. */
export const recommendationPrefill = (conditions: RuleNode): RecommendationPrefill => {
  const scopes = [...new Set(leaves(conditions).map((leaf) => scopeOf(leaf.metric)))]
  return scopes.length === 1
    ? recommendationPrefills[scopes[0] as MetricScope]
    : combinedRecommendation
}
