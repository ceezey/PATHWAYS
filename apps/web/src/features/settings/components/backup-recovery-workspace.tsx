'use client'

import type { RecoveryPointListItem } from '@pathways/shared'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, LoadingSkeleton, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { backupsClient } from '@/lib/api/backups'
import { formatBytes } from '@/lib/format/bytes'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import {
  canCheckPoint,
  canRestorePoint,
  formatRecoveryPointTime,
  recoveryPointCreator,
  recoveryPointKindLabels,
  recoveryPointStatusView,
} from '../backup-recovery.utils'
import { useBackupActions } from '../hooks/use-backup-actions'
import { RestoreRecoveryPointDialog } from './restore-recovery-point-dialog'

const fileModeNotes = {
  manifest:
    'New recovery points record which uploaded files existed; the files themselves are not copied.',
  copy: 'New recovery points also copy every uploaded file.',
} as const

export const BackupRecoveryWorkspace = () => {
  const { profile } = useCurrentRole()
  const canCreate = principalHasAtomicPermission(profile, 'backups.create')
  const canRestore = principalHasAtomicPermission(profile, 'backups.restore')
  const read = useAuthorizedRead('recovery-points', null, 'backups.create', (signal) =>
    backupsClient.list(signal),
  )
  const actions = useBackupActions(read.refetch)
  const busy = actions.pending !== null
  const [restoring, setRestoring] = useState<RecoveryPointListItem | null>(null)
  const closeRestore = () => {
    setRestoring(null)
    actions.clearRestoreError()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration / Continuity"
        title="Backup & Recovery"
        description="Create, download, check and restore recovery points of your organization's data."
      />
      <SectionCard
        title="Recovery points"
        description={read.data ? fileModeNotes[read.data.fileMode] : undefined}
        actions={
          canCreate ? (
            <Button type="button" disabled={busy} onClick={() => void actions.create()}>
              {actions.pending?.action === 'create' ? 'Creating backup' : 'Create Backup'}
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          {actions.notice ? (
            <p
              role={actions.notice.tone === 'success' ? 'status' : 'alert'}
              className={
                actions.notice.tone === 'success' ? 'text-sm text-success' : 'text-sm text-danger'
              }
            >
              {actions.notice.text}
            </p>
          ) : null}
          {actions.links ? (
            <div className="space-y-1 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <a href={actions.links.dataUrl} rel="noopener noreferrer" className="underline">
                  Download data file
                </a>
                <a href={actions.links.manifestUrl} rel="noopener noreferrer" className="underline">
                  Download manifest
                </a>
              </div>
              <p className="text-muted-foreground">These links expire in 2 minutes.</p>
            </div>
          ) : null}
          {read.isError ? (
            <EmptyState
              tone="danger"
              title="Recovery points could not be loaded."
              action={
                <Button type="button" variant="outline" onClick={() => void read.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : !read.data ? (
            <LoadingSkeleton />
          ) : read.data.points.length === 0 ? (
            <EmptyState
              title="No recovery point yet"
              description="Create a backup to save your organization's data at this moment."
            />
          ) : (
            <section className="overflow-x-auto rounded-md border" aria-label="Recovery points">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Created by</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {read.data.points.map((point) => (
                    <PointRow
                      key={point.id}
                      point={point}
                      busy={busy}
                      canRestore={canRestore}
                      onRestore={() => {
                        actions.clearRestoreError()
                        setRestoring(point)
                      }}
                      onVerify={() => void actions.verify(point)}
                      onDownload={() => void actions.download(point)}
                    />
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </SectionCard>
      <RestoreRecoveryPointDialog
        point={restoring}
        organizationCode={read.data?.organizationCode ?? ''}
        pending={actions.pending?.action === 'restore'}
        error={actions.restoreError}
        onOpenChange={(open) => {
          // A running restore keeps its dialog, so its outcome is never lost.
          if (!open && actions.pending?.action !== 'restore') closeRestore()
        }}
        onConfirm={(organizationCode) => {
          if (!restoring) return
          void actions.restore(restoring, organizationCode).then((restored) => {
            if (restored) closeRestore()
          })
        }}
      />
    </div>
  )
}

const PointRow = ({
  point,
  busy,
  canRestore,
  onRestore,
  onVerify,
  onDownload,
}: {
  point: RecoveryPointListItem
  busy: boolean
  canRestore: boolean
  onRestore: () => void
  onVerify: () => void
  onDownload: () => void
}) => {
  const status = recoveryPointStatusView[point.status]
  const checkable = canCheckPoint(point)
  return (
    <tr className="border-t align-top" data-point-id={point.id}>
      <td className="px-3 py-2 whitespace-nowrap">{formatRecoveryPointTime(point)}</td>
      <td className="px-3 py-2">{recoveryPointCreator(point)}</td>
      <td className="px-3 py-2">{recoveryPointKindLabels[point.pointType]}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {point.sizeBytes === null ? 'Not recorded' : formatBytes(point.sizeBytes)}
      </td>
      <td className="px-3 py-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {(point.status === 'FAILED' || point.status === 'UNAVAILABLE') && point.failureReason ? (
          <p className="mt-1 text-xs text-muted-foreground">{point.failureReason}</p>
        ) : null}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {canRestore ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || !canRestorePoint(point)}
              onClick={onRestore}
            >
              Restore
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !checkable}
            onClick={onVerify}
          >
            Verify
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !checkable}
            onClick={onDownload}
          >
            Download
          </Button>
        </div>
      </td>
    </tr>
  )
}
