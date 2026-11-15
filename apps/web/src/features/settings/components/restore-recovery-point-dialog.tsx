'use client'

import type { RecoveryPointListItem } from '@pathways/shared'
import { useEffect, useState } from 'react'

import { ConfirmationDialog } from '@/components/pathways'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatRecoveryPointTime, recoveryPointKindLabels } from '../backup-recovery.utils'

const SUMMARY =
  'PATHWAYS saves a recovery point of the current data first, so you can undo this restore.'
const REPLACED = [
  'Projects',
  'Activities',
  'Beneficiaries',
  'Monitoring',
  'Finance',
  'Alerts',
  'Public tracker',
  'Project and activity assignments',
]
const KEPT = [
  'Staff accounts',
  'Roles',
  'Audit log',
  'Files uploaded after that time (kept, but no longer linked)',
]

const ChangeList = ({ id, title, items }: { id: string; title: string; items: string[] }) => (
  <section>
    <h3 id={id} className="font-semibold">
      {title}
    </h3>
    <ul aria-labelledby={id} className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </section>
)

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
      description={SUMMARY}
      confirmLabel={pending ? 'Restoring' : 'Restore'}
      confirmDisabled={pending || value === ''}
      onConfirm={() => onConfirm(value)}
    >
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <ChangeList id="restore-replaced" title="Goes back to that time" items={REPLACED} />
        <ChangeList id="restore-kept" title="Not changed" items={KEPT} />
      </div>
      {point?.fileMode === 'copy' ? (
        <p className="text-sm text-muted-foreground">
          Missing or changed files are copied back from the recovery point.
        </p>
      ) : null}
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
