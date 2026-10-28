'use client'

import type { DraftSummaryResponse } from '@pathways/shared'

import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { needsCheckLabels } from '../../collection.copy'
import { type FormField, tableHeadClass } from '../../collection.utils'

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

// Each kind of change, with its tag in the table and its words in the counts line.
const changeKinds = [
  { key: 'addedFields', tag: 'New', one: 'new field', many: 'new fields' },
  {
    key: 'sourceNamesAdded',
    tag: 'Source names',
    one: 'with new source names',
    many: 'with new source names',
  },
  {
    key: 'optionsAdded',
    tag: 'Answer options',
    one: 'with new answer options',
    many: 'with new answer options',
  },
  { key: 'defaults', tag: 'Import default', one: 'import default', many: 'import defaults' },
  {
    key: 'rules',
    tag: 'Calculation or check',
    one: 'calculation or check',
    many: 'calculations or checks',
  },
] as const

/** What a draft from an import changed, with the items a person must confirm first. */
export function DraftSummaryPanel({
  summary,
  fields,
  onSelectField,
}: {
  summary: DraftSummaryResponse
  fields: FormField[]
  onSelectField: (fieldCode: string) => void
}) {
  const labelOf = (code: string) => fields.find((field) => field.code === code)?.label || code
  const counts = [
    ...changeKinds.map(({ key, one, many }) => {
      const count = summary[key].length
      return count ? `${count} ${count === 1 ? one : many}` : null
    }),
    summary.aliasesAdded
      ? `${summary.aliasesAdded} value ${summary.aliasesAdded === 1 ? 'alias' : 'aliases'}`
      : null,
  ].filter((line): line is string => line !== null)
  const changedCodes = new Set(changeKinds.flatMap(({ key }) => summary[key]))
  // Rows follow the form's field order; a code the form no longer has goes last.
  const rows = [
    ...fields.map((field) => field.code).filter((code) => changedCodes.has(code)),
    ...[...changedCodes].filter((code) => !fields.some((field) => field.code === code)),
  ]
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
                    <p className="text-sm font-medium text-foreground">{labelOf(item.fieldCode)}</p>
                    {labelOf(item.fieldCode) !== item.fieldCode ? (
                      <p className="text-xs text-muted-foreground">{item.fieldCode}</p>
                    ) : null}
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
          {counts.length ? (
            <>
              <div className="flex flex-wrap gap-2">
                {counts.map((line) => (
                  <span
                    key={line}
                    className="rounded-md bg-muted px-2.5 py-1 text-sm text-foreground"
                  >
                    {line}
                  </span>
                ))}
              </div>
              {rows.length ? (
                <details className="rounded-lg border border-border">
                  <summary className="min-h-11 cursor-pointer content-center px-4 text-sm font-medium text-primary">
                    Show changed fields ({rows.length})
                  </summary>
                  <div className="overflow-x-auto border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={tableHeadClass}>Field</TableHead>
                          <TableHead className={tableHeadClass}>What changed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((code) => (
                          <TableRow key={code}>
                            <TableCell className="align-top">
                              <button
                                className="rounded-sm text-left font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                type="button"
                                onClick={() => onSelectField(code)}
                              >
                                {labelOf(code)}
                              </button>
                              {labelOf(code) !== code ? (
                                <p className="max-w-[22rem] truncate text-xs text-muted-foreground">
                                  {code}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-wrap gap-1.5">
                                {changeKinds
                                  .filter(({ key }) => summary[key].includes(code))
                                  .map(({ tag }) => (
                                    <StatusBadge
                                      key={tag}
                                      dot={false}
                                      tone={tag === 'New' ? 'info' : 'neutral'}
                                    >
                                      {tag}
                                    </StatusBadge>
                                  ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">The form already covered this file.</p>
          )}
        </section>
      </div>
    </SectionCard>
  )
}
