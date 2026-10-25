import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'

import type { ImportBatchDefinition } from '@/types/pathways'

/**
 * Client loop for server import processing. Each call is a separate authorized
 * `process` request; progress comes only from each server response, never from a
 * cached status read, and the server never trusts client progress.
 */

export interface ImportProcessingProgress {
  /** Rows the server has finished with: processed, held for review, or failed. */
  handled: number
  /** Rows that passed validation and are eligible for processing. */
  total: number
  processed: number
  unprocessed: number
  failed: number
}

export type ImportProcessingOutcome =
  | { kind: 'complete'; batch: ImportBatchDefinition }
  | { kind: 'stopped'; batch?: ImportBatchDefinition }
  | { kind: 'stalled'; batch?: ImportBatchDefinition }
  | { kind: 'failed'; error: unknown; batch?: ImportBatchDefinition }

// A released row is retried at most three times before the server marks it failed,
// so a few calls without progress are expected; more than that means no progress.
const MAX_CALLS_WITHOUT_PROGRESS = 3
// One call per claim for the largest file, doubled to leave room for retries.
const MAX_PROCESS_CALLS =
  (2 * IMPORT_ENGINEERING_LIMITS.maxRows) / IMPORT_ENGINEERING_LIMITS.processingClaimRows

export function importProcessingProgress(batch: ImportBatchDefinition): ImportProcessingProgress {
  const count = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  const processed = count(batch.totals?.processed)
  const unprocessed = count(batch.totals?.unprocessed)
  const failed = count(batch.totals?.failed)
  const handled = processed + unprocessed + failed
  return {
    handled,
    total: Math.max(count(batch.totals?.valid), handled),
    processed,
    unprocessed,
    failed,
  }
}

export function importProcessingComplete(batch: ImportBatchDefinition) {
  if (batch.status === 'PROCESSED') return true
  if (batch.status !== 'PARTIALLY_PROCESSED') return false
  const progress = importProcessingProgress(batch)
  return progress.handled >= progress.total
}

export function importProcessingPercent(progress: ImportProcessingProgress) {
  return progress.total === 0 ? 100 : Math.floor((progress.handled / progress.total) * 100)
}

// Why a process call failed; a dropped connection, which fetch reports as a TypeError, in plain words.
export const processingFailureNote = (error: unknown) =>
  error instanceof TypeError
    ? 'The server stopped answering before this step finished. Rows already handled are kept.'
    : error instanceof Error
      ? error.message
      : 'Processing could not be completed.'

export async function runImportProcessing({
  process,
  onProgress,
  shouldStop,
}: {
  process: () => Promise<ImportBatchDefinition>
  onProgress: (batch: ImportBatchDefinition) => void
  shouldStop: () => boolean
}): Promise<ImportProcessingOutcome> {
  let last: ImportBatchDefinition | undefined
  let callsWithoutProgress = 0
  for (let call = 0; call < MAX_PROCESS_CALLS; call += 1) {
    if (shouldStop()) return { kind: 'stopped', batch: last }
    let batch: ImportBatchDefinition
    try {
      batch = await process()
    } catch (error) {
      return { kind: 'failed', error, batch: last }
    }
    onProgress(batch)
    if (importProcessingComplete(batch)) return { kind: 'complete', batch }
    const advanced =
      !last || importProcessingProgress(batch).handled > importProcessingProgress(last).handled
    callsWithoutProgress = advanced ? 0 : callsWithoutProgress + 1
    last = batch
    if (callsWithoutProgress > MAX_CALLS_WITHOUT_PROGRESS) return { kind: 'stalled', batch }
  }
  return { kind: 'stalled', batch: last }
}
