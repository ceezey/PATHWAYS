'use client'

import { DatabaseBackup, Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState, SectionCard, StatusBadge } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type RecoveryPoint = { id: string; name: string; at: string; payload: string; checksum: string }

const unavailable =
  'Backup and recovery are unavailable until a server-backed service is configured.'

export const BackupRecoveryWorkspace = () => {
  const state: { backups: RecoveryPoint[]; revision: string } = {
    backups: [],
    revision: 'Unavailable',
  }
  const [selectedId, setSelectedId] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = state.backups.find((backup) => backup.id === selectedId) ?? state.backups[0]

  const create = () => setMessage(unavailable)
  const restore = () => setMessage(unavailable)
  const importFile = async (file?: File) => {
    if (!file) return
    setMessage(unavailable)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration / Continuity"
        title="Backup & Recovery"
        description="Create, download, validate, and restore PATHWAYS recovery points."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              className="sr-only"
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            <Button variant="outline" disabled onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Add recovery file
            </Button>
            <Button disabled onClick={create}>
              <DatabaseBackup className="mr-2 h-4 w-4" />
              Create & download backup
            </Button>
          </div>
        }
      />
      <output className="block text-sm" aria-live="polite">
        {message || unavailable}
      </output>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          title="Recovery points"
          description="Recovery points are unavailable without a server-backed backup service."
        >
          {state.backups.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3">File</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Integrity</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.backups.map((backup) => (
                    <tr
                      className={selected?.id === backup.id ? 'bg-primary-subtle' : ''}
                      key={backup.id}
                    >
                      <td className="p-3 font-mono text-xs">{backup.name}</td>
                      <td className="p-3">{new Date(backup.at).toLocaleString()}</td>
                      <td className="p-3">
                        {Math.ceil(new Blob([backup.payload]).size / 1024)} KiB
                      </td>
                      <td className="p-3">
                        <StatusBadge tone="success">{backup.checksum}</StatusBadge>
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedId(backup.id)}>
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No recovery point yet" description={unavailable} />
          )}
        </SectionCard>
        <SectionCard
          title="Recovery impact"
          description="Restore always validates before replacing current state."
        >
          {selected ? (
            <div className="space-y-4">
              <p className="font-mono text-sm">{selected.name}</p>
              <p className="text-sm text-muted-foreground">
                A successful restore replaces current records while retaining the recovery
                inventory. A validation or restore failure preserves the current state.
              </p>
              <div className="grid gap-2">
                <Button variant="outline" disabled>
                  <Download className="mr-2 h-4 w-4" />
                  Download selected
                </Button>
                <Button variant="destructive" disabled onClick={() => setRestoreOpen(true)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore selected
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{unavailable}</p>
          )}
        </SectionCard>
      </div>
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {selected?.name}?</DialogTitle>
            <DialogDescription>
              This replaces the current organization snapshot after checksum and schema validation.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-danger/25 bg-danger-subtle p-4 text-sm text-danger">
            Current revision: {state.revision}. Changes made after the recovery point will be
            replaced on success.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled onClick={restore}>
              Confirm restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
