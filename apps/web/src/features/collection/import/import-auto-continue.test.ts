import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'
import { describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import {
  importProcessingComplete,
  importProcessingPercent,
  importProcessingProgress,
  processingFailureNote,
  runImportProcessing,
} from './import-auto-continue'

/** A server stand-in that claims as many rows per process call as the API does. */
function fakeServer(validRows: number, options: { failingRows?: number } = {}) {
  const rows = Array.from({ length: validRows }, (_, index) => ({
    status: 'VALID' as 'VALID' | 'PROCESSED' | 'FAILED',
    attempts: 0,
    fails: index >= validRows - (options.failingRows ?? 0),
  }))
  let calls = 0
  const snapshot = (): ImportBatchDefinition => {
    const processed = rows.filter((row) => row.status === 'PROCESSED').length
    const failed = rows.filter((row) => row.status === 'FAILED').length
    const outstanding = rows.some((row) => row.status === 'VALID')
    return {
      id: 'batch-1',
      status: !outstanding && failed === 0 ? 'PROCESSED' : 'PARTIALLY_PROCESSED',
      validationRevision: 1,
      totals: { rows: validRows, valid: validRows, invalid: 0, processed, unprocessed: 0, failed },
    } as ImportBatchDefinition
  }
  return {
    get calls() {
      return calls
    },
    process: vi.fn(async () => {
      calls += 1
      for (const row of rows
        .filter((item) => item.status === 'VALID')
        .slice(0, IMPORT_ENGINEERING_LIMITS.processingClaimRows)) {
        row.attempts += 1
        if (!row.fails) row.status = 'PROCESSED'
        else if (row.attempts >= 3) row.status = 'FAILED'
      }
      return snapshot()
    }),
  }
}

describe('automatic import processing', () => {
  it('finishes a 5,000-row batch through repeated process calls without clicks', async () => {
    const server = fakeServer(5_000)
    const progress: number[] = []

    const outcome = await runImportProcessing({
      process: server.process,
      onProgress: (batch) => progress.push(importProcessingProgress(batch).handled),
      shouldStop: () => false,
    })

    expect(outcome).toMatchObject({ kind: 'complete' })
    expect(server.calls).toBe(5_000 / IMPORT_ENGINEERING_LIMITS.processingClaimRows)
    expect(progress.at(-1)).toBe(5_000)
    expect(progress).toEqual([...progress].sort((left, right) => left - right))
  })

  it('stops before the next call when Stop is requested', async () => {
    const server = fakeServer(1_000)
    let stop = false
    const outcome = await runImportProcessing({
      process: server.process,
      onProgress: (batch) => {
        if (importProcessingProgress(batch).handled >= 300) stop = true
      },
      shouldStop: () => stop,
    })

    expect(outcome.kind).toBe('stopped')
    expect(server.calls).toBe(300 / IMPORT_ENGINEERING_LIMITS.processingClaimRows)
    expect(outcome.kind === 'stopped' && outcome.batch?.totals.processed).toBe(300)
  })

  it('returns the last server state when a call fails so the user can resume', async () => {
    const server = fakeServer(500)
    const error = new Error('The application transaction is temporarily unavailable.')
    const process = vi
      .fn<() => Promise<ImportBatchDefinition>>()
      .mockImplementationOnce(server.process)
      .mockRejectedValueOnce(error)

    const outcome = await runImportProcessing({
      process,
      onProgress: () => undefined,
      shouldStop: () => false,
    })

    expect(outcome).toMatchObject({ kind: 'failed', error })
    expect(outcome.kind === 'failed' && outcome.batch?.totals.processed).toBe(
      IMPORT_ENGINEERING_LIMITS.processingClaimRows,
    )
  })

  it('treats a batch whose remaining rows all failed as complete', async () => {
    const server = fakeServer(150, { failingRows: 20 })
    const outcome = await runImportProcessing({
      process: server.process,
      onProgress: () => undefined,
      shouldStop: () => false,
    })
    expect(outcome.kind).toBe('complete')
    expect(outcome.kind === 'complete' && outcome.batch.totals).toMatchObject({
      processed: 130,
      failed: 20,
    })
  })

  it('stops calling when the server makes no further progress', async () => {
    const stuck = {
      id: 'batch-1',
      status: 'PARTIALLY_PROCESSED',
      totals: { rows: 10, valid: 10, invalid: 0, processed: 4, unprocessed: 0, failed: 0 },
    } as ImportBatchDefinition
    const process = vi.fn(async () => stuck)
    const outcome = await runImportProcessing({
      process,
      onProgress: () => undefined,
      shouldStop: () => false,
    })
    expect(outcome.kind).toBe('stalled')
    expect(process).toHaveBeenCalledTimes(5)
  })

  it('derives progress only from server totals', () => {
    const batch = {
      status: 'PARTIALLY_PROCESSED',
      totals: { rows: 12, valid: 10, invalid: 2, processed: 6, unprocessed: 2, failed: 2 },
    } as ImportBatchDefinition
    expect(importProcessingProgress(batch)).toEqual({
      handled: 10,
      total: 10,
      processed: 6,
      unprocessed: 2,
      failed: 2,
    })
    expect(importProcessingComplete(batch)).toBe(true)
    expect(importProcessingPercent(importProcessingProgress(batch))).toBe(100)
    expect(
      importProcessingComplete({ ...batch, status: 'VALIDATED' } as ImportBatchDefinition),
    ).toBe(false)
  })
})

describe('processing failure note', () => {
  it('names a dropped connection in plain words and keeps a server reason as it is', () => {
    expect(processingFailureNote(new TypeError('Failed to fetch'))).toBe(
      'The server stopped answering before this step finished. Rows already handled are kept.',
    )
    expect(processingFailureNote(new Error('The import changed.'))).toBe('The import changed.')
  })
})
