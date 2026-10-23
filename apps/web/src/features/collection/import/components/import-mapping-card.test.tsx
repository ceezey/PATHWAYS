/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { ImportMappingCard } from './import-mapping-card'

const batch = {
  id: 'batch-1',
  status: 'MAPPED',
  mappingRevision: 1,
  validationRevision: 0,
} as ImportBatchDefinition
const notCovered = {
  batchId: 'batch-1',
  mappingRevision: 1 as const,
  mapped: 1,
  pending: 3,
  ignored: 0,
  requiredUnmapped: 0,
  complete: false,
  coverage: 'NOT_COVERED' as const,
  uncoveredColumns: 3,
  unresolvedValues: 12,
}
const prepareForm = vi.fn()

const renderCard = (over: { canManageForms?: boolean; receipts?: object; batch?: object } = {}) =>
  render(
    <ImportMappingCard
      batch={{ ...batch, ...over.batch } as ImportBatchDefinition}
      intake={{ prepareForm }}
      review={{ confirmSuggestions: vi.fn(), saveMapping: vi.fn(), validate: vi.fn() }}
      run={{ process: vi.fn(), processingInterrupted: false }}
      state={{
        canManageForms: over.canManageForms ?? true,
        canProcess: false,
        canReview: false,
        canValidate: false,
        columnValues: new Map(),
        mapping: { column_0001: '__pending__' },
        mappingEditable: false,
        mappingHeading: { current: null },
        mappingNotice: '',
        mutation: { current: null },
        openSuggestions: [],
        pending: false,
        receipts: (over.receipts ?? { 'batch-1': notCovered }) as never,
        rules: {},
        scope: { isCurrent: () => true } as never,
        selectedForm: undefined,
        setMapping: vi.fn(),
        setRules: vi.fn(),
        sourceColumns: [{ key: 'column_0001', header: 'Given name', columnIndex: 1 }],
        storedMappingByKey: new Map([
          [
            'column_0001',
            {
              sourceFieldName: 'column_0001',
              status: 'MAPPED',
              revision: 1,
              targetField: { code: 'first_name', label: 'First name' },
              validationMessage: 'AUTO_SMART_V3:AUTO_MATCH',
              suggestedField: null,
              matchScore: 95,
              matchReason: 'EXACT',
              dataType: null,
              valueMap: null,
            },
          ],
        ]),
      }}
    />,
  )

describe('ImportMappingCard form coverage', () => {
  afterEach(() => {
    cleanup()
    prepareForm.mockReset()
  })

  it('shows the counts and Prepare form to a holder of forms.manage', () => {
    renderCard()
    expect(screen.getByText('Form needs updating: 3 columns, 12 answers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
    expect(prepareForm).toHaveBeenCalledTimes(1)
  })

  it('Prepare form is hidden without forms.manage and a read-only notice shows instead', () => {
    renderCard({ canManageForms: false })
    expect(screen.getByText('Form needs updating: 3 columns, 12 answers')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
    expect(
      screen.getByText('Someone who manages forms can prepare the form from this file.'),
    ).toBeTruthy()
  })

  it('shows nothing for a covered file, a missing receipt or a later reviewed revision', () => {
    for (const over of [
      { receipts: { 'batch-1': { ...notCovered, coverage: 'COVERED' } } },
      { receipts: {} },
      { batch: { mappingRevision: 2 } },
    ]) {
      renderCard(over)
      expect(screen.queryByText(/Form needs updating/)).toBeNull()
      cleanup()
    }
  })

  it('names an AUTO_SMART_V3 match like a V2 one', () => {
    renderCard()
    expect(screen.getByText('Auto-matched: exact name')).toBeTruthy()
  })
})
