'use client'

import { useState } from 'react'

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

import { enumLabel, warningLabel } from '../../collection.copy'
import { ToggleRow } from '../../forms/components/toggle-row'
import type { ImportState } from '../hooks/use-import-state'
import { displayValue, headClass, rowTone } from '../import.utils'

export function ImportRowsCard({
  state,
}: { state: Pick<ImportState, 'rows' | 'sourceColumnByKey' | 'validationErrors'> }) {
  const { rows, sourceColumnByKey, validationErrors } = state
  const [onlyWarnings, setOnlyWarnings] = useState(false)
  const shown = onlyWarnings ? rows.filter((row) => row.validationWarnings.length > 0) : rows
  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized row review</CardTitle>
        <CardDescription>
          {rows.length} rows loaded; {validationErrors} bounded validation errors. Raw previews are
          never shown to aggregate-only roles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState title="None yet" description="No staged rows are available." />
        ) : (
          <>
            <ToggleRow
              checked={onlyWarnings}
              label="Show only rows with warnings"
              onChange={setOnlyWarnings}
            />
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={headClass}>Source row</TableHead>
                    <TableHead className={headClass}>Status</TableHead>
                    <TableHead className={headClass}>Original values</TableHead>
                    <TableHead className={headClass}>Validation</TableHead>
                    <TableHead className={headClass}>Warnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((row) => (
                    <TableRow key={row.id} className="h-14 border-border">
                      <TableCell className="align-top">{row.rowNumber}</TableCell>
                      <TableCell className="align-top">
                        <StatusBadge tone={rowTone(row.status)}>
                          {enumLabel(row.status)}
                        </StatusBadge>
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
                              <dd className="inline text-muted-foreground">
                                {displayValue(value)}
                              </dd>
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
                      <TableCell className="align-top">
                        {row.validationWarnings.length ? (
                          <ul className="space-y-1 text-warning">
                            {row.validationWarnings.map((warning) => (
                              <li key={`${warning.fieldCode}-${warning.code}`}>
                                {warning.fieldCode}: {warningLabel(warning.code)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No loaded rows have warnings.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
