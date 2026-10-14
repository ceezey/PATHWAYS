'use client'

import { SectionCard } from '@/components/pathways'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import {
  MAX_PREVIEW_ROWS,
  type ParsedImport,
  formatValue,
  tableHeadClass,
} from '../../collection.utils'

export const DataPreview = ({ parsedImport }: { parsedImport: ParsedImport }) => (
  <SectionCard
    className="min-w-0"
    title="Data preview"
    description={`Showing the first ${Math.min(parsedImport.rows.length, MAX_PREVIEW_ROWS)} of ${parsedImport.rows.length} rows for mapping and validation review.`}
  >
    <section
      aria-label="Data preview rows"
      className="max-w-full overflow-x-auto rounded-lg border border-border"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll container needs keyboard access to reach content clipped by overflow-x-auto
      tabIndex={0}
    >
      <table className="w-full min-w-[720px] text-sm">
        <TableHeader>
          <TableRow className="h-10">
            {parsedImport.headers.map((header) => (
              <TableHead
                key={header}
                className={cn(tableHeadClass, 'max-w-[220px] truncate')}
                title={header}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {parsedImport.rows.slice(0, MAX_PREVIEW_ROWS).map((row, index) => (
            <TableRow key={`${parsedImport.fileName}-${index}`} className="h-14">
              {parsedImport.headers.map((header) => {
                const cellText = formatValue(row[header])
                return (
                  <TableCell
                    key={header}
                    className="max-w-[220px] truncate text-muted-foreground"
                    title={cellText}
                  >
                    {cellText}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </section>
  </SectionCard>
)
