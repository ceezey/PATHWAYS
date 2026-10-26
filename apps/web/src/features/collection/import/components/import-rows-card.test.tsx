/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ImportRowDefinition } from '@/types/pathways'

import { ImportRowsCard } from './import-rows-card'

const row = (
  rowNumber: number,
  validationWarnings: ImportRowDefinition['validationWarnings'],
): ImportRowDefinition => ({
  id: `row-${rowNumber}`,
  rowNumber,
  rawData: { column_0001: `value-${rowNumber}` },
  status: 'VALID',
  validationErrors: [],
  validationWarnings,
  mappingRevision: 1,
  validationRevision: 1,
  processingAttempts: 0,
  processingErrorCode: null,
  resolvedAt: null,
  updatedAt: '2026-10-23T00:00:00Z',
})
const state = {
  rows: [row(1, []), row(2, [{ fieldCode: 'age_at_registration', code: 'AGE_MISMATCH' }])],
  sourceColumnByKey: new Map(),
  validationErrors: 0,
}

describe('ImportRowsCard warnings', () => {
  afterEach(cleanup)

  it('shows each warning in plain words, never its code', () => {
    render(<ImportRowsCard state={state} />)
    expect(
      screen.getByText('age_at_registration: The age does not match the birth date'),
    ).toBeTruthy()
    expect(screen.queryByText(/AGE_MISMATCH/)).toBeNull()
  })

  it('rows card filters to rows with warnings', () => {
    render(<ImportRowsCard state={state} />)
    expect(screen.getByText('value-1', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only rows with warnings' }))
    expect(screen.queryByText('value-1', { exact: false })).toBeNull()
    expect(screen.getByText('value-2', { exact: false })).toBeTruthy()
  })

  it('says so when no loaded row has a warning', () => {
    render(<ImportRowsCard state={{ ...state, rows: [row(1, [])] }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show only rows with warnings' }))
    expect(screen.getByText('No loaded rows have warnings.')).toBeTruthy()
  })

  it('words a hold in plain terms and keeps other processing codes as they were', () => {
    const rows = [
      { ...row(3, []), status: 'UNPROCESSED', processingErrorCode: 'PROFILE_CHANGED' },
      { ...row(4, []), status: 'FAILED', processingErrorCode: 'RETRY_LIMIT_EXCEEDED' },
    ] as ImportRowDefinition[]
    render(<ImportRowsCard state={{ ...state, rows }} />)
    expect(screen.getByText('Values differ from PATHWAYS')).toBeTruthy()
    expect(screen.getByText('Retry limit exceeded')).toBeTruthy()
    expect(screen.queryByText('Needs review')).toBeNull()
  })
})
