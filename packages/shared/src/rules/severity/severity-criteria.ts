import type { RuleMetricKey, RuleNode } from '../rule-contract'

/** Severity Guide v0.2 as approved in cr-pathways-severity-classification sections 3.2 to 3.6. */
export const SEVERITY_CRITERIA_VERSION = 'severity-guide-v0.2'
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export const severityLevels: readonly SeverityLevel[] = ['LOW', 'MEDIUM', 'HIGH']

/** Planning facts for one condition; decimals as strings, dates as YYYY-MM-DD. */
export type SeverityFacts = {
  metric: RuleMetricKey
  value: string
  reportingDate: string
  progress?: string | null
  targetDate?: string | null
  periodEnd?: string | null
  startDate?: string | null
  endDate?: string | null
  included?: number | null
  dueByDate?: number | null
  missingEnd?: number | null
  activityStart?: string | null
  activityEnd?: string | null
}
export type RuleExpectations = {
  expectedScoreImprovement?: string | null
  manageableFollowUpPercent?: string | null
}
export type SeverityMissing =
  | 'EXPECTED_PROGRESS_FOR_DATE'
  | 'INDICATOR_BASELINE_TARGET_DIRECTION'
  | 'ACTIVITY_PLANNED_END_DATES'
  | 'ACTIVITY_TOTAL'
  | 'PROJECT_DATES'
  | 'SAME_DAY_PROJECT'
  | 'ACTIVITY_DATES'
  | 'SAME_DAY_ACTIVITY'
  | 'EXPECTED_SCORE_IMPROVEMENT'
  | 'MANAGEABLE_FOLLOW_UP_LEVEL'
  | 'DELIVERY_EXPECTATION'
export type SeverityMeasure = {
  kind:
    | 'BEHIND_PERCENT'
    | 'DELAY_SHARE'
    | 'OVERDUE_SHARE'
    | 'BUDGET_PERCENT'
    | 'POINTS_ABOVE'
    | 'POINTS_BELOW'
  actual: string
  expected: string | null
  value: string
}
export type ConditionBasis = {
  conditionId: string
  metric: RuleMetricKey
  outcome: 'LEVEL' | 'EXPLANATORY' | 'CONTEXT_REQUIRED'
  level: SeverityLevel | null
  measure: SeverityMeasure | null
  missing: SeverityMissing | null
}
export type SeverityBasis = {
  criteriaVersion: typeof SEVERITY_CRITERIA_VERSION
  status: 'CLASSIFIED' | 'CONTEXT_REQUIRED'
  level: SeverityLevel | null
  supportedLevel: SeverityLevel | null
  decisiveConditionId: string | null
  combination: 'HIGH_SPENDING_LOW_DELIVERY' | null
  manualCritical: boolean
  conditions: ConditionBasis[]
  missing: SeverityMissing[]
  unchecked: string[]
}
export type ClassifyInput = {
  tree: RuleNode
  results: Record<string, 'TRUE' | 'FALSE' | 'UNAVAILABLE'>
  facts: Record<string, SeverityFacts>
  expectations: RuleExpectations
  ruleSeverity: 'CRITICAL' | null
}

/** Inclusive upper bounds of Low and Medium; above the second is High (budget's first bound is explanatory). */
export const SEVERITY_BOUNDS = {
  BEHIND_PERCENT: [10n, 25n],
  DELAY_SHARE: [5n, 10n],
  OVERDUE_SHARE: [5n, 15n],
  BUDGET_PERCENT: [100n, 110n],
  POINTS_ABOVE: [5n, 15n],
  POINTS_BELOW: [5n, 10n],
} as const satisfies Record<SeverityMeasure['kind'], readonly [bigint, bigint]>

/** Budget used from which High delivery shortfall names the high spending combination. */
export const COMBINATION_BUDGET_PERCENT = 90n
export const DELIVERY_METRICS: readonly RuleMetricKey[] = [
  'INDICATOR_CURRENT_VALUE',
  'INDICATOR_PROGRESS_PERCENT',
  'ACTIVITY_COMPLETION_PERCENT',
]

/** Guide section cited for each metric; the combination cites section 6. */
export const SEVERITY_SECTIONS: Record<RuleMetricKey, string> = {
  INDICATOR_CURRENT_VALUE: '5.1',
  INDICATOR_PROGRESS_PERCENT: '5.2',
  PROJECT_TIMELINE_ELAPSED_PERCENT: '5.3',
  PROJECT_REMAINING_DAYS: '5.4',
  PROJECT_OVERDUE_DAYS: '5.5',
  ACTIVITY_COMPLETION_PERCENT: '5.6',
  ACTIVITY_OVERDUE_COUNT: '5.7',
  ACTIVITY_OVERDUE_DAYS: '5.8',
  BUDGET_UTILIZATION_PERCENT: '5.9',
  BENEFICIARY_FOLLOW_UP_PERCENT: '5.10',
  SURVEY_MEAN_IMPROVEMENT_POINTS: '5.11',
  KPI_ACHIEVEMENT_PERCENT: '5.12',
  SURVEY_MEAN_PRE_TEST_PERCENT: '5.13',
  SURVEY_MEAN_POST_TEST_PERCENT: '5.14',
}
export const COMBINATION_SECTION = '6'
