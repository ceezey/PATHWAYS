'use client'

import { AlertTriangle, CheckCircle2, DatabaseBackup, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type BackupRecord = {
  id: string
  createdAt: string
  scope: string
  size: string
  status: 'Verified' | 'Check required'
  creator: string
}

const backups: BackupRecord[] = [
  {
    id: 'BKP-2026-09-07-2300',
    createdAt: '07 Sep 2026, 11:00 PM',
    scope: 'Prototype organization snapshot',
    size: '18.4 MB',
    status: 'Verified',
    creator: 'Scheduled preview',
  },
  {
    id: 'BKP-2026-09-06-2300',
    createdAt: '06 Sep 2026, 11:00 PM',
    scope: 'Prototype organization snapshot',
    size: '18.1 MB',
    status: 'Verified',
    creator: 'Scheduled preview',
  },
  {
    id: 'BKP-2026-09-05-2300',
    createdAt: '05 Sep 2026, 11:00 PM',
    scope: 'Prototype organization snapshot',
    size: '17.9 MB',
    status: 'Check required',
    creator: 'Scheduled preview',
  },
]

export const BackupRecoveryWorkspace = () => {
  const [selected, setSelected] = useState(backups[0])
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [message, setMessage] = useState('')

  const unavailable = (action: 'backup' | 'restore') => {
    setRestoreOpen(false)
    setMessage(
      action === 'backup'
        ? 'Backup creation is unavailable because no storage service is connected. No operation started.'
        : 'Restore is unavailable because no isolated recovery service is connected. The current state was not changed.',
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration / Continuity"
        title="Backup & Recovery"
        description="Review recovery readiness, inspect synthetic backup metadata, and understand restore impact before any operation."
        actions={
          <Button onClick={() => unavailable('backup')}>
            <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />
            Create backup
          </Button>
        }
      />

      <div className="rounded-lg border border-warning/25 bg-warning-subtle px-4 py-3 text-sm leading-6 text-warning">
        No backup storage or restore target is connected. The inventory below is synthetic and every
        operation stops safely without changing data.
      </div>
      {message ? (
        <output className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-subtle px-4 py-3 text-sm leading-6 text-danger">
          <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </output>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.65fr)]">
        <SectionCard
          title="Backup inventory"
          description="Synthetic records demonstrate the planned chronology and integrity states."
        >
          <section className="overflow-x-auto rounded-md border" aria-label="Backup inventory">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Backup</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Integrity</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {backups.map((backup) => (
                  <tr
                    key={backup.id}
                    className={selected.id === backup.id ? 'bg-primary-subtle' : undefined}
                  >
                    <td className="px-4 py-3 font-mono text-xs">{backup.id}</td>
                    <td className="px-4 py-3">{backup.createdAt}</td>
                    <td className="px-4 py-3">{backup.size}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={backup.status === 'Verified' ? 'success' : 'warning'}>
                        {backup.status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(backup)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </SectionCard>

        <SectionCard
          title="Recovery impact"
          description="The selected target must be verified again before a real restore."
        >
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary-subtle text-primary">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-mono text-sm font-semibold">{selected.id}</p>
                <p className="text-sm text-muted-foreground">{selected.status}</p>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Snapshot scope</dt>
                <dd className="mt-1 font-medium">{selected.scope}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created by</dt>
                <dd className="mt-1 font-medium">{selected.creator}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expected consequence</dt>
                <dd className="mt-1 leading-6">
                  A real restore could replace current PATHWAYS state. Atomic restore, integrity
                  verification, rollback, and failure preservation are not connected here.
                </dd>
              </div>
            </dl>
            <Button className="w-full" variant="destructive" onClick={() => setRestoreOpen(true)}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Review restore
            </Button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ReadinessItem title="Storage" state="Not connected" ready={false} />
        <ReadinessItem title="Integrity check" state="Preview only" ready={false} />
        <ReadinessItem title="Failure preservation" state="UI specified" ready />
      </div>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {selected.id}?</DialogTitle>
            <DialogDescription>
              A real restore would require an explicitly approved disposable target, a verified
              recovery point, and operational authorization. This frontend preview will stop without
              changing state.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-danger/25 bg-danger-subtle p-4 text-sm leading-6 text-danger">
            Target: current PATHWAYS organization state. Consequence: replacement of data created
            after {selected.createdAt}.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => unavailable('restore')}>
              Confirm preview check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const ReadinessItem = ({
  title,
  state,
  ready,
}: { title: string; state: string; ready: boolean }) => (
  <div className="rounded-lg border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="font-semibold">{title}</p>
      {ready ? (
        <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
      )}
    </div>
    <p className="mt-2 text-sm text-muted-foreground">{state}</p>
  </div>
)
