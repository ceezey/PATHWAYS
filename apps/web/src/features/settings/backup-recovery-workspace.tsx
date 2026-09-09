'use client'

import { AlertTriangle, DatabaseBackup, Download, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

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
import {
  createBackup,
  downloadBackup,
  importBackupFile,
  restoreBackup,
} from '@/lib/demo-state/administration'
import { useDemoState } from '@/lib/demo-state/use-demo-state'

export const BackupRecoveryWorkspace = () => {
  const state = useDemoState()
  const [selectedId, setSelectedId] = useState('')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = state.backups.find((backup) => backup.id === selectedId) ?? state.backups[0]

  const create = () => {
    try {
      const backup = createBackup()
      setSelectedId(backup.id)
      downloadBackup(backup.payload, backup.name)
      setMessage('Backup created and downloaded. Integrity verification passed.')
      toast.success('Backup created, verified, retained locally, and downloaded.')
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Backup could not be created.'
      setMessage(failure)
      toast.error(failure)
    }
  }
  const restore = () => {
    if (!selected) return
    try {
      restoreBackup(selected.id)
      setRestoreOpen(false)
      setMessage('Backup restored atomically. Connected demo screens now use the recovered state.')
      toast.success(
        'Backup restored atomically. Connected demo screens now use the recovered state.',
      )
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : 'Restore failed; current state was retained.'
      setMessage(failure)
      toast.error(failure)
    }
  }
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      const backup = importBackupFile(await file.text(), file.name)
      setSelectedId(backup.id)
      setMessage('Recovery file validated and added.')
      toast.success('Recovery file validated and added.')
    } catch (error) {
      const failure = error instanceof Error ? error.message : 'Recovery file could not be added.'
      setMessage(failure)
      toast.error(failure)
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration / Continuity"
        title="Backup & Recovery"
        description="Create, download, validate, and atomically restore browser-local PATHWAYS demo state."
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              className="sr-only"
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Add recovery file
            </Button>
            <Button onClick={create}>
              <DatabaseBackup className="mr-2 h-4 w-4" />
              Create & download backup
            </Button>
          </div>
        }
      />
      <div className="rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm text-info">
        Demo data only. Backups are JSON snapshots created and restored entirely in this browser; no
        cloud storage is contacted. Active scenario: <strong>{state.scenario}</strong>.
      </div>
      <output className="block text-sm" aria-live="polite">
        {message}
      </output>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          title="Recovery points"
          description={`${state.backups.length} validated browser-local backup${state.backups.length === 1 ? '' : 's'}.`}
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
            <EmptyState
              title="No recovery point yet"
              description="Create a backup or add a compatible local JSON recovery file."
            />
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
                A successful restore replaces current demo records while retaining the recovery
                inventory. A failed validation or simulated restore failure preserves the current
                state.
              </p>
              <div className="grid gap-2">
                <Button
                  variant="outline"
                  onClick={() => downloadBackup(selected.payload, selected.name)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download selected
                </Button>
                <Button variant="destructive" onClick={() => setRestoreOpen(true)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore selected
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select or create a recovery point.</p>
          )}
        </SectionCard>
      </div>
      {state.scenario.startsWith('backup') || state.scenario === 'restore-failure' ? (
        <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This deterministic review scenario makes the next related operation fail without partial
          state changes.
        </div>
      ) : null}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {selected?.name}?</DialogTitle>
            <DialogDescription>
              This replaces the current browser-local organization snapshot after checksum and
              schema validation.
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
            <Button variant="destructive" onClick={restore}>
              Confirm restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
