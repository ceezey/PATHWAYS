import { titleCase } from './rules.utils'

export const comparisonCopy = {
  LT: 'Below (<)',
  LTE: 'At most (<=)',
  EQ: 'Equal to (=)',
  GTE: 'At least (>=)',
  GT: 'Above (>)',
  BETWEEN: 'Between',
} as const
// Step 3 copy: the system suggests Low, Medium or High when an alert fires; only Critical is set by the author.
export const severityStepCopy = {
  title: 'How should this read?',
  hint: 'The system suggests severity from actual figures when the alert fires.',
  manual: 'Critical is set manually.',
  critical: 'Mark as Critical (manual judgment)',
  criticalHint:
    'Alerts from this rule show Critical: manual judgment by rule author, with the suggested level and its reason beside it.',
  dates: 'The level depends on planned dates and totals known only when the alert fires.',
  explanatory:
    'These conditions explain the situation but have no separate severity, so their alerts show Needs context.',
  partlyExplanatory:
    'A match on time or on budget within plan alone has no separate severity and shows Needs context.',
  incomplete: 'Complete each condition to preview possible levels.',
} as const
const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  REVIEWED: 'Reviewed',
  ACTIONED: 'Actioned',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  AUTO_RESOLVED: 'Auto-resolved',
}
/** Unknown statuses fall back to title case instead of failing. */
export const statusLabel = (status: string) => STATUS_LABELS[status] ?? titleCase(status)
const BASIS_LABELS: Record<string, string> = {
  KPI: 'Based on indicator (KPI) results',
  COMBINED: 'Based on project monitoring signals',
}
/** Plain-language basis; unknown or free-text values pass through with a Based on prefix. */
export const basisLabel = (basis: string) =>
  BASIS_LABELS[basis] ?? (basis.startsWith('Based on') ? basis : `Based on ${basis}`)
