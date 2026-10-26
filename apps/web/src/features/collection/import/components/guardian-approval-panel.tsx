'use client'

import { businessCalendarDate, importCheckpointRows } from '@pathways/shared'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmationDialog } from '@/components/pathways/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentRole } from '@/hooks/use-current-role'
import { importsClient } from '@/lib/api/imports'
import { plural } from '@/lib/format/plural'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'

import { ToggleRow } from '../../forms/components/toggle-row'

export interface HeldMinor {
  id: string
  rowNumber: number
  name: string
}

/** Lets a Project Officer approve held minors as their guardian, a few rows per request. */
export function GuardianApprovalPanel({
  projectId,
  batchId,
  rows,
  onApproved,
}: {
  projectId: string
  batchId: string
  rows: HeldMinor[]
  onApproved: () => Promise<void> | void
}) {
  const { profile } = useCurrentRole()
  const id = useId()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [guardianName, setGuardianName] = useState('')
  const [consentDate, setConsentDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const running = useRef(false)
  if (!principalHasAtomicPermission(profile, 'beneficiaries.guardian_consent.approve')) return null
  if (rows.length === 0) return null
  // A row approved or removed since the last refresh drops out of the selection.
  const chosen = rows.filter((row) => selected.has(row.id))
  const toggle = (rowId: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(rowId)
      else next.delete(rowId)
      return next
    })

  const single = chosen.length === 1
  const approve = async () => {
    setConfirming(false)
    if (running.current || chosen.length === 0) return
    running.current = true
    setBusy(true)
    setError('')
    // The details belong to one child, so they go out only with a single row.
    const details =
      chosen.length === 1
        ? {
            ...(guardianName.trim() ? { guardianName: guardianName.trim() } : {}),
            ...(consentDate ? { consentDate } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          }
        : {}
    const ids = chosen.map((row) => row.id)
    let approved = 0
    try {
      // Each request is all-or-nothing, so the first failure stops the rest.
      for (let start = 0; start < ids.length; start += importCheckpointRows) {
        const result = await importsClient.approveGuardianConsent(projectId, batchId, {
          rowIds: ids.slice(start, start + importCheckpointRows),
          ...details,
        })
        approved += result.approved
      }
      setSelected(new Set())
      toast.success(`Approved ${plural(approved, 'participant')}.`)
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'The approval could not be completed.'
      setError(
        approved
          ? `${message} ${plural(approved, 'participant')} approved before it stopped.`
          : message,
      )
    } finally {
      running.current = false
      setBusy(false)
      await onApproved()
    }
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <Card>
        <CardHeader>
          <CardTitle id={`${id}-title`}>Guardian approval</CardTitle>
          <CardDescription>
            These participants are under 18. Approving records you as their guardian.
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
                label={`Row ${row.rowNumber}: ${row.name}`}
                onChange={(on) => toggle(row.id, on)}
              />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>Guardian name (optional)</Label>
              <Input
                disabled={!single}
                id={`${id}-name`}
                maxLength={160}
                value={guardianName}
                onChange={(event) => setGuardianName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-date`}>Consent date (optional)</Label>
              <Input
                disabled={!single}
                id={`${id}-date`}
                max={businessCalendarDate(new Date(), 'Asia/Manila')}
                type="date"
                value={consentDate}
                onChange={(event) => setConsentDate(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${id}-note`}>Note (optional)</Label>
              <Textarea
                disabled={!single}
                id={`${id}-note`}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Guardian details can be added only when one participant is selected.
          </p>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={busy || chosen.length === 0} onClick={() => setConfirming(true)}>
            {busy ? 'Approving...' : `Approve ${chosen.length} selected`}
          </Button>
          <ConfirmationDialog
            confirmLabel="Record guardian consent"
            confirmVariant="default"
            description={`This records guardian consent for ${plural(chosen.length, 'participant')} and records you as the approving officer, and creates their profiles. It cannot be undone here.`}
            onConfirm={() => void approve()}
            onOpenChange={setConfirming}
            open={confirming}
            title="Approve guardian consent?"
          />
        </CardContent>
      </Card>
    </section>
  )
}
