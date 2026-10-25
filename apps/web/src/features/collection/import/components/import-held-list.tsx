'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { headClass, holdReason, participantName } from '../import.utils'
import { GuardianApprovalPanel } from './guardian-approval-panel'
import { ImportReviewDialog } from './import-review-dialog'

/** The batch results and the rows held for a person to decide. */
export function ImportHeldList({
  batch,
  rows,
  onChanged,
}: {
  batch: ImportBatchDefinition
  rows: ImportRowDefinition[]
  onChanged: () => Promise<void> | void
}) {
  const { profile } = useCurrentRole()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const held = rows.filter((row) => row.status === 'UNPROCESSED')
  const heldCount = batch.totals.unprocessed
  const counts = batch.registrationCounts
  if (!counts && heldCount === 0 && held.length === 0) return null
  const canReview = principalHasAtomicPermission(profile, 'imports.review')
  const results = [
    ...(counts
      ? [
          ['Created', counts.created],
          ['Updated', counts.updated],
          ['Unchanged', counts.unchanged],
        ]
      : []),
    ['Held', heldCount],
  ] as const
  const minors = held
    .filter((row) => row.processingErrorCode === 'GUARDIAN_CONSENT_REQUIRED')
    .map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      name: participantName(row, batch.mappings),
    }))
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Import results</CardTitle>
          {held.length > 0 ? (
            <CardDescription>
              {held.length < heldCount
                ? `Showing ${held.length} of ${heldCount} held rows. `
                : null}
              Review each held row to decide what is saved.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset aria-label="Import results" className="grid gap-3 sm:grid-cols-4">
            {results.map(([label, value]) => (
              <div key={label} className="rounded-md bg-surface-subtle p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </fieldset>
          {held.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className={headClass}>Row</TableHead>
                    <TableHead className={headClass}>Participant</TableHead>
                    <TableHead className={headClass}>Reason</TableHead>
                    <TableHead className={headClass}>
                      <span className="sr-only">Action</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {held.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{participantName(row, batch.mappings)}</TableCell>
                      <TableCell>{holdReason(row.processingErrorCode)}</TableCell>
                      <TableCell className="text-right">
                        {canReview && row.processingErrorCode !== 'GUARDIAN_CONSENT_REQUIRED' ? (
                          <Button
                            aria-label={`Review row ${row.rowNumber}`}
                            onClick={() => setReviewing(row.id)}
                            size="sm"
                            variant="outline"
                          >
                            Review
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <GuardianApprovalPanel
        batchId={batch.id}
        onApproved={onChanged}
        projectId={batch.projectId}
        rows={minors}
      />
      {reviewing ? (
        <ImportReviewDialog
          batchId={batch.id}
          canUpdate={principalHasAtomicPermission(profile, 'beneficiaries.identities.review')}
          key={reviewing}
          onClose={() => setReviewing(null)}
          onResolved={() => void onChanged()}
          projectId={batch.projectId}
          rowId={reviewing}
          validationRevision={batch.validationRevision}
        />
      ) : null}
    </>
  )
}
