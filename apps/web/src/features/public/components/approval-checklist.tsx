'use client'

import { Label } from '@/components/ui/label'
import type { MediaApprovalChecklist, PublicationApprovalChecklist } from '@pathways/shared'

// The wording is the Program Manager's to change; the keys are fixed by migration 0097.
export const publicationChecklistItems: Record<keyof PublicationApprovalChecklist, string> = {
  smallGroupsChecked: 'I checked every count under 5 on this page and it cannot identify a person.',
  noIdentifiableMinor: 'No photo, video or caption identifies a minor.',
  imageConsentOnFile: 'Consent is on file for every person who can be recognised.',
  pinPositionsAcceptable: 'The map pins do not point to a home or another private place.',
}
export const mediaChecklistItems: Record<keyof MediaApprovalChecklist, string> = {
  noIdentifiableMinor: publicationChecklistItems.noIdentifiableMinor,
  imageConsentOnFile: publicationChecklistItems.imageConsentOnFile,
}

// True once every item of the list is ticked.
export const checklistComplete = (items: Record<string, string>, ticked: ReadonlySet<string>) =>
  Object.keys(items).every((key) => ticked.has(key))

// The approver's confirmations; the parent enables Approve only once every box is ticked, and the hint says why.
export const ApprovalChecklist = ({
  idPrefix,
  items,
  ticked,
  disabled,
  onChange,
}: {
  idPrefix: string
  items: Record<string, string>
  ticked: ReadonlySet<string>
  disabled?: boolean
  onChange: (next: Set<string>) => void
}) => {
  const total = Object.keys(items).length
  const done = Object.keys(items).filter((key) => ticked.has(key)).length
  const hintId = `${idPrefix}-hint`
  return (
    <fieldset aria-describedby={hintId} className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-foreground">
        Confirm before approving
      </legend>
      <output aria-live="polite" className="mb-2 block text-xs text-muted-foreground" id={hintId}>
        {done === total
          ? `All ${total} items confirmed.`
          : `Tick every item to enable approval (${done} of ${total} ticked).`}
      </output>
      {Object.entries(items).map(([key, label]) => (
        <Label
          className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm"
          htmlFor={`${idPrefix}-${key}`}
          key={key}
        >
          <input
            aria-describedby={hintId}
            aria-required
            checked={ticked.has(key)}
            className="h-4 w-4 rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={disabled}
            id={`${idPrefix}-${key}`}
            onChange={(event) => {
              const next = new Set(ticked)
              if (event.target.checked) next.add(key)
              else next.delete(key)
              onChange(next)
            }}
            type="checkbox"
          />
          <span>
            {label}
            <span aria-hidden="true" className="ml-1 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </span>
        </Label>
      ))}
    </fieldset>
  )
}
