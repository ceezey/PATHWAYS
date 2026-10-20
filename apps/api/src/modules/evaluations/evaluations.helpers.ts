import { z } from 'zod'

export const criterionTypes = [
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
  'INDICATOR_LINKAGE',
  'ASSESSMENT_GAIN',
  'OTHER',
] as const
export type CriterionType = (typeof criterionTypes)[number]

// A criterion scored without data has commentary that starts with this marker.
export const noDataPrefix = 'No data: '

const manualMarker = ' Manual score recorded: '
// Splits stored commentary into the source, evidence, reason and manual note shown to readers.
export function classifyScoreCommentary(commentary: string | null, criterionType: string) {
  const text = commentary ?? ''
  const missing = text.startsWith(noDataPrefix)
  const marked = text.indexOf(manualMarker)
  const blank = text.trim() === ''
  // Rounds closed before automatic scoring, and scores written without commentary, are manual.
  const manual = !missing && (blank || criterionType === 'OTHER' || marked >= 0)
  const source = missing
    ? ('no_data' as const)
    : manual
      ? ('manual' as const)
      : ('computed' as const)
  return {
    source,
    evidence: source === 'computed' ? text : null,
    reason: missing ? text.slice(noDataPrefix.length) : null,
    note: manual && !blank ? (marked >= 0 ? text.slice(marked + manualMarker.length) : text) : null,
  }
}

// Evaluation and assessment ids are checked with the same UUID rule as project ids.
export const projectIdSchema = z.string().uuid()

// The calendar date of a stored date-only value.
export const day = (value: Date) => value.toISOString().slice(0, 10)
