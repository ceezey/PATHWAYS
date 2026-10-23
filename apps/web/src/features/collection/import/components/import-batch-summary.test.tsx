/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { ImportBatchSummary } from './import-batch-summary'

const batch = {
  id: 'batch-1',
  originalFileName: 'people.csv',
  formName: 'Registration',
  formVersion: 1,
  status: 'MAPPED',
  failureCode: null,
  totals: { rows: 2, valid: 0, invalid: 0, processed: 0, unprocessed: 0, failed: 0, warnings: 0 },
} as ImportBatchDefinition
const rerun = vi.fn()

const renderSummary = (rerunTarget: { version: number } | null) =>
  render(
    <ImportBatchSummary
      batch={batch}
      intake={{ rerun, rerunTarget: rerunTarget as never }}
      review={{ loadBatch: vi.fn(), resume: vi.fn() }}
    />,
  )

describe('ImportBatchSummary re-run', () => {
  afterEach(() => {
    cleanup()
    rerun.mockReset()
  })

  it('offers Re-run import with the newer version when one is available', () => {
    renderSummary({ version: 2 })
    expect(screen.getByText(/Version 2 of this form is published/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Re-run import' }))
    expect(rerun).toHaveBeenCalledTimes(1)
  })

  it('offers nothing when there is no newer version for this person', () => {
    renderSummary(null)
    expect(screen.queryByRole('button', { name: 'Re-run import' })).toBeNull()
  })
})
