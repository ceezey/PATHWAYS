import {
  type HumanAlert,
  type HumanRule,
  type RuleCondition,
  type RuleMetricKey,
  type RuleNode,
  alertSeverities,
  displayDecimal,
  ruleMetrics,
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
export type Leaf = Extract<RuleNode, { kind: 'CONDITION' }>
type BoardRule = Pick<
  HumanRule,
  'id' | 'name' | 'status' | 'severity' | 'conditions' | 'recommendations'
> & { code?: string }
type RuleDraft = {
  name: string
  critical: boolean
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
  KPI_ACHIEVEMENT_PERCENT: entry(
    'KPI performance',
    'Project',
    '%',
    'Performance',
    'Average progress from baseline to target across the project indicators that have a current value. Indicators without a value are left out.',
    { label: 'Worked example', value: 'Indicators at 40% and 60% of their targets give 50%.' },
    'Project aggregate',
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
  SURVEY_MEAN_PRE_TEST_PERCENT: entry(
    'Average pre-test score',
    'Assessment',
    '%',
    'Outcome',
    "Average of each active participant's latest pre-test score on a 0–100 scale. Hidden when fewer than 5 people have a score.",
    { label: 'Worked example', value: 'Scores of 12 out of 20 and 16 out of 20 average 70%.' },
    'Project aggregate',
  ),
  SURVEY_MEAN_POST_TEST_PERCENT: entry(
    'Average post-test score',
    'Assessment',
    '%',
    'Outcome',
    "Average of each active participant's latest post-test score on a 0–100 scale. Hidden when fewer than 5 people have a score.",
    { label: 'Worked example', value: 'Scores of 15 out of 20 and 19 out of 20 average 85%.' },
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
export const SCOPE_GRID_ORDER: MetricScope[] = [
  'Project',
  'Activity',
  'Indicator',
  'Budget',
  'Beneficiary Group',
  'Assessment',
]
export const scopeDisplayLabel: Partial<Record<MetricScope, string>> = {
  Indicator: 'Indicator / KPI',
}
export const scopeGuidance: Record<MetricScope, string> = {
  Project: 'Project schedule and KPI performance',
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
// Values outside the stored decimal(18,4) text shape are shown unchanged.
const rounded = (value: string) => {
  try {
    return displayDecimal(value)
  } catch {
    return value
  }
}
/** Display only: COUNT drops its unit; every other value rounds to 2 decimals. */
export const formatMetricValue = (value: string, unit: string) => {
  const kind = unit.toUpperCase()
  if (kind === 'COUNT') return value
  if (kind === 'PERCENT' || kind === '%') return `${rounded(value)}%`
  if (kind === 'POINTS') return `${rounded(value)} percentage points`
  return `${rounded(value)} ${unit}`
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

export const leaves = (node: RuleNode): Leaf[] =>
  node.kind === 'CONDITION' ? [node] : node.children.flatMap(leaves)
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
// Only a manual Critical mark is named; other levels come from actual figures when the alert fires.
export const previewSentence = (draft: RuleDraft) =>
  `Raise ${draft.critical ? 'a Critical' : 'an'} alert when ${summarize(draft.conditions, true)}. Human review required.`

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
export const severityTone = (severity: string | null) =>
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
// Alerts without a stored level read as needing context.
export const severityText = (severity: string | null) =>
  severity === null ? 'Needs context' : titleCase(severity)
// Rules store only a manual Critical mark; the system suggests every other level.
export const manualSeverity = (severity: string | null) =>
  severity === 'CRITICAL' ? ('CRITICAL' as const) : null
// Rule-level label: only the manual Critical mark is fixed; legacy levels no longer affect alerts.
export const ruleSeverityText = (severity: string | null) =>
  manualSeverity(severity) ? 'Critical (manual)' : 'Suggested when it fires'
export const ruleSeverityTone = (severity: string | null) =>
  manualSeverity(severity) ? ('danger' as const) : ('neutral' as const)
export const selectClass =
  'h-11 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-disabled-foreground'
export type Rec = { id: string; title: string; text: string }
export type Mode = 'AND' | 'OR'
export const recordBound = (metric: string) =>
  metric.startsWith('INDICATOR_') || metric === 'ACTIVITY_OVERDUE_DAYS'
export const newRow = (metric: string): RuleCondition => ({
  kind: 'CONDITION',
  id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
  metric: metric as RuleCondition['metric'],
  operator: 'LT',
  threshold: '',
})
/** Connector before each row, keyed by row id; a missing entry means AND and the first row has none. */
export type Joins = Record<string, Mode>
/** Splits rows into AND-joined runs, starting a new run at every OR. */
export const runsOf = (rows: Leaf[], joins: Joins): Leaf[][] =>
  rows.reduce<Leaf[][]>((runs, row, index) => {
    if (index === 0 || joins[row.id] === 'OR') runs.push([row])
    else runs[runs.length - 1]?.push(row)
    return runs
  }, [])
/** Moves the row with `id` to the position of `targetId`; other rows keep their order. */
export const moveRow = <T extends { id: string }>(rows: T[], id: string, targetId: string): T[] => {
  const from = rows.findIndex((row) => row.id === id)
  const to = rows.findIndex((row) => row.id === targetId)
  if (from < 0 || to < 0 || from === to) return rows
  const next = rows.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}
/** Builds the stored tree with AND checked before OR: A AND B OR C saves as (A AND B) OR C. */
export const rowsToTree = (rows: Leaf[], joins: Joins): RuleNode => {
  const runs = runsOf(rows, joins)
  if (runs.length <= 1) return { kind: 'GROUP', mode: 'AND', children: runs[0] ?? [] }
  return {
    kind: 'GROUP',
    mode: 'OR',
    children: runs.map((run) =>
      run.length === 1 ? (run[0] as Leaf) : { kind: 'GROUP', mode: 'AND', children: run },
    ),
  }
}
/** Reads a stored tree back into rows and connectors, or null when it needs the advanced editor. */
export const treeToRows = (node: RuleNode): { rows: Leaf[]; joins: Joins } | null => {
  if (node.kind === 'CONDITION') return { rows: [node], joins: {} }
  const rows: Leaf[] = []
  const joins: Joins = {}
  for (const [index, child] of node.children.entries()) {
    const run =
      child.kind === 'CONDITION'
        ? [child]
        : node.mode === 'OR' &&
            child.mode === 'AND' &&
            child.children.length > 1 &&
            child.children.every((item) => item.kind === 'CONDITION')
          ? (child.children as Leaf[])
          : null
    if (!run) return null
    for (const [position, row] of run.entries()) {
      if (index > 0 || position > 0) joins[row.id] = position === 0 ? node.mode : 'AND'
      rows.push(row)
    }
  }
  return { rows, joins }
}
export const newRec = (): Rec => ({ id: crypto.randomUUID(), title: '', text: '' })
export const completeRec = (item: Rec) => Boolean(item.title.trim() && item.text.trim())
export const appendRec = (items: Rec[], item: Rec) =>
  items.length === 1 && !completeRec(items[0] as Rec) ? [item] : [...items, item]
export const nodeKey = (node: RuleNode): string =>
  node.kind === 'CONDITION'
    ? node.id
    : `group_${node.children[0] ? nodeKey(node.children[0]) : 'empty'}`
export const newCondition = (): RuleNode => ({
  kind: 'CONDITION',
  id: `c_${crypto.randomUUID().replaceAll('-', '')}`,
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '0',
})
export const leafCount = (node: RuleNode): number =>
  node.kind === 'CONDITION' ? 1 : node.children.reduce((sum, child) => sum + leafCount(child), 0)
/** Removes indicator/activity bindings from every condition, e.g. after a project change. */
export function clearRecordBindings(node: RuleNode): RuleNode {
  if (node.kind === 'GROUP') return { ...node, children: node.children.map(clearRecordBindings) }
  const { indicatorId: _indicator, activityId: _activity, ...rest } = node
  return rest
}
export type Choice = { id: string; name: string }
/** The first measured evidence value against its threshold, or null when none was measured. */
export const basisLine = (alert: HumanAlert) => {
  const seen = alert.evidence.find((item) => item.cell.value !== null)
  return seen?.cell.value
    ? `Current ${metricLabel(seen.metric).toLowerCase()} ${formatMetricValue(seen.cell.value, seen.unit)} vs threshold ${formatMetricValue(seen.threshold, seen.unit)}`
    : null
}
export const codeLabel = (value: string) =>
  value === 'AUTO_RESOLVED' ? 'Auto-resolved' : value.replaceAll('_', ' ').toLowerCase()
export const manilaTime = (value: string) =>
  new Date(value)
    .toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(', ', ' ')
// Most severe first when the queue is sorted; unknown severities sort last.
export const alertSeverityRank = (value: string | null) => {
  const rank = (alertSeverities as readonly (string | null)[]).indexOf(value)
  return rank === -1 ? alertSeverities.length : rank
}
