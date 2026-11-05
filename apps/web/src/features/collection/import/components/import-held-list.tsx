'use client'

import { type DateOrder, fittingDateOrders, submissionTimeColumn } from '@pathways/imports'
import { businessCalendarDate } from '@pathways/shared'
import { useEffect, useState } from 'react'

import { MetricTooltip } from '@/components/pathways'
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
import { importsClient } from '@/lib/api/imports'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { ImportBatchDefinition, ImportRowDefinition } from '@/types/pathways'

import { headClass, participantName, rowReason, rowReasonHelp } from '../import.utils'
import { EnrollmentDatePanel } from './enrollment-date-panel'
import { GuardianApprovalPanel } from './guardian-approval-panel'
import { ImportReviewDialog } from './import-review-dialog'

// The info tip beside a reason that needs explaining.
const ReasonHelp = ({ text, rowNumber }: { text?: string; rowNumber: number }) =>
  text ? <MetricTooltip label={`row ${rowNumber} reason`}>{text}</MetricTooltip> : null

// The submission time column's date order: its mapping's, else the one order every held value fits, else none.
function timeColumnOrder(
  batch: ImportBatchDefinition,
  held: ImportRowDefinition[],
  key: string,
): DateOrder | null {
  const mapped = batch.mappings?.find(
    (item) => item.status === 'MAPPED' && item.sourceFieldName === key,
  )
  if (mapped?.dateOrder) return mapped.dateOrder
  const year = Number(businessCalendarDate(new Date(batch.uploadedAt), 'Asia/Manila').slice(0, 4))
  const orders = fittingDateOrders(
    held.map((row) => row.rawData[key]),
    year,
  )
  return orders.length === 1 ? orders[0] : null
}

/** The batch results and the rows held for a person to decide. */
export function ImportHeldList({
  batch,
  leadToGuardian,
  onChanged,
}: {
  batch: ImportBatchDefinition
  leadToGuardian?: boolean
  onChanged: () => Promise<void> | void
}) {
  const { profile } = useCurrentRole()
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [held, setHeld] = useState<ImportRowDefinition[]>([])
  const [loadError, setLoadError] = useState('')
  // Invalid registration and survey-part rows wait for a reviewer too.
  const heldCount =
    batch.totals.unprocessed +
    (batch.formType === 'BENEFICIARY_REGISTRATION' || batch.parentBatchId
      ? batch.totals.invalid
      : 0)
  useEffect(() => {
    let active = true
    setLoadError('')
    if (heldCount === 0) {
      setHeld([])
      return
    }
    Promise.resolve()
      .then(() => importsClient.getHeldRows(batch.projectId, batch.id))
      .then((loaded) => active && setHeld(loaded))
      .catch((error) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : 'Held rows could not be loaded.')
      })
    return () => {
      active = false
    }
  }, [batch, heldCount])
  const counts = batch.registrationCounts
  if (!counts && heldCount === 0 && held.length === 0) return null
  // The window shows stored participant values and resolving registers one, so the reviewer needs all three grants.
  const canReview =
    principalHasAtomicPermission(profile, 'imports.review') &&
    principalHasAtomicPermission(profile, 'beneficiaries.records.read') &&
    principalHasAtomicPermission(profile, 'beneficiaries.records.register')
  const results = [
    ...(counts
      ? [
          ['Created', counts.created],
          ...(batch.parentBatchId ? [] : [['Updated', counts.updated]]),
          ['Unchanged', counts.unchanged],
        ]
      : []),
    ['Held', heldCount],
  ] as const
  // A refresh can drop the row being reviewed, and then there is nothing to open.
  const reviewed = held.find((row) => row.id === reviewing)
  const minors = held
    .filter(
      (row) =>
        row.status === 'UNPROCESSED' && row.processingErrorCode === 'GUARDIAN_CONSENT_REQUIRED',
    )
    .map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      name: participantName(row, batch.mappings),
    }))
  const dateRows = held.filter(
    (row) => row.status === 'UNPROCESSED' && row.processingErrorCode === 'ENROLLMENT_DATE_REQUIRED',
  )
  const headers = batch.sourceColumns ?? []
  const timeColumn = submissionTimeColumn(headers)
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Import results</CardTitle>
          {held.length > 0 ? (
            <CardDescription>Review each held row to decide what is saved.</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <p className="text-sm text-danger" role="alert">
              {loadError}
            </p>
          ) : null}
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
                      <TableCell>
                        <span className="inline-flex items-center gap-3">
                          {rowReason(row, batch.mappings)}
                          <ReasonHelp text={rowReasonHelp(row)} rowNumber={row.rowNumber} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {canReview &&
                        (row.processingErrorCode !== 'GUARDIAN_CONSENT_REQUIRED' ||
                          row.resolvedAt === null) ? (
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
      <EnrollmentDatePanel
        batchId={batch.id}
        dateOrder={timeColumn ? timeColumnOrder(batch, held, timeColumn.key) : null}
        headers={headers}
        onConfirmed={onChanged}
        projectId={batch.projectId}
        rows={dateRows.map((row) => ({
          id: row.id,
          rowNumber: row.rowNumber,
          name: participantName(row, batch.mappings),
          rawData: row.rawData,
        }))}
      />
      <GuardianApprovalPanel
        batchId={batch.id}
        lead={leadToGuardian}
        onApproved={onChanged}
        projectId={batch.projectId}
        rows={minors}
      />
      {reviewed ? (
        <ImportReviewDialog
          batchId={batch.id}
          canUpdate={principalHasAtomicPermission(profile, 'beneficiaries.identities.review')}
          key={reviewed.id}
          onClose={() => setReviewing(null)}
          onResolved={() => void onChanged()}
          projectId={batch.projectId}
          reason={rowReason(reviewed, batch.mappings)}
          rowId={reviewed.id}
          validationRevision={batch.validationRevision}
        />
      ) : null}
    </>
  )
}
