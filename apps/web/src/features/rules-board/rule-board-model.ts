import { type HumanRule, type RuleMetricKey, type RuleNode, ruleMetrics } from '@pathways/shared'

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
export type SuggestedSeverity = {
  severity: Exclude<HumanRule['severity'], 'CRITICAL'>
  reason: string
}
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

const scopeOf = (key: string): MetricScope =>
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
const suffix = (key: string) => {
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
const numericThreshold = (value: string) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const necessarilyAbove = (leaf: Leaf, value: number) => {
  const threshold = numericThreshold(leaf.threshold)
  if (threshold === null) return false
  if (leaf.operator === 'GT') return threshold >= value
  if (leaf.operator === 'GTE' || leaf.operator === 'EQ') return threshold > value
  return leaf.operator === 'BETWEEN' && threshold > value
}
const necessarilyAtLeast = (leaf: Leaf, value: number) => {
  const threshold = numericThreshold(leaf.threshold)
  if (threshold === null) return false
  if (leaf.operator === 'GT' || leaf.operator === 'GTE' || leaf.operator === 'EQ')
    return threshold >= value
  return leaf.operator === 'BETWEEN' && threshold >= value
}
const overdueMetrics = new Set([
  'PROJECT_OVERDUE_DAYS',
  'ACTIVITY_OVERDUE_COUNT',
  'ACTIVITY_OVERDUE_DAYS',
])
const completionMetrics = new Set(['INDICATOR_PROGRESS_PERCENT', 'ACTIVITY_COMPLETION_PERCENT'])
/**
 * A UI authoring aid based solely on the typed condition values. It deliberately
 * cannot infer a live risk, and Critical remains an explicit human decision.
 */
export const suggestSeverity = (conditions: RuleNode): SuggestedSeverity => {
  const ruleLeaves = leaves(conditions)
  if (ruleLeaves.some((leaf) => overdueMetrics.has(leaf.metric) && necessarilyAbove(leaf, 0)))
    return {
      severity: 'HIGH',
      reason: 'An overdue condition can only match a value above zero.',
    }
  if (
    ruleLeaves.some((leaf) => completionMetrics.has(leaf.metric) && necessarilyAtLeast(leaf, 100))
  )
    return {
      severity: 'LOW',
      reason: 'A progress or completion condition can only match at least 100%.',
    }
  return {
    severity: 'MEDIUM',
    reason:
      'The configured conditions do not imply an overdue value above zero or completion of at least 100%.',
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
