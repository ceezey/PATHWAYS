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
type MetricEntry = { label: string; scope: MetricScope; unit: MetricUnit; category: MetricCategory }
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
): MetricEntry => ({ label, scope, unit, category })
const METRIC_CATALOG: Record<RuleMetricKey, MetricEntry> = {
  INDICATOR_CURRENT_VALUE: entry('Indicator current value', 'Indicator', 'value', 'Performance'),
  INDICATOR_PROGRESS_PERCENT: entry('Indicator progress', 'Indicator', '%', 'Performance'),
  PROJECT_TIMELINE_ELAPSED_PERCENT: entry('Project timeline elapsed', 'Project', '%', 'Schedule'),
  PROJECT_REMAINING_DAYS: entry('Project remaining days', 'Project', 'days', 'Schedule'),
  PROJECT_OVERDUE_DAYS: entry('Project overdue days', 'Project', 'days', 'Schedule'),
  ACTIVITY_COMPLETION_PERCENT: entry('Activity completion', 'Activity', '%', 'Delivery'),
  ACTIVITY_OVERDUE_COUNT: entry('Overdue activities', 'Activity', 'count', 'Delivery'),
  ACTIVITY_OVERDUE_DAYS: entry('Activity overdue days', 'Activity', 'days', 'Delivery'),
  BUDGET_UTILIZATION_PERCENT: entry('Budget utilization', 'Budget', '%', 'Financial'),
  BENEFICIARY_FOLLOW_UP_PERCENT: entry(
    'Beneficiary follow-up',
    'Beneficiary Group',
    '%',
    'Participation',
  ),
  SURVEY_MEAN_IMPROVEMENT_POINTS: entry(
    'Survey mean improvement',
    'Assessment',
    'points',
    'Outcome',
  ),
}
export const SCOPES: MetricScope[] = [
  'Project',
  'Indicator',
  'Assessment',
  'Activity',
  'Beneficiary Group',
  'Budget',
]
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
  return unit === '%' ? '%' : unit === 'days' || unit === 'points' ? ` ${unit}` : ''
}
/** Display only: COUNT drops its unit, PERCENT rounds to 2 decimals with %, POINTS reads pts. */
export const formatMetricValue = (value: string, unit: string) => {
  const kind = unit.toUpperCase()
  if (kind === 'COUNT') return value
  if (kind === 'PERCENT' || kind === '%') {
    const n = Number(value)
    return `${Number.isFinite(n) ? Number(n.toFixed(2)) : value}%`
  }
  if (kind === 'POINTS') return `${value} pts`
  return `${value} ${unit}`
}
export const unitLabel = (key: string) => (unitOf(key) === 'value' ? 'Value' : unitOf(key))
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
    ruleLeaves.some(
      (leaf) => completionMetrics.has(leaf.metric) && necessarilyAtLeast(leaf, 100),
    )
  )
    return {
      severity: 'LOW',
      reason: 'A progress or completion condition can only match at least 100%.',
    }
  return {
    severity: 'MEDIUM',
    reason: 'The configured conditions do not imply an overdue value above zero or completion of at least 100%.',
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
  `IF ${summarize(draft.conditions, true)} THEN raise a ${draft.severity.toLowerCase()} alert '${draft.name.trim() || 'Untitled rule'}' for assigned project users. Human review required.`

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
