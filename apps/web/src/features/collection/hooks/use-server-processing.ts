import { useState } from 'react'

import { importsClient } from '@/lib/api/imports'
import type { principalHasAtomicPermission } from '@/lib/rbac/policy'

import {
  type ImportProcessingOutcome,
  type ImportProcessingProgress,
  importProcessingProgress,
  runImportProcessing,
} from '../import-auto-continue'
import type { ImportProcessingState } from '../import-processing-panel'
import type { useImportBatch } from './use-import-batch'

type Ticket = {
  valid: (permission?: Parameters<typeof principalHasAtomicPermission>[1]) => boolean
  finish: () => void
}

// Runs the repeated server process calls of one confirmed import and keeps its progress, stop and resume.
export function useServerProcessing({
  projectId,
  beginOperation,
  importBatch,
  setSavedNotice,
  setProceedDialogOpen,
  setImportMessage,
}: {
  projectId: string
  beginOperation: (permission: Parameters<typeof principalHasAtomicPermission>[1]) => Ticket | null
  importBatch: ReturnType<typeof useImportBatch>
  setSavedNotice: (notice: string) => void
  setProceedDialogOpen: (open: boolean) => void
  setImportMessage: (message: string) => void
}) {
  const [processingRun, setProcessingRun] = useState<{
    projectId: string
    batchId: string
    validationRevision: number
    state: ImportProcessingState
    progress: ImportProcessingProgress
    note?: string
  } | null>(null)

  // Calls process until the batch is done, a call fails, or Stop is pressed. Each call
  // is a separate authorized request; progress comes from each server response.
  const continueServerProcessing = async (
    ticket: Ticket,
    target: {
      projectId: string
      batchId: string
      validationRevision: number
      progress: ImportProcessingProgress
    },
  ) => {
    let latest = target.progress
    importBatch.stopRequested.current = false
    setProcessingRun({ ...target, state: 'running' })
    const outcome: ImportProcessingOutcome = await runImportProcessing({
      process: () =>
        importsClient.processImport(target.projectId, target.batchId, target.validationRevision),
      onProgress: (next) => {
        latest = importProcessingProgress(next)
        if (ticket.valid('imports.process'))
          setProcessingRun((run) =>
            run?.batchId === target.batchId ? { ...run, progress: latest } : run,
          )
      },
      shouldStop: () => importBatch.stopRequested.current || !ticket.valid('imports.process'),
    })
    if (!ticket.valid('imports.process')) {
      // Access or ownership changed; the server keeps its state and nothing stale is shown.
      setProcessingRun(null)
      return
    }
    if (outcome.kind === 'complete') {
      setProcessingRun(null)
      setSavedNotice(
        `Server import ${outcome.batch.id}: ${outcome.batch.totals.processed} processed, ${outcome.batch.totals.failed} failed.`,
      )
      setProceedDialogOpen(false)
      return
    }
    setProcessingRun({
      ...target,
      progress: latest,
      state: outcome.kind === 'stopped' ? 'stopped' : 'failed',
      note:
        outcome.kind === 'failed'
          ? outcome.error instanceof Error
            ? outcome.error.message
            : 'Processing could not be completed.'
          : outcome.kind === 'stalled'
            ? 'The remaining rows could not be processed. Review failed rows in the Import workspace.'
            : undefined,
    })
  }

  const resumeServerProcessing = async () => {
    const run = processingRun
    if (!run || (run.state !== 'stopped' && run.state !== 'failed')) return
    if (run.projectId !== projectId) return
    const ticket = beginOperation('imports.process')
    if (!ticket) return
    try {
      await continueServerProcessing(ticket, run)
    } catch (error) {
      if (ticket.valid('imports.process'))
        setImportMessage(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      ticket.finish()
    }
  }

  const stopServerProcessing = () => {
    importBatch.stopRequested.current = true
    setProcessingRun((run) => (run?.state === 'running' ? { ...run, state: 'stopping' } : run))
  }

  return {
    processingRun,
    setProcessingRun,
    continueServerProcessing,
    resumeServerProcessing,
    stopServerProcessing,
  }
}
