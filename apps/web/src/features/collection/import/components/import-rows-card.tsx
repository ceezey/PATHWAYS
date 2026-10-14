'use client'

import { EmptyState, StatusBadge } from '@/components/pathways'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { enumLabel } from '../../collection.copy'
import type { ImportState } from '../hooks/use-import-state'
import { displayValue, headClass, rowTone } from '../import.utils'

export function ImportRowsCard({
  state,
}: { state: Pick<ImportState, 'rows' | 'sourceColumnByKey' | 'validationErrors'> }) {
  const { rows, sourceColumnByKey, validationErrors } = state
  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized row review</CardTitle>
        <CardDescription>
          {rows.length} rows loaded; {validationErrors} bounded validation errors. Raw previews are
          never shown to aggregate-only roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="None yet" description="No staged rows are available." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={headClass}>Source row</TableHead>
                  <TableHead className={headClass}>Status</TableHead>
                  <TableHead className={headClass}>Original values</TableHead>
                  <TableHead className={headClass}>Validation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="h-14 border-border">
                    <TableCell className="align-top">{row.rowNumber}</TableCell>
                    <TableCell className="align-top">
                      <StatusBadge tone={rowTone(row.status)}>{enumLabel(row.status)}</StatusBadge>
                    </TableCell>
                    <TableCell className="align-top">
                      <dl className="space-y-1">
                        {Object.entries(row.rawData).map(([key, value]) => (
                          <div key={key}>
                            <dt className="inline font-medium">
                              {sourceColumnByKey.has(key)
                                ? `Column ${sourceColumnByKey.get(key)?.columnIndex}: ${sourceColumnByKey.get(key)?.header}`
                                : key}
                              :{' '}
                            </dt>
                            <dd className="inline text-muted-foreground">{displayValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </TableCell>
                    <TableCell className="align-top">
                      {row.validationErrors.length ? (
                        <ul className="space-y-1 text-danger">
                          {row.validationErrors.map((error) => (
                            <li key={`${error.fieldCode}-${error.code}`}>
                              {error.fieldCode}: {error.message}
                            </li>
                          ))}
                        </ul>
                      ) : row.processingErrorCode ? (
                        <span className="text-warning">{enumLabel(row.processingErrorCode)}</span>
                      ) : (
                        <span className="text-muted-foreground">No errors</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
