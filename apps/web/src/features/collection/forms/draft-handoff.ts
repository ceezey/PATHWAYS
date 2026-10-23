import type { DraftSummaryResponse } from '@pathways/shared'

// Carries the change summary of a draft prepared in the Import workspace to the form editor that opens next.
let pending: { formId: string; summary: DraftSummaryResponse } | null = null

export function stashDraftSummary(formId: string, summary: DraftSummaryResponse) {
  pending = { formId, summary }
}

/** Returns the stashed summary for this form once, and clears it. */
export function takeDraftSummary(formId: string) {
  if (pending?.formId !== formId) return null
  const { summary } = pending
  pending = null
  return summary
}
