import {
  type HumanRule,
  type RuleMetricKey,
  type RuleNode,
  parseRuleTree,
  ruleMetrics,
  scaledDecimal,
} from '@pathways/shared'

export type MetricScope =
  | 'Project'
  | 'Indicator'
  | 'Activity'
  | 'Budget'
  | 'Beneficiary Group'
  | 'Assessment'
type MetricUnit = '%' | 'days' | 'count' | 'value' | 'points'
type MetricCategory =
  | 'Performance'
  | 'Schedule'
  | 'Delivery'
  | 'Financial'
  | 'Participation'
  | 'Outcome'
type MetricExample = { label: string; value: string }
type MetricEntry = {
  label: string
  scope: MetricScope
  unit: MetricUnit
  category: MetricCategory
  definition: string
  example: MetricExample
  monitors: 'Selected project' | 'Selected record' | 'Project aggregate'
}
type Leaf = Extract<RuleNode, { kind: 'CONDITION' }>
type BoardRule = Pick<
  HumanRule,
  'id' | 'name' | 'status' | 'severity' | 'conditions' | 'recommendations'
> & { code?: string }
type RuleDraft = {
  name: string
  severity: HumanRule['severity']
  conditions: RuleNode
}
type RecommendationRow = {
  id: string
  recommendationTitle: string
  ruleName: string
  ruleId: string
  appliesTo: string
  condition: string
  status: HumanRule['status']
}
type SuggestedLevel = Exclude<HumanRule['severity'], 'CRITICAL'>
export type SuggestedSeverity =
  | { status: 'SUGGESTED'; severity: SuggestedLevel; reason: string }
  | { status: 'NEEDS_JUDGMENT'; severity: null; reason: string }
export type RecommendationPrefill = { title: string; text: string }

const entry = (
  label: string,
  scope: MetricScope,
  unit: MetricUnit,
  category: MetricCategory,
  definition: string,
  example: MetricExample,
  monitors: MetricEntry['monitors'],
): MetricEntry => ({ label, scope, unit, category, definition, example, monitors })
const METRIC_CATALOG: Record<RuleMetricKey, MetricEntry> = {
  INDICATOR_CURRENT_VALUE: entry(
    'Current indicator value',
    'Indicator',
    'value',
    'Performance',
    'The latest value of the selected indicator, expressed in its measurement unit.',
    {
      label: 'Worked example',
      value: 'If the indicator records 42 households, the value is 42 households.',
    },
    'Selected record',
  ),
  INDICATOR_PROGRESS_PERCENT: entry(
    'Progress toward indicator target',
    'Indicator',
    '%',
    'Performance',
    'Percentage progress calculated using the selected indicator’s baseline, target, and direction.',
    {
      label: 'Worked example',
      value: 'From a baseline of 20 to a target of 80, a current value of 50 is 50% progress.',
    },
    'Selected record',
  ),
  PROJECT_TIMELINE_ELAPSED_PERCENT: entry(
    'Project timeline elapsed',
    'Project',
    '%',
    'Schedule',
    'Percentage of the scheduled project duration that has passed. This measures time, not work completed.',
    { label: 'Worked example', value: 'Halfway through a 120-day schedule is 50% elapsed.' },
    'Selected project',
  ),
  PROJECT_REMAINING_DAYS: entry(
    'Days until project end',
    'Project',
    'days',
    'Schedule',
    'Calendar days until the scheduled end date. Negative values mean the date has passed.',
    { label: 'Worked example', value: 'An end date 10 calendar days away gives 10 days.' },
    'Selected project',
  ),
  PROJECT_OVERDUE_DAYS: entry(
    'Days past project end',
    'Project',
    'days',
    'Schedule',
    'Calendar days beyond the scheduled end date; otherwise zero.',
    { label: 'Worked example', value: 'An end date 3 calendar days ago gives 3 days.' },
    'Selected project',
  ),
  ACTIVITY_COMPLETION_PERCENT: entry(
    'Activities completed',
    'Activity',
    '%',
    'Delivery',
    'Percentage of eligible activities marked completed.',
    { label: 'Worked example', value: '8 completed eligible activities out of 10 is 80%.' },
    'Project aggregate',
  ),
  ACTIVITY_OVERDUE_COUNT: entry(
    'Number of overdue activities',
    'Activity',
    'count',
    'Delivery',
    'Count of unfinished activities past their planned end dates.',
    {
      label: 'Worked example',
      value: '2 unfinished activities past their planned end dates gives a count of 2.',
    },
    'Project aggregate',
  ),
  ACTIVITY_OVERDUE_DAYS: entry(
    'Days activity is overdue',
    'Activity',
    'days',
    'Delivery',
    'Calendar days a selected unfinished activity is past its planned end date.',
    {
      label: 'Worked example',
      value: 'An unfinished activity 4 calendar days past its planned end date is 4 days overdue.',
    },
    'Selected record',
  ),
  BUDGET_UTILIZATION_PERCENT: entry(
    'Budget used',
    'Budget',
    '%',
    'Financial',
    'Approved expense total as a percentage of the planned budget total. Counted spending is approved expenses.',
    {
      label: 'Worked example',
      value: '250 in approved expenses against a planned total of 1,000 is 25%.',
    },
    'Project aggregate',
  ),
  BENEFICIARY_FOLLOW_UP_PERCENT: entry(
    'Beneficiaries needing follow-up',
    'Beneficiary Group',
    '%',
    'Participation',
    'Percentage of active enrollments whose latest participation record indicates follow-up is needed. This is not follow-up completion.',
    { label: 'Worked example', value: '5 active enrollments needing follow-up out of 20 is 25%.' },
    'Project aggregate',
  ),
  SURVEY_MEAN_IMPROVEMENT_POINTS: entry(
    'Average assessment score change',
    'Assessment',
    'points',
    'Outcome',
    'Average post-test minus pre-test score after converting scores to a 0–100 scale. Negative values indicate a decline.',
    {
      label: 'Worked example',
      value: 'A score increasing from 60% to 75% changes by 15 percentage points.',
    },
    'Project aggregate',
  ),
}
export const SCOPES: MetricScope[] = [
  'Project',
  'Indicator',
  'Activity',
  'Budget',
  'Beneficiary Group',
  'Assessment',
]
export const scopeGuidance: Record<MetricScope, string> = {
  Project: 'Project schedule',
  Indicator: 'Indicator results',
  Activity: 'Activity delivery',
  Budget: 'Budget spending',
  'Beneficiary Group': 'Beneficiary follow-up',
  Assessment: 'Assessment scores',
}
const operatorSymbols = { LT: '<', LTE: '<=', EQ: '=', GTE: '>=', GT: '>' } as const
export const operatorWords = {
  LT: 'below',
  LTE: 'at most',
  EQ: 'equal to',
  GTE: 'at least',
  GT: 'above',
  BETWEEN: 'between',
} as const

export const scopeOf = (key: string): MetricScope =>
  (METRIC_CATALOG as Record<string, MetricEntry | undefined>)[key]?.scope ?? 'Project'
export const unitOf = (key: string): MetricUnit =>
  (METRIC_CATALOG as Record<string, MetricEntry | undefined>)[key]?.unit ?? 'value'
export const categoryOf = (key: string): MetricCategory | null =>
  (METRIC_CATALOG as Record<string, MetricEntry | undefined>)[key]?.category ?? null
export const metricLabel = (key: string) =>
  (METRIC_CATALOG as Record<string, MetricEntry | undefined>)[key]?.label ??
  key.replaceAll('_', ' ').toLowerCase()
/** A metric is selectable only once the validated rule contract accepts it. */
export const isMetricAvailable = (key: string) => (ruleMetrics as readonly string[]).includes(key)
export const availableMetrics = (scopes?: readonly MetricScope[]) =>
  Object.keys(METRIC_CATALOG).filter(
    (key) => isMetricAvailable(key) && (!scopes?.length || scopes.includes(scopeOf(key))),
  )
/**
 * Categories summarize the scope families selected while authoring. Keep the
 * order stable so the tags follow the Applies To checkbox order.
 */
export const categoriesForScopes = (scopes: readonly MetricScope[]): MetricCategory[] => {
  const categories = new Set<MetricCategory>()
  for (const scope of SCOPES) {
    if (!scopes.includes(scope)) continue
    for (const metric of Object.values(METRIC_CATALOG)) {
      if (metric.scope === scope) categories.add(metric.category)
    }
  }
  return [...categories]
}
export const suffix = (key: string) => {
  const unit = unitOf(key)
  return unit === '%'
    ? '%'
    : unit === 'days'
      ? ' days'
      : unit === 'points'
        ? ' percentage points'
        : ''
}
/** Display only: COUNT drops its unit, PERCENT rounds to 2 decimals with %. */
export const formatMetricValue = (value: string, unit: string) => {
  const kind = unit.toUpperCase()
  if (kind === 'COUNT') return value
  if (kind === 'PERCENT' || kind === '%') {
    const n = Number(value)
    return `${Number.isFinite(n) ? Number(n.toFixed(2)) : value}%`
  }
  if (kind === 'POINTS') return `${value} percentage points`
  return `${value} ${unit}`
}
export const metricGuidance = (key: string): MetricEntry | null =>
  (METRIC_CATALOG as Record<string, MetricEntry | undefined>)[key] ?? null
export const unitLabel = (key: string) => {
  const unit = unitOf(key)
  if (unit === '%') return 'Percentage'
  if (unit === 'days') return 'Calendar days'
  if (unit === 'points') return 'Percentage points'
  if (unit === 'count') return 'Count'
  return 'Measurement unit'
}
const firstMetric = (node: RuleNode): string =>
  node.kind === 'CONDITION' ? node.metric : firstMetric(node.children[0] as RuleNode)

const leaves = (node: RuleNode): Leaf[] =>
  node.kind === 'CONDITION' ? [node] : node.children.flatMap(leaves)
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
export const appliesTo = (rule: Pick<BoardRule, 'conditions'>): string[] => [
  ...new Set(leaves(rule.conditions).map((leaf) => scopeOf(leaf.metric))),
]
const clause = (leaf: Leaf, words: boolean) => {
  const label = metricLabel(leaf.metric)
  const threshold = leaf.threshold || '...'
  const tail = suffix(leaf.metric)
  if (leaf.operator === 'BETWEEN')
    return `${label}${words ? ' is' : ''} between ${threshold} and ${leaf.thresholdMaximum || '...'}${tail}`
  return words
    ? `${label} is ${operatorWords[leaf.operator]} ${threshold}${tail}`
    : `${label} ${operatorSymbols[leaf.operator]} ${threshold}${tail}`
}
const summarize = (node: RuleNode, words: boolean): string => {
  if (node.kind === 'CONDITION') return clause(node, words)
  const parts = node.children.map((child) =>
    child.kind === 'GROUP' && child.children.length > 1
      ? `(${summarize(child, words)})`
      : summarize(child, words),
  )
  return parts.join(node.mode === 'AND' ? ' AND ' : ' OR ')
}
export const conditionSummary = (node: RuleNode) => summarize(node, false)
export const conditionSentence = (node: RuleNode) => summarize(node, true)
export const previewSentence = (draft: RuleDraft) =>
  `Raise a ${draft.severity[0]}${draft.severity.slice(1).toLowerCase()} alert when ${summarize(draft.conditions, true)}. Human review required.`

export const flattenRecommendations = (rules: BoardRule[]): RecommendationRow[] =>
  rules.flatMap((rule) =>
    rule.recommendations.map((item) => ({
      id: item.id,
      recommendationTitle: item.title,
      ruleName: rule.name,
      ruleId: rule.id,
      appliesTo: appliesTo(rule).join(', '),
      condition: conditionSummary(rule.conditions),
      status: rule.status,
    })),
  )
export const filterRules = <T extends Pick<BoardRule, 'name' | 'status'> & { code?: string }>(
  rules: T[],
  { search, status }: { search: string; status: 'ALL' | HumanRule['status'] },
) => {
  const needle = search.trim().toLowerCase()
  return rules.filter(
    (rule) =>
      (status === 'ALL' || rule.status === status) &&
      (!needle ||
        rule.name.toLowerCase().includes(needle) ||
        (rule.code ?? '').toLowerCase().includes(needle)),
  )
}
export const suggestRuleCode = (name: string) => {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!slug) return ''
  const code = /^[A-Z]/.test(slug) ? slug : `R_${slug}`
  return code.length < 2 ? `${code}_RULE` : code.slice(0, 80)
}
export const severityTone = (severity: string) =>
  severity === 'HIGH' || severity === 'CRITICAL'
    ? ('danger' as const)
    : severity === 'MEDIUM'
      ? ('warning' as const)
      : ('neutral' as const)
export const statusTone = (status: string) =>
  status === 'ACTIVE' ? ('success' as const) : ('neutral' as const)
export const titleCase = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase())
