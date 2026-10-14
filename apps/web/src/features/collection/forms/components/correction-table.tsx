'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'

import { CORRECTION_PAGE_SIZE } from '../forms.utils'
import type { CollectionEdits } from '../hooks/use-collection-edits'
import type { CollectionState } from '../hooks/use-collection-state'

export function CorrectionTable({
  state,
  edits,
  parsedImport,
}: {
  state: Pick<CollectionState, 'correctionPage' | 'setCorrectionPage'>
  edits: Pick<CollectionEdits, 'updateCorrectionCell'>
  parsedImport: NonNullable<CollectionState['parsedImport']>
}) {
  const { correctionPage, setCorrectionPage } = state
  const { updateCorrectionCell } = edits
  const totalRows = parsedImport.rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / CORRECTION_PAGE_SIZE))
  const page = Math.min(correctionPage, totalPages - 1)
  const pageStart = page * CORRECTION_PAGE_SIZE
  const pageEnd = Math.min(pageStart + CORRECTION_PAGE_SIZE, totalRows)
  const pageRows = parsedImport.rows.slice(pageStart, pageEnd)
  return (
    <details className="min-w-0">
      <summary>Correct isolated data before reprocessing</summary>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {totalPages > 1 ? (
          <output aria-live="polite" className="text-xs text-muted-foreground">
            Rows {pageStart + 1}-{pageEnd} of {totalRows}
          </output>
        ) : (
          <p className="text-xs text-muted-foreground">
            Rows {pageStart + 1}-{pageEnd} of {totalRows}
          </p>
        )}
        {totalPages > 1 ? (
          <div className="flex gap-2">
            <Button
              className="min-h-11"
              disabled={page === 0}
              onClick={() => setCorrectionPage((current) => Math.max(0, current - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <Button
              className="min-h-11"
              disabled={pageEnd >= totalRows}
              onClick={() => setCorrectionPage((current) => current + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
      <section
        aria-label="Isolated data rows awaiting correction"
        className="mt-2 max-w-full overflow-x-auto rounded-lg border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
        tabIndex={0}
      >
        <table className="min-w-max text-sm">
          <TableBody>
            {pageRows.map((row, relativeIndex) => {
              const rowIndex = pageStart + relativeIndex
              return (
                <TableRow className="h-14" key={rowIndex}>
                  {parsedImport.headers.map((column) => {
                    const cellValue = String(row[column] ?? '')
                    return (
                      <TableCell key={column}>
                        <Input
                          aria-label={`Row ${rowIndex + 1}: ${column}`}
                          className="max-w-[220px] truncate"
                          title={cellValue}
                          value={cellValue}
                          onChange={(event) =>
                            updateCorrectionCell(rowIndex, column, event.target.value)
                          }
                        />
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </table>
      </section>
    </details>
  )
}
