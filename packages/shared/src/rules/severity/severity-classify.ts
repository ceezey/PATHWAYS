import {
  divideRounded,
  fixedDecimal,
  isCalendarDate,
  scaledDecimal,
} from '../../metrics/metric-math'
import type { RuleCondition, RuleNode } from '../rule-contract'
import {
  COMBINATION_BUDGET_PERCENT,
  type ClassifyInput,
  type ConditionBasis,
  DELIVERY_METRICS,
  type RuleExpectations,
  SEVERITY_BOUNDS,
  SEVERITY_CRITERIA_VERSION,
  type SeverityBasis,
  type SeverityFacts,
  type SeverityLevel,
  type SeverityMeasure,
  type SeverityMissing,
  severityLevels,
} from './severity-criteria'

type Result = ClassifyInput['results'][string]
/** Exact rational n / d with d > 0, so no rounding happens before a threshold comparison. */
type Ratio = { n: bigint; d: bigint }
const SCALE = 10000n
const decimal = (value: string): Ratio => ({ n: scaledDecimal(value), d: SCALE })
const whole = (value: bigint): Ratio => ({ n: value, d: 1n })
const shown = (ratio: Ratio) => fixedDecimal(divideRounded(ratio.n * SCALE, ratio.d))
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const rank = (level: SeverityLevel | null) => (level === null ? -1 : severityLevels.indexOf(level))

function levelOf(kind: SeverityMeasure['kind'], value: Ratio): SeverityLevel {
  const [low, medium] = SEVERITY_BOUNDS[kind]
  if (value.n <= low * value.d) return 'LOW'
  return value.n <= medium * value.d ? 'MEDIUM' : 'HIGH'
}
const context = (c: RuleCondition, missing: SeverityMissing): ConditionBasis => ({
  conditionId: c.id,
  metric: c.metric,
  outcome: 'CONTEXT_REQUIRED',
  level: null,
  measure: null,
  missing,
})
const explanatory = (c: RuleCondition, measure: SeverityMeasure | null = null): ConditionBasis => ({
  conditionId: c.id,
  metric: c.metric,
  outcome: 'EXPLANATORY',
  level: null,
  measure,
  missing: null,
})
function measured(
  c: RuleCondition,
  kind: SeverityMeasure['kind'],
  actual: Ratio,
  expected: Ratio | null,
  value: Ratio,
): ConditionBasis {
  return {
    conditionId: c.id,
    metric: c.metric,
    outcome: 'LEVEL',
    level: levelOf(kind, value),
    measure: {
      kind,
      actual: shown(actual),
      expected: expected && shown(expected),
      value: shown(value),
    },
    missing: null,
  }
}

/** Whole calendar days from start to end, or null when either date is missing, invalid or reversed. */
function daysBetween(start?: string | null, end?: string | null): bigint | null {
  if (!start || !end || !isCalendarDate(start) || !isCalendarDate(end) || end < start) return null
  return BigInt((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000)
}

/** Shortfall (expected - actual) / expected * 100; a zero expectation has no shortfall. */
function behind(c: RuleCondition, actual: string, expected: Ratio): ConditionBasis {
  const a = scaledDecimal(actual)
  const value =
    expected.n === 0n
      ? whole(0n)
      : { n: (expected.n * SCALE - a * expected.d) * 100n, d: SCALE * expected.n }
  return measured(c, 'BEHIND_PERCENT', decimal(actual), expected, value)
}

/** Delay as a share of a planned duration in days. */
function delay(
  c: RuleCondition,
  days: bigint,
  duration: bigint | null,
  noDates: SeverityMissing,
  sameDay: SeverityMissing,
): ConditionBasis {
  if (duration === null) return context(c, noDates)
  if (duration === 0n) return context(c, sameDay)
  return measured(c, 'DELAY_SHARE', { n: days, d: SCALE }, whole(duration), {
    n: days * 100n,
    d: SCALE * duration,
  })
}

function judge(c: RuleCondition, f: SeverityFacts, e: RuleExpectations): ConditionBasis {
  switch (c.metric) {
    case 'INDICATOR_CURRENT_VALUE':
    case 'INDICATOR_PROGRESS_PERCENT': {
      const progress = c.metric === 'INDICATOR_PROGRESS_PERCENT' ? f.value : f.progress
      if (progress == null) return context(c, 'INDICATOR_BASELINE_TARGET_DIRECTION')
      const due = f.targetDate ?? f.periodEnd
      if (!due || !isCalendarDate(due) || f.reportingDate < due)
        return context(c, 'EXPECTED_PROGRESS_FOR_DATE')
      return behind(c, progress, whole(100n))
    }
    case 'ACTIVITY_COMPLETION_PERCENT':
      if (!f.included || f.included <= 0 || f.dueByDate == null) return context(c, 'ACTIVITY_TOTAL')
      if (f.missingEnd !== 0) return context(c, 'ACTIVITY_PLANNED_END_DATES')
      return behind(c, f.value, { n: BigInt(f.dueByDate) * 100n, d: BigInt(f.included) })
    case 'ACTIVITY_OVERDUE_COUNT': {
      if (!f.included || f.included <= 0) return context(c, 'ACTIVITY_TOTAL')
      if (f.missingEnd !== 0) return context(c, 'ACTIVITY_PLANNED_END_DATES')
      const count = scaledDecimal(f.value)
      const included = BigInt(f.included)
      return measured(c, 'OVERDUE_SHARE', decimal(f.value), whole(included), {
        n: count * 100n,
        d: SCALE * included,
      })
    }
    case 'PROJECT_TIMELINE_ELAPSED_PERCENT':
      return explanatory(c)
    case 'PROJECT_REMAINING_DAYS': {
      const days = scaledDecimal(f.value)
      if (days >= 0n) return explanatory(c)
      const duration = daysBetween(f.startDate, f.endDate)
      return delay(c, -days, duration, 'PROJECT_DATES', 'SAME_DAY_PROJECT')
    }
    case 'PROJECT_OVERDUE_DAYS':
      return delay(
        c,
        scaledDecimal(f.value),
        daysBetween(f.startDate, f.endDate),
        'PROJECT_DATES',
        'SAME_DAY_PROJECT',
      )
    case 'ACTIVITY_OVERDUE_DAYS':
      return delay(
        c,
        scaledDecimal(f.value),
        daysBetween(f.activityStart, f.activityEnd),
        'ACTIVITY_DATES',
        'SAME_DAY_ACTIVITY',
      )
    case 'BUDGET_UTILIZATION_PERCENT': {
      const used = decimal(f.value)
      if (used.n <= SEVERITY_BOUNDS.BUDGET_PERCENT[0] * SCALE)
        return explanatory(c, {
          kind: 'BUDGET_PERCENT',
          actual: shown(used),
          expected: null,
          value: shown(used),
        })
      return measured(c, 'BUDGET_PERCENT', used, null, used)
    }
    case 'BENEFICIARY_FOLLOW_UP_PERCENT': {
      const manageable = e.manageableFollowUpPercent
      if (manageable == null) return context(c, 'MANAGEABLE_FOLLOW_UP_LEVEL')
      const above = scaledDecimal(f.value) - scaledDecimal(manageable)
      return measured(c, 'POINTS_ABOVE', decimal(f.value), decimal(manageable), {
        n: above,
        d: SCALE,
      })
    }
    case 'SURVEY_MEAN_IMPROVEMENT_POINTS': {
      const expected = e.expectedScoreImprovement
      if (expected == null) return context(c, 'EXPECTED_SCORE_IMPROVEMENT')
      const below = scaledDecimal(expected) - scaledDecimal(f.value)
      return measured(c, 'POINTS_BELOW', decimal(f.value), decimal(expected), {
        n: below,
        d: SCALE,
      })
    }
  }
}

/** Three-valued group result, as in the rule engine. */
function resultOf(node: RuleNode, results: ClassifyInput['results']): Result {
  if (node.kind === 'CONDITION') return results[node.id] ?? 'UNAVAILABLE'
  const values = node.children.map((child) => resultOf(child, results))
  const decisive = node.mode === 'AND' ? 'FALSE' : 'TRUE'
  if (values.includes(decisive)) return decisive
  if (values.includes('UNAVAILABLE')) return 'UNAVAILABLE'
  return node.mode === 'AND' ? 'TRUE' : 'FALSE'
}
const leaves = (node: RuleNode): RuleCondition[] =>
  node.kind === 'CONDITION' ? [node] : node.children.flatMap(leaves)

/** Collects conditions that caused the match and unavailable leaves of unconfirmed OR siblings. */
function collect(
  node: RuleNode,
  results: ClassifyInput['results'],
  counted: RuleCondition[],
  unchecked: string[],
) {
  if (node.kind === 'CONDITION') {
    counted.push(node)
    return
  }
  for (const child of node.children) {
    const result = resultOf(child, results)
    if (result === 'TRUE') collect(child, results, counted, unchecked)
    else if (result === 'UNAVAILABLE')
      for (const leaf of leaves(child))
        if (resultOf(leaf, results) === 'UNAVAILABLE') unchecked.push(leaf.id)
  }
}

export function classifyAlertSeverity(input: ClassifyInput): SeverityBasis {
  if (resultOf(input.tree, input.results) !== 'TRUE')
    throw new Error('Only a matched rule has a severity.')
  const counted: RuleCondition[] = []
  const unchecked: string[] = []
  collect(input.tree, input.results, counted, unchecked)
  // The same figure counts once, kept under its first condition id.
  const figures = new Set<string>()
  const conditions = counted
    .sort((a, b) => byText(a.id, b.id))
    .filter((c) => {
      const figure = `${c.metric}|${c.indicatorId ?? ''}|${c.activityId ?? ''}`
      if (figures.has(figure)) return false
      figures.add(figure)
      return true
    })
    .map((c) => {
      const facts = input.facts[c.id]
      if (!facts) throw new Error(`Severity facts are missing for condition ${c.id}.`)
      return judge(c, facts, input.expectations)
    })
  const known = conditions.filter((c) => c.outcome === 'LEVEL')
  const top = known.reduce<SeverityLevel | null>(
    (best, c) => (rank(c.level) > rank(best) ? c.level : best),
    null,
  )
  const spending = conditions.some(
    (c) =>
      c.metric === 'BUDGET_UTILIZATION_PERCENT' &&
      c.measure !== null &&
      scaledDecimal(c.measure.actual) >= COMBINATION_BUDGET_PERCENT * SCALE,
  )
  const delivery = spending
    ? known.find((c) => c.level === 'HIGH' && DELIVERY_METRICS.includes(c.metric))
    : undefined
  const decisive = delivery ?? known.find((c) => c.level === top)
  let missing = [
    ...new Set(conditions.flatMap((c) => (c.missing === null ? [] : [c.missing]))),
  ].sort(byText)
  if (top === null && missing.length === 0) missing = ['DELIVERY_EXPECTATION']
  const classified = top === 'HIGH' || (top !== null && missing.length === 0)
  return {
    criteriaVersion: SEVERITY_CRITERIA_VERSION,
    status: classified ? 'CLASSIFIED' : 'CONTEXT_REQUIRED',
    level: classified ? top : null,
    supportedLevel: top,
    decisiveConditionId: decisive?.conditionId ?? null,
    combination: delivery ? 'HIGH_SPENDING_LOW_DELIVERY' : null,
    manualCritical: input.ruleSeverity === 'CRITICAL',
    conditions,
    missing,
    unchecked: [...new Set(unchecked)].sort(byText),
  }
}
