import type { DraftSummaryResponse } from '@pathways/shared'

export type NeedsCheckReason = DraftSummaryResponse['needsCheck'][number]['reason']

// The control in a field's Advanced Configuration where a person settles an item; a disagreeing disability column is settled by checking the file instead.
const sectionOfReason: Partial<Record<NeedsCheckReason, 'source' | 'aliases' | 'rule' | 'key'>> = {
  CONSENT_SOURCE_PROPOSED: 'source',
  ENUM_ANSWER_UNRESOLVED: 'aliases',
  PARTICIPATION_CONSENT_NO_SOURCE: 'rule',
  ANSWER_KEY_NEEDED: 'key',
}

/** True when a person settles this item in the field's Advanced Configuration; the answer key has its own section. */
export const settledInIntake = (reason: NeedsCheckReason) =>
  reason in sectionOfReason && reason !== 'ANSWER_KEY_NEEDED'

const highlight = 'bg-warning-subtle'
export const highlightMs = 2000
let clearHighlight: (() => void) | undefined

/** Opens the field's Advanced Configuration or answer key, scrolls to the control for this item, highlights it briefly and moves focus there. */
export function revealIntakeSection(fieldId: string, reason: NeedsCheckReason) {
  const name = sectionOfReason[reason]
  const details = document.getElementById(
    `${fieldId}-${name === 'key' ? 'key' : 'intake'}`,
  ) as HTMLDetailsElement | null
  if (!name || !details) return
  details.open = true
  const section = details.querySelector<HTMLElement>(`[data-intake-section="${name}"]`) ?? details
  clearHighlight?.()
  section.classList.add(highlight)
  const timer = setTimeout(() => clearHighlight?.(), highlightMs)
  clearHighlight = () => {
    clearTimeout(timer)
    section.classList.remove(highlight)
    clearHighlight = undefined
  }
  section.scrollIntoView({ block: 'center' })
  section
    .querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), [data-intake-add]:not(:disabled)',
    )
    ?.focus({ preventScroll: true })
}
