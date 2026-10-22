'use client'

import type { DraftSummaryResponse } from '@pathways/shared'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'

import { needsCheckLabels } from '../../collection.copy'

/** The badges a field in the list carries after a draft from an import. */
export function fieldImportBadges(summary: DraftSummaryResponse, code: string) {
  const badges: Array<{ tone: 'info' | 'warning'; label: string }> = []
  if (summary.addedFields.includes(code)) badges.push({ tone: 'info', label: 'Added from import' })
  else if (
    [summary.sourceNamesAdded, summary.optionsAdded, summary.defaults, summary.rules].some(
      (codes) => codes.includes(code),
    )
  )
    badges.push({ tone: 'info', label: 'Changed by import' })
  if (summary.needsCheck.some((item) => item.fieldCode === code))
    badges.push({ tone: 'warning', label: 'Needs check' })
  return badges
}

const codesLine = (label: string, codes: string[]) =>
  codes.length ? `${label}: ${codes.join(', ')}` : null

/** What a draft from an import changed, with the items a person must confirm first. */
export function DraftSummaryPanel({
  summary,
  onSelectField,
}: {
  summary: DraftSummaryResponse
  onSelectField: (fieldCode: string) => void
}) {
  const changes = [
    codesLine('New fields', summary.addedFields),
    codesLine('Source names added to', summary.sourceNamesAdded),
    codesLine('Answer options added to', summary.optionsAdded),
    summary.aliasesAdded
      ? `${summary.aliasesAdded} value ${summary.aliasesAdded === 1 ? 'alias' : 'aliases'} added`
      : null,
    codesLine('Import defaults set on', summary.defaults),
    codesLine('Calculations or checks proposed on', summary.rules),
  ].filter((line): line is string => line !== null)
  return (
    <SectionCard
      title="Draft from import"
      description="Review these changes. Someone other than the last editor publishes the draft."
    >
      <div className="space-y-4">
        <section aria-labelledby="draft-needs-check" className="space-y-2">
          <h4 className="text-sm font-semibold" id="draft-needs-check">
            Needs check ({summary.needsCheck.length})
          </h4>
          {summary.needsCheck.length ? (
            <ul className="space-y-2">
              {summary.needsCheck.map((item) => (
                <li
                  key={`${item.fieldCode}-${item.reason}`}
                  className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-subtle p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <StatusBadge tone="warning">Needs check</StatusBadge>
                    <p className="text-sm font-medium text-foreground">{item.fieldCode}</p>
                    <p className="text-sm text-muted-foreground">{needsCheckLabels[item.reason]}</p>
                  </div>
                  <Button
                    aria-label={`Go to ${item.fieldCode}`}
                    type="button"
                    variant="outline"
                    onClick={() => onSelectField(item.fieldCode)}
                  >
                    Go to field
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing needs a second look.</p>
          )}
        </section>
        <section aria-labelledby="draft-changes" className="space-y-2">
          <h4 className="text-sm font-semibold" id="draft-changes">
            Changes in this draft
          </h4>
          {changes.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">The form already covered this file.</p>
          )}
        </section>
      </div>
    </SectionCard>
  )
}
