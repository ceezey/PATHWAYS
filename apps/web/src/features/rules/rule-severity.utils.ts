import {
  type HumanRule,
  type RuleMetricKey,
  type RuleNode,
  parseRuleTree,
  scaledDecimal,
} from '@pathways/shared'
import { type Leaf, type MetricScope, leaves, metricLabel, scopeOf } from './rules.utils'

type SuggestedLevel = Exclude<HumanRule['severity'], 'CRITICAL'>
export type SuggestedSeverity =
  | { status: 'SUGGESTED'; severity: SuggestedLevel; reason: string }
  | { status: 'NEEDS_JUDGMENT'; severity: null; reason: string }
export type RecommendationPrefill = { title: string; text: string }
type Bound = { value: bigint; inclusive: boolean }
type Interval = { lower?: Bound; upper?: Bound }
const zero = 0n
const hundred = 1000000n
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
const matchingInterval = (leaf: Leaf): Interval => {
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
const intersect = (left: Interval, right: Interval): Interval => ({
  lower: laterBound(left.lower, right.lower),
  upper: earlierBound(left.upper, right.upper),
})
const isEmpty = (interval: Interval) => {
  if (!interval.lower || !interval.upper) return false
  return (
    interval.lower.value > interval.upper.value ||
    (interval.lower.value === interval.upper.value &&
      (!interval.lower.inclusive || !interval.upper.inclusive))
  )
}
const isExactly = (interval: Interval, value: bigint) =>
  interval.lower?.value === value &&
  interval.lower.inclusive &&
  interval.upper?.value === value &&
  interval.upper.inclusive
const minimumIsAbove = (interval: Interval, value: bigint) =>
  Boolean(
    interval.lower &&
      (interval.lower.value > value ||
        (interval.lower.value === value && !interval.lower.inclusive)),
  )
const minimumIsAtLeast = (interval: Interval, value: bigint) =>
  Boolean(interval.lower && interval.lower.value >= value)
const maximumIsBelow = (interval: Interval, value: bigint) =>
  Boolean(
    interval.upper &&
      (interval.upper.value < value ||
        (interval.upper.value === value && !interval.upper.inclusive)),
  )
const isBounded = (interval: Interval) => Boolean(interval.lower && interval.upper)
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
const supported = (severity: SuggestedLevel, reason: string): SuggestedSeverity => ({
  status: 'SUGGESTED',
  severity,
  reason,
})
const needsJudgment = (reason: string): SuggestedSeverity => ({
  status: 'NEEDS_JUDGMENT',
  severity: null,
  reason,
})
const humanJudgmentReason = (metric: RuleMetricKey) => {
  if (metric === 'PROJECT_TIMELINE_ELAPSED_PERCENT')
    return 'Project timeline elapsed measures time, not work completed. It does not receive an automatic severity suggestion; choose severity using delivery context.'
  if (metric === 'INDICATOR_CURRENT_VALUE')
    return 'Current indicator value needs its measurement unit, target, and direction to judge urgency. It does not receive an automatic severity suggestion.'
  return null
}
const mixedReason = (metric: string) =>
  `${metricLabel(metric)} spans values with different interpretations. Narrow the comparison or choose severity using your judgment.`
const suggestLeafSeverity = (leaf: Leaf): SuggestedSeverity => {
  const humanReason = humanJudgmentReason(leaf.metric)
  if (humanReason) return needsJudgment(humanReason)
  const interval = intersect(matchingInterval(leaf), domainFor(leaf.metric))
  if (isEmpty(interval))
    return needsJudgment(
      `${metricLabel(leaf.metric)} cannot match a valid value with this comparison. Enter a valid threshold before using a suggestion.`,
    )
  if (leaf.metric === 'PROJECT_OVERDUE_DAYS') {
    if (minimumIsAbove(interval, zero))
      return supported(
        'HIGH',
        'Project: Days past project end can only match a passed project end date.',
      )
    if (isExactly(interval, zero))
      return supported(
        'LOW',
        'Project: Days past project end is zero, an informational no-overdue condition.',
      )
    return needsJudgment(mixedReason(leaf.metric))
  }
  if (leaf.metric === 'PROJECT_REMAINING_DAYS') {
    if (maximumIsBelow(interval, zero))
      return supported('HIGH', 'Project: Days until project end can only match a passed end date.')
    if (minimumIsAtLeast(interval, zero) && isBounded(interval))
      return supported(
        'MEDIUM',
        'Project: Days until project end stays within the configured upcoming window.',
      )
    return needsJudgment(
      'Days until project end spans upcoming and passed dates, or has no bounded upcoming window. Narrow the comparison or choose severity using delivery context.',
    )
  }
  if (leaf.metric === 'INDICATOR_PROGRESS_PERCENT') {
    if (minimumIsAtLeast(interval, hundred))
      return supported(
        'LOW',
        'Indicator: Progress toward indicator target can only match target attainment.',
      )
    if (maximumIsBelow(interval, hundred))
      return supported(
        'MEDIUM',
        'Indicator: Progress toward indicator target can only match under-target progress; timing is needed to judge whether it is late.',
      )
    return needsJudgment(mixedReason(leaf.metric))
  }
  if (leaf.metric === 'ACTIVITY_COMPLETION_PERCENT') {
    if (isExactly(interval, hundred))
      return supported(
        'LOW',
        'Activity: Activities completed can only match the completion milestone.',
      )
    if (maximumIsBelow(interval, hundred))
      return supported(
        'MEDIUM',
        'Activity: Activities completed can only match partial completion, which is not proof of delay.',
      )
    return needsJudgment(mixedReason(leaf.metric))
  }
  if (leaf.metric === 'ACTIVITY_OVERDUE_COUNT' || leaf.metric === 'ACTIVITY_OVERDUE_DAYS') {
    if (minimumIsAbove(interval, zero))
      return supported(
        'HIGH',
        `Activity: ${metricLabel(leaf.metric)} can only match unfinished overdue work.`,
      )
    if (isExactly(interval, zero))
      return supported(
        'LOW',
        `Activity: ${metricLabel(leaf.metric)} is zero, an informational no-overdue condition.`,
      )
    return needsJudgment(mixedReason(leaf.metric))
  }
  if (leaf.metric === 'BUDGET_UTILIZATION_PERCENT') {
    if (minimumIsAbove(interval, hundred))
      return supported(
        'HIGH',
        'Budget: Budget used above 100% flags spending beyond the planned allocation.',
      )
    return needsJudgment(
      'Budget used at this level can represent normal planned spending or an overrun. Choose severity using delivery and timing context.',
    )
  }
  if (leaf.metric === 'BENEFICIARY_FOLLOW_UP_PERCENT') {
    if (minimumIsAbove(interval, zero))
      return supported(
        'MEDIUM',
        'Beneficiary Group: Follow-up needs are present in the aggregate and need review.',
      )
    if (isExactly(interval, zero))
      return supported(
        'LOW',
        'Beneficiary Group: No follow-up need is an informational aggregate condition.',
      )
    return needsJudgment(mixedReason(leaf.metric))
  }
  if (maximumIsBelow(interval, zero))
    return supported(
      'MEDIUM',
      'Assessment: Average assessment score change can only match an aggregate decline.',
    )
  if (minimumIsAbove(interval, zero))
    return supported(
      'LOW',
      'Assessment: Average assessment score change can only match an aggregate improvement.',
    )
  return needsJudgment(mixedReason(leaf.metric))
}
/**
 * A UI authoring aid based solely on the typed condition values. It deliberately
 * cannot infer a live risk, and Critical remains an explicit human decision.
 */
export const suggestSeverity = (conditions: RuleNode): SuggestedSeverity => {
  let parsed: RuleNode
  try {
    parsed = parseRuleTree(conditions)
  } catch {
    const humanReason = leaves(conditions)
      .map((leaf) => humanJudgmentReason(leaf.metric))
      .find((reason) => reason !== null)
    if (humanReason) return needsJudgment(humanReason)
    return needsJudgment(
      'Enter a valid threshold and complete every condition before using a suggestion.',
    )
  }
  const results = leaves(parsed).map(suggestLeafSeverity)
  const unavailable = results.find((result) => result.status === 'NEEDS_JUDGMENT')
  if (unavailable) return unavailable
  const priorities: SuggestedLevel[] = ['HIGH', 'MEDIUM', 'LOW']
  const severity = priorities.find((level) =>
    results.some((result) => result.status === 'SUGGESTED' && result.severity === level),
  )
  return severity
    ? supported(
        severity,
        `Every configured condition supports a ${severity.toLowerCase()} priority.`,
      )
    : needsJudgment('Complete every condition before using a suggestion.')
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
