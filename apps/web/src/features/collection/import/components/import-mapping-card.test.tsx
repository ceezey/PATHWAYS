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

const renderCard = (
  over: {
    canManageForms?: boolean
    receipts?: object
    batch?: object
    formOfferSeen?: ReadonlySet<string>
    mapping?: Record<string, string>
    columnValues?: Map<string, string[]>
    selectedForm?: object
    rules?: object
  } = {},
) =>
  render(
    <ImportMappingCard
      batch={{ ...batch, ...over.batch } as ImportBatchDefinition}
      intake={{ prepareForm }}
      review={{ confirmSuggestions: vi.fn(), validate: vi.fn() }}
      run={{ process: vi.fn(), processingInterrupted: false }}
      state={{
        canManageForms: over.canManageForms ?? true,
        canProcess: false,
        canReview: false,
        canValidate: false,
        columnValues: over.columnValues ?? new Map(),
        formOfferSeen: over.formOfferSeen ?? new Set(),
        mapping: over.mapping ?? { column_0001: '__pending__' },
        mappingEditable: false,
        mappingHeading: { current: null },
        mappingNotice: '',
        mutation: { current: null },
        openSuggestions: [],
        pending: false,
        receipts: (over.receipts ?? { 'batch-1': notCovered }) as never,
        rules: (over.rules ?? {}) as never,
        scope: { isCurrent: () => true } as never,
        selectedForm: over.selectedForm as never,
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
              dateOrder: null,
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

  it('shows Prepare form from the batch detail coverage to a forms.manage holder with no session receipt', () => {
    const coverage = { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 4 }
    renderCard({ receipts: {}, batch: { coverage, uploadedByCurrentUser: false } })
    expect(screen.getByText('Form needs updating: 2 columns, 4 answers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
    expect(prepareForm).toHaveBeenCalledTimes(1)
  })

  it('does not repeat the notice for a batch whose uploader saw Prepare form in the file check', () => {
    renderCard({ formOfferSeen: new Set(['batch-1']) })
    expect(screen.queryByText(/Form needs updating/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
  })

  it('prefers the server coverage over a stale session receipt', () => {
    renderCard({ batch: { coverage: { ...notCovered, coverage: 'COVERED' } } })
    expect(screen.queryByText(/Form needs updating/)).toBeNull()
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

describe('ImportMappingCard value translations', () => {
  afterEach(cleanup)

  const consentForm = {
    fields: [
      {
        code: 'data_processing_consent_recorded',
        label: 'Data processing consent',
        dataType: 'BOOLEAN',
        allowedValues: null,
        valueAliases: null,
      },
    ],
  }
  const consentCard = (values: string[], rules: object = {}) =>
    renderCard({
      receipts: {},
      mapping: { column_0001: 'data_processing_consent_recorded' },
      columnValues: new Map([['column_0001', values]]),
      selectedForm: consentForm,
      rules,
    })

  it('shows the pairs import reads on its own above the filter, and needs no decision', () => {
    consentCard(['Yes', 'No', 'TRUE'])
    // The column needs no decision, so the default filter hides it; the summary still shows.
    expect(
      screen.getByText(
        'Translated automatically: Given name (Yes → true, No → false). Add a translation on the column to change one.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Show only columns that need a decision (0 of 1)')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(
      screen.getByText(
        'Translated automatically: Yes → true, No → false. Add a translation to change one.',
      ),
    ).toBeTruthy()
  })

  it('names the values nothing converts and counts the column as needing a decision', () => {
    consentCard(['Yes', 'Maybe'])
    expect(
      screen.getByText(
        '1 value matches no answer: Maybe. Add a translation for each, or rows with these values will be invalid.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Show only columns that need a decision (1 of 1)')).toBeTruthy()
  })

  it('reads a choice column by its form field type, whatever type the column declares', () => {
    renderCard({
      receipts: {},
      mapping: { column_0001: 'sex' },
      columnValues: new Map([['column_0001', ['Babae', 'X']]]),
      selectedForm: {
        fields: [
          {
            code: 'sex',
            label: 'Sex',
            dataType: 'SELECT',
            allowedValues: ['MALE', 'FEMALE'],
            valueAliases: null,
          },
        ],
      },
      rules: { column_0001: { dataType: 'TEXT', pairs: [] } },
    })
    expect(
      screen.getByText(
        'Translated automatically: Given name (Babae → FEMALE). Add a translation on the column to change one.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        '1 value matches no answer: X. Add a translation for each, or rows with these values will be invalid.',
      ),
    ).toBeTruthy()
  })

  it('a saved translation settles a leftover value', () => {
    consentCard(['Maybe'], {
      column_0001: { dataType: '', pairs: [{ from: 'Maybe', to: 'false' }] },
    })
    expect(screen.queryByText(/match(es)? no answer/)).toBeNull()
    expect(screen.getByText('Show only columns that need a decision (0 of 1)')).toBeTruthy()
  })
})
