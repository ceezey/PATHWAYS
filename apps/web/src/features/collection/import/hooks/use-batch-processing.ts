import { toast } from 'sonner'

import { importsClient } from '@/lib/api/imports'

import { importProcessingProgress, runImportProcessing } from '../import-auto-continue'
import type { BatchReview } from './use-batch-review'
import type { ImportState } from './use-import-state'

export function useBatchProcessing(state: ImportState, review: BatchReview) {
  const { batch, begin, importBatch, processing, projectId, setProcessing } = state
  const { loadBatch } = review
  // Keeps calling the server until the batch is done, a call fails, or Stop is pressed.
  const process = async () => {
    if (!batch) return
    const ticket = begin('imports.process')
    if (!ticket) return
    const target = batch
    let latest = importProcessingProgress(target)
    importBatch.stopRequested.current = false
    setProcessing({ batchId: target.id, state: 'running', progress: latest })
    try {
      const outcome = await runImportProcessing({
        process: () => importsClient.processImport(projectId, target.id, target.validationRevision),
        onProgress: (next) => {
          latest = importProcessingProgress(next)
          if (ticket.valid('imports.read'))
            setProcessing((current) =>
              current?.batchId === target.id ? { ...current, progress: latest } : current,
            )
        },
        shouldStop: () => importBatch.stopRequested.current || !ticket.valid('imports.process'),
      })
      if (!ticket.valid('imports.read')) {
        // Access or ownership changed; the server keeps its state and nothing stale is shown.
        setProcessing(null)
        return
      }
      const note =
        outcome.kind === 'failed'
          ? outcome.error instanceof Error
            ? outcome.error.message
            : 'Processing could not be completed.'
          : outcome.kind === 'stalled'
            ? 'The remaining rows could not be processed. Review failed rows before retrying.'
            : undefined
      setProcessing({
        batchId: target.id,
        state:
          outcome.kind === 'complete'
            ? 'complete'
            : outcome.kind === 'stopped'
              ? 'stopped'
              : 'failed',
        progress: latest,
        note,
      })
      await loadBatch(target.id, ticket)
      if (!ticket.valid()) return
      if (outcome.kind === 'complete') toast.success('Import processing finished.')
      else if (note) toast.error(note)
    } catch (error) {
      if (!ticket.valid()) return
      toast.error(error instanceof Error ? error.message : 'Processing could not be completed.')
    } finally {
      ticket.finish()
    }
  }

  const stopProcessing = () => {
    importBatch.stopRequested.current = true
    setProcessing((current) =>
      current?.state === 'running' ? { ...current, state: 'stopping' } : current,
    )
  }
  const visibleProcessing = processing && processing.batchId === batch?.id ? processing : null
  const processingInterrupted =
    visibleProcessing?.state === 'failed' || visibleProcessing?.state === 'stopped'
  return { process, processingInterrupted, stopProcessing, visibleProcessing }
}

export type BatchProcessing = ReturnType<typeof useBatchProcessing>
