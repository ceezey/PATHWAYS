'use client'

import { type DateOrder, proposedEnrollmentDate, submissionTimeColumn } from '@pathways/imports'
import { businessCalendarDate, importCheckpointRows } from '@pathways/shared'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmationDialog } from '@/components/pathways/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCurrentRole } from '@/hooks/use-current-role'
import { importsClient } from '@/lib/api/imports'
import { plural } from '@/lib/format/plural'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'

import { ToggleRow } from '../../forms/components/toggle-row'

export interface HeldEnrollmentRow {
  id: string
  rowNumber: number
  name: string
  rawData: Record<string, string | number | boolean | null>
}

/** Lets a person confirm the enrollment date of registration rows held without one, a few rows per request. */
export function EnrollmentDatePanel({
  projectId,
  batchId,
  rows,
  headers,
  dateOrder,
  uploadedAt,
  onConfirmed,
}: {
  projectId: string
  batchId: string
  rows: HeldEnrollmentRow[]
  headers: readonly { key: string; header: string }[]
  dateOrder: DateOrder | null
  uploadedAt: string
  onConfirmed: () => Promise<void> | void
}) {
  const { profile } = useCurrentRole()
  const id = useId()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The kind of confirmation waiting for the person's yes in the dialog.
  const [confirming, setConfirming] = useState<'proposed' | 'typed' | null>(null)
  const running = useRef(false)
  if (!principalHasAtomicPermission(profile, 'imports.process') || rows.length === 0) return null

  const column = submissionTimeColumn(headers)
  const uploadDate = businessCalendarDate(new Date(uploadedAt), 'Asia/Manila')
  const year = Number(uploadDate.slice(0, 4))
  const proposal = (row: HeldEnrollmentRow) =>
    column ? proposedEnrollmentDate(row.rawData[column.key], column.header, dateOrder, year) : null
  // A row confirmed or removed since the last refresh drops out of the selection.
  const chosen = rows.filter((row) => selected.has(row.id))
  const toggle = (rowId: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(rowId)
      else next.delete(rowId)
      return next
    })

  const confirm = async (kind: 'proposed' | 'typed') => {
    setConfirming(null)
    if (running.current || chosen.length === 0) return
    running.current = true
    setBusy(true)
    setError('')
    const ids = chosen.map((row) => row.id)
    let confirmed = 0
    let waiting = 0
    try {
      // Each request is all-or-nothing, so the first failure stops the rest.
      for (let start = 0; start < ids.length; start += importCheckpointRows) {
        const result = await importsClient.confirmEnrollmentDates(projectId, batchId, {
          rowIds: ids.slice(start, start + importCheckpointRows),
          ...(kind === 'typed' ? { date } : {}),
        })
        confirmed += result.confirmed
        waiting += result.waiting
      }
      setSelected(new Set())
      toast.success(
        `Confirmed ${plural(confirmed, 'enrollment date')}.${waiting > 0 ? ` ${waiting} of them ${waiting === 1 ? 'waits' : 'wait'} for guardian consent.` : ''}`,
      )
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'The confirmation could not be completed.'
      setError(
        confirmed
          ? `${message} ${plural(confirmed, 'enrollment date')} confirmed before it stopped.`
          : message,
      )
    } finally {
      running.current = false
      setBusy(false)
      await onConfirmed()
    }
  }

  const noneChosen = busy || chosen.length === 0
  return (
    <section aria-labelledby={`${id}-title`}>
      <Card>
        <CardHeader>
          <CardTitle id={`${id}-title`}>Enrollment dates to confirm</CardTitle>
          <CardDescription>
            These registrations have no enrollment date. Use the date each was submitted, or set one
            date for them all.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <ToggleRow
              checked={chosen.length === rows.length}
              label="Select all"
              onChange={(on) => setSelected(on ? new Set(rows.map((row) => row.id)) : new Set())}
            />
            {rows.map((row) => (
              <ToggleRow
                checked={selected.has(row.id)}
                key={row.id}
                label={`Row ${row.rowNumber}: ${row.name}, ${proposal(row) ? `proposed ${proposal(row)}` : 'No submission time'}`}
                onChange={(on) => toggle(row.id, on)}
              />
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-date`}>Enrollment date</Label>
            <Input
              id={`${id}-date`}
              max={businessCalendarDate(new Date(), 'Asia/Manila')}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={noneChosen || chosen.some((row) => !proposal(row))}
              onClick={() => setConfirming('proposed')}
            >
              Use proposed dates
            </Button>
            <Button
              disabled={noneChosen || !date}
              onClick={() => setConfirming('typed')}
              variant="outline"
            >
              Set one date
            </Button>
          </div>
          <ConfirmationDialog
            confirmLabel="Confirm enrollment dates"
            confirmVariant="default"
            description={`This sets the enrollment date of ${plural(chosen.length, 'participant')} and processes them. It cannot be undone here.`}
            onConfirm={() => void confirm(confirming ?? 'proposed')}
            onOpenChange={(open) => !open && setConfirming(null)}
            open={confirming !== null}
            title="Confirm enrollment dates?"
          />
        </CardContent>
      </Card>
    </section>
  )
}
