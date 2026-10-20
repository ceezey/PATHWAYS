import { type RuleExpectations, SEVERITY_BOUNDS } from '@pathways/shared'
import { previewSeverity } from './rule-severity.utils'
import { severityStepCopy as copy } from './rules.copy'
import { type Leaf, conditionSentence } from './rules.utils'

export type ConditionExplanation = { id: string; condition: string; text: string }

const bands = (kind: keyof typeof SEVERITY_BOUNDS, unit: string, tail = '') => {
  const [low, medium] = SEVERITY_BOUNDS[kind]
  return `Low up to ${low}${unit}${tail}, Medium up to ${medium}${unit}, High above ${medium}${unit}`
}
const entered = (value: string | null | undefined, unit: string) =>
  value?.trim() ? ` of ${value.trim()}${unit}` : ' (enter it below)'
const explainsOnly = 'explains the situation only and sets no level'
const lateDays = (subject: string) =>
  `Days past the end date are compared with ${subject} planned length: ${bands('DELAY_SHARE', '%')}.`

const explain = (leaf: Leaf, expectations: RuleExpectations): string => {
  switch (leaf.metric) {
    case 'PROJECT_OVERDUE_DAYS':
      return lateDays('the project’s')
    case 'ACTIVITY_OVERDUE_DAYS':
      return lateDays('the activity’s')
    case 'PROJECT_REMAINING_DAYS':
      return `Before the end date this ${explainsOnly}. Once it has passed: ${bands('DELAY_SHARE', '%')} of the planned length.`
    case 'ACTIVITY_OVERDUE_COUNT':
      return `Overdue activities are compared with all included activities: ${bands('OVERDUE_SHARE', '%')}.`
    case 'ACTIVITY_COMPLETION_PERCENT':
      return `Completion is compared with the share of activities planned to be done by now: ${bands('BEHIND_PERCENT', '%', ' behind')}.`
    case 'INDICATOR_PROGRESS_PERCENT':
      return `Progress is compared with the full target once the target date is reached: ${bands('BEHIND_PERCENT', '%', ' behind')}. Before that date the alert shows Needs context.`
    case 'INDICATOR_CURRENT_VALUE':
      return `The value becomes progress using the indicator’s baseline, target and direction, then is compared with the full target once the target date is reached: ${bands('BEHIND_PERCENT', '%', ' behind')}.`
    case 'BUDGET_UTILIZATION_PERCENT': {
      const [within, medium] = SEVERITY_BOUNDS.BUDGET_PERCENT
      return `Spending of ${within}% or less ${explainsOnly}; above ${within}% up to ${medium}% is Medium and above ${medium}% is High.`
    }
    case 'BENEFICIARY_FOLLOW_UP_PERCENT':
      return `Follow-up is compared with the manageable level${entered(expectations.manageableFollowUpPercent, '%')}: ${bands('POINTS_ABOVE', ' points', ' above it')}.`
    case 'SURVEY_MEAN_IMPROVEMENT_POINTS':
      return `Score change is compared with the expected improvement${entered(expectations.expectedScoreImprovement, ' points')}: ${bands('POINTS_BELOW', ' points', ' short')}.`
    default:
      return ''
  }
}

/** One plain sentence per condition on how the level will be raised; conditions that never set one are left to the summary. */
export const explainConditions = (
  conditions: Leaf[],
  expectations: RuleExpectations,
): ConditionExplanation[] =>
  conditions
    .filter((leaf) => !previewSeverity(leaf, expectations).explanatoryOnly)
    .map((leaf) => ({
      id: leaf.id,
      condition: conditionSentence(leaf),
      text: explain(leaf, expectations),
    }))
    .filter((item) => item.text)

/** Metrics of the conditions in the rule that can match without setting a level. */
export const explanatoryMetrics = (
  conditions: Leaf[],
  expectations: RuleExpectations,
): string[] => [
  ...new Set(
    conditions
      .filter((leaf) => previewSeverity(leaf, expectations).needs.includes('DELIVERY_EXPECTATION'))
      .map((leaf) => leaf.metric),
  ),
]

const DELIVERY = [
  'INDICATOR_PROGRESS_PERCENT',
  'INDICATOR_CURRENT_VALUE',
  'ACTIVITY_COMPLETION_PERCENT',
]
/** Notes on how several matching conditions combine. */
export const explainCombination = (conditions: Leaf[]): string[] => {
  const metrics = new Set<string>(conditions.map((leaf) => leaf.metric))
  return [
    ...(conditions.length > 1 ? [copy.highest] : []),
    ...(metrics.has('BUDGET_UTILIZATION_PERCENT') && DELIVERY.some((metric) => metrics.has(metric))
      ? [copy.combined]
      : []),
  ]
}
