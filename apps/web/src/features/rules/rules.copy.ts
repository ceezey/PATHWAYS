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
  criticalNote: 'Critical is set manually and is not suggested here.',
  howRaised: 'How each condition raises the level',
  highest: 'When several conditions match, the highest level wins.',
  combined:
    'Budget used at 90% or more together with a High delivery shortfall is named as a combined signal in the alert.',
  dates: 'The level depends on planned dates and totals known only when the alert fires.',
  explanatory:
    'These conditions explain the situation but have no separate severity, so their alerts show Needs context.',
  partlyExplanatory:
    'A match on time or on budget within plan alone has no separate severity and shows Needs context.',
  incomplete: 'Complete each condition to preview possible levels.',
} as const
export const severityTiles = [
  {
    level: 'LOW',
    label: 'Low',
    hint: 'Progress or milestone insight to carry into later planning',
    tile: 'border-border bg-muted text-muted-foreground',
  },
  {
    level: 'MEDIUM',
    label: 'Medium',
    hint: 'Worth reviewing at the next check-in',
    tile: 'border-info/30 bg-info-subtle text-info',
  },
  {
    level: 'HIGH',
    label: 'High',
    hint: 'Needs a response this reporting period',
    tile: 'border-warning/30 bg-warning-subtle text-warning',
  },
  {
    level: 'CRITICAL',
    label: 'Critical',
    hint: 'Needs attention before work continues',
    tile: 'border-danger/30 bg-danger-subtle text-danger',
  },
] as const
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
