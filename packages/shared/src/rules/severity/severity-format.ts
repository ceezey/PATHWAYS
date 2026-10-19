import { decimalString, scaledDecimal } from '../../metrics/metric-math'
import {
  COMBINATION_SECTION,
  type ConditionBasis,
  SEVERITY_SECTIONS,
  type SeverityBasis,
  type SeverityLevel,
  type SeverityMissing,
} from './severity-criteria'

/** Plain-language request for each missing item (guide 3 and 7). */
export const SEVERITY_MISSING_TEXT: Record<SeverityMissing, string> = {
  EXPECTED_PROGRESS_FOR_DATE:
    'We need the approved expected progress for this date before suggesting a level.',
  INDICATOR_BASELINE_TARGET_DIRECTION:
    'We need a usable starting value, target and direction for this indicator.',
  ACTIVITY_PLANNED_END_DATES: 'We need a planned end date for every included activity.',
  ACTIVITY_TOTAL: 'We need the total number of included activities.',
  PROJECT_DATES: 'We need valid project start and end dates.',
  SAME_DAY_PROJECT:
    'We need an agreed delay rule for a project that starts and ends on the same day.',
  ACTIVITY_DATES: 'We need valid planned start and end dates for this activity.',
  SAME_DAY_ACTIVITY:
    'We need an agreed delay rule for an activity that starts and ends on the same day.',
  EXPECTED_SCORE_IMPROVEMENT: 'We need the expected score improvement for this assessment.',
  MANAGEABLE_FOLLOW_UP_LEVEL: 'We need the manageable follow-up level for this group.',
  DELIVERY_EXPECTATION: 'We need the related delivery expectation before suggesting a level.',
}
const TIME_TEXT = 'Time helps explain the situation; it has no separate severity.'

export const severityLabel = (level: SeverityLevel) => `${level[0]}${level.slice(1).toLowerCase()}`
const num = (value: string) => decimalString(scaledDecimal(value))
const signed = (value: string) => `${scaledDecimal(value) >= 0n ? '+' : ''}${num(value)}`
const positive = (value: string) => scaledDecimal(value) > 0n
const days = (value: string) => `${num(value)} ${num(value) === '1' ? 'day' : 'days'}`

/** One sentence naming the figure and the expectation it was compared with. */
function sentence(c: ConditionBasis): string {
  const m = c.measure
  if (!m) return ''
  const expected = m.expected ?? ''
  const shortfall = positive(m.value)
    ? `which is ${num(m.value)}% behind the expectation.`
    : 'which is on or ahead of the expectation.'
  switch (m.kind) {
    case 'BEHIND_PERCENT':
      if (c.metric === 'ACTIVITY_COMPLETION_PERCENT')
        return `The plan expected ${num(expected)}% of activities completed by the reporting date. Actual completion is ${num(m.actual)}%, ${shortfall}`
      if (c.metric === 'INDICATOR_CURRENT_VALUE')
        return `The plan expected ${num(expected)}% progress by the reporting date. The current value gives ${num(m.actual)}% progress, ${shortfall}`
      return `The plan expected ${num(expected)}% progress by the reporting date. Actual progress is ${num(m.actual)}%, ${shortfall}`
    case 'DELAY_SHARE':
      return c.metric === 'ACTIVITY_OVERDUE_DAYS'
        ? `The activity is ${days(m.actual)} overdue, ${num(m.value)}% of its planned ${days(expected)}.`
        : `The project is ${days(m.actual)} past its end date, ${num(m.value)}% of its planned ${days(expected)}.`
    case 'OVERDUE_SHARE':
      return `Overdue activities are ${num(m.actual)} of ${num(expected)} included, ${num(m.value)}% of the list.`
    case 'BUDGET_PERCENT':
      return c.outcome === 'LEVEL'
        ? `Budget used is ${num(m.actual)}%, which is above the planned budget.`
        : `Budget used is ${num(m.actual)}%; spending helps explain the situation but has no separate severity.`
    case 'POINTS_ABOVE':
      return `Beneficiaries needing follow-up are ${num(m.actual)}% against a manageable level of ${num(expected)}%, ${
        positive(m.value)
          ? `${num(m.value)} points above that level.`
          : 'which is at or below that level.'
      }`
    case 'POINTS_BELOW':
      return `Expected ${signed(expected)} points, actual ${signed(m.actual)}, ${
        positive(m.value) ? `${num(m.value)} points below.` : 'at or above the expectation.'
      }`
  }
}

/** Headline, one-paragraph reason, missing requests and the cited guide section for a basis. */
export function formatSeverityBasis(basis: SeverityBasis): {
  headline: string
  reason: string
  missing: string[]
  section: string
} {
  const decisive = basis.conditions.find((c) => c.conditionId === basis.decisiveConditionId)
  const first =
    decisive ??
    basis.conditions.find((c) => c.outcome === 'CONTEXT_REQUIRED') ??
    basis.conditions[0]
  const section = basis.combination
    ? COMBINATION_SECTION
    : first
      ? SEVERITY_SECTIONS[first.metric]
      : COMBINATION_SECTION
  const budget = basis.conditions.find((c) => c.metric === 'BUDGET_UTILIZATION_PERCENT')
  const parts: string[] = []
  if (basis.status === 'CONTEXT_REQUIRED')
    parts.push(
      basis.supportedLevel
        ? `${severityLabel(basis.supportedLevel)} already supported.`
        : 'More information is needed before suggesting a level.',
    )
  if (decisive) parts.push(sentence(decisive))
  if (basis.combination && budget?.measure)
    parts.push(
      `Budget used is ${num(budget.measure.actual)}%, so the linked spending supports the concern.`,
    )
  else if (budget && budget.outcome === 'EXPLANATORY') parts.push(sentence(budget))
  if (
    basis.conditions.some(
      (c) =>
        c.outcome === 'EXPLANATORY' &&
        (c.metric === 'PROJECT_TIMELINE_ELAPSED_PERCENT' || c.metric === 'PROJECT_REMAINING_DAYS'),
    )
  )
    parts.push(TIME_TEXT)
  if (basis.unchecked.length > 0) parts.push('Some other conditions could not be checked.')
  parts.push(`(Severity Guide v0.2, ${section})`)
  return {
    headline:
      basis.status === 'CLASSIFIED' && basis.level
        ? `Suggested severity: ${severityLabel(basis.level)}.`
        : 'Needs context.',
    reason: parts.join(' '),
    missing: basis.missing.map((code) => SEVERITY_MISSING_TEXT[code]),
    section,
  }
}
