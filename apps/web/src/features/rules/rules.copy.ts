import type { HumanRule } from '@pathways/shared'
import { titleCase } from './rules.utils'

export const comparisonCopy = {
  LT: 'Below (<)',
  LTE: 'At most (<=)',
  EQ: 'Equal to (=)',
  GTE: 'At least (>=)',
  GT: 'Above (>)',
  BETWEEN: 'Between',
} as const
// Each severity carries the reading an officer should take from it, including the
// low end used for progress and milestone insight rather than risk. The picker keeps
// High and Critical apart, so it maps per level rather than reusing severityTone.
export const severityCopy: Record<
  HumanRule['severity'],
  { label: string; hint: string; tile: string }
> = {
  LOW: {
    label: 'Low',
    hint: 'Progress or milestone insight to carry into later planning',
    tile: 'border-border bg-muted text-muted-foreground',
  },
  MEDIUM: {
    label: 'Medium',
    hint: 'Worth reviewing at the next check-in',
    tile: 'border-info/30 bg-info-subtle text-info',
  },
  HIGH: {
    label: 'High',
    hint: 'Needs a response this reporting period',
    tile: 'border-warning/30 bg-warning-subtle text-warning',
  },
  CRITICAL: {
    label: 'Critical',
    hint: 'Needs attention before work continues',
    tile: 'border-danger/30 bg-danger-subtle text-danger',
  },
}
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
