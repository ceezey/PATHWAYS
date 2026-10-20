import { titleCase } from './rules.utils'

export const comparisonCopy = {
  LT: 'Below (<)',
  LTE: 'At most (<=)',
  EQ: 'Equal to (=)',
  GTE: 'At least (>=)',
  GT: 'Above (>)',
  BETWEEN: 'Between',
} as const
const listLabels = (labels: string[]) =>
  new Intl.ListFormat('en', { type: 'conjunction' }).format(labels)
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
  explanatory: 'This alert will say Needs context instead of Low, Medium or High.',
  howToToggle: 'How can I get a level?',
  partlyExplanatory: (labels: string[]) =>
    `${listLabels(labels)} alone ${labels.length > 1 ? 'set' : 'sets'} no level; your other conditions set it.`,
  incomplete: 'Complete each condition to preview possible levels.',
} as const
// Why a time or budget condition sets no level, and the smallest change that gives one.
export const noLevelCopy: Partial<Record<string, { why: string; tip: string }>> = {
  PROJECT_REMAINING_DAYS: {
    why: 'Days until project end only gets a level after the end date has passed.',
    tip: 'Fine as a reminder. For a level, use a value below 0 to be alerted after the end date; the level then depends on how late the project is.',
  },
  PROJECT_TIMELINE_ELAPSED_PERCENT: {
    why: 'Project timeline elapsed measures time, not work done, so it never gets a level.',
    tip: 'Fine as a reminder. To also see whether work is behind, tick Activity in step 1, then add Activities completed in step 2.',
  },
  BUDGET_UTILIZATION_PERCENT: {
    why: 'Budget used only gets a level above 100%, when spending goes over budget.',
    tip: 'Fine for watching spending. For a level, use a value above 100%; overspending gets Medium or High.',
  },
}
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
