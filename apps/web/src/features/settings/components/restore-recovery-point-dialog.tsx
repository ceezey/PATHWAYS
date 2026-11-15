'use client'

import type { RecoveryPointListItem } from '@pathways/shared'
import { useEffect, useState } from 'react'

import { ConfirmationDialog } from '@/components/pathways'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRecoveryPointTime, recoveryPointKindLabels } from '../backup-recovery.utils'

const REPLACES =
  "This replaces your organization's projects, activities, beneficiaries, monitoring, finance, alert and public tracker data with the data saved at that time. Staff accounts, roles and the audit log are not changed. Files uploaded after that time stay in storage but are no longer linked. PATHWAYS saves a recovery point of the current data first, so you can undo this restore."

/** Asks the administrator to type the organization code before a restore replaces the data. */
export const RestoreRecoveryPointDialog = ({
  point,
  organizationCode,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: {
  point: RecoveryPointListItem | null
  organizationCode: string
  pending: boolean
  error: string | null
  onConfirm: (organizationCode: string) => void
  onOpenChange: (open: boolean) => void
}) => {
  const [typed, setTyped] = useState('')
  // A new point starts with an empty confirmation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the point changes
  useEffect(() => setTyped(''), [point?.id])
  const value = typed.trim()
  return (
    <ConfirmationDialog
      open={point !== null}
      onOpenChange={onOpenChange}
      title={
        point
          ? `Restore the ${recoveryPointKindLabels[point.pointType]} recovery point from ${formatRecoveryPointTime(point)}?`
          : 'Restore recovery point?'
      }
      description={
        point?.fileMode === 'copy'
          ? `${REPLACES} Missing or changed files are copied back from the recovery point.`
          : REPLACES
      }
      confirmLabel={pending ? 'Restoring' : 'Restore'}
      confirmDisabled={pending || value === ''}
      onConfirm={() => onConfirm(value)}
    >
      <div className="space-y-2">
        <Label htmlFor="restore-organization-code">{`Type ${organizationCode} to confirm`}</Label>
        <Input
          id="restore-organization-code"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </ConfirmationDialog>
  )
}
