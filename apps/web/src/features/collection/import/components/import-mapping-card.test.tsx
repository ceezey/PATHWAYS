/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
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
const pendingBar = '1 column needs a decision: map it to a field, or ignore it.'

// jsdom lacks the layout APIs Radix Select calls when it opens.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false

const storedColumn = (over: object = {}) => ({
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
  ...over,
})

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
    canReview?: boolean
    mappingEditable?: boolean
    suggestions?: object[]
    columns?: Array<{ key: string; header: string; columnIndex: number }>
    stored?: Array<[string, object]>
  } = {},
) => render(<Card {...over} />)

// The mapping lives in state, as in the workspace, so choosing a target updates the card.
function Card(over: Parameters<typeof renderCard>[0] & object) {
  const [mapping, setMapping] = useState(over.mapping ?? { column_0001: '__pending__' })
  const [rules, setRules] = useState(over.rules ?? {})
  return (
    <ImportMappingCard
      batch={{ ...batch, ...over.batch } as ImportBatchDefinition}
      intake={{ prepareForm }}
      review={{ confirmSuggestions: vi.fn(), validate: vi.fn() }}
      run={{ process: vi.fn(), processingInterrupted: false }}
      state={{
        canManageForms: over.canManageForms ?? true,
        canProcess: false,
        canReview: over.canReview ?? false,
        canValidate: false,
        columnValues: over.columnValues ?? new Map(),
        formOfferSeen: over.formOfferSeen ?? new Set(),
        mapping,
        mappingEditable: over.mappingEditable ?? true,
        mappingHeading: { current: null },
        mappingNotice: '',
        mutation: { current: null },
        openSuggestions: (over.suggestions ?? []) as never,
        pending: false,
        receipts: (over.receipts ?? { 'batch-1': notCovered }) as never,
        rules: rules as never,
        scope: { isCurrent: () => true } as never,
        selectedForm: over.selectedForm as never,
        setMapping,
        setRules: setRules as never,
        sourceColumns: over.columns ?? [
          { key: 'column_0001', header: 'Given name', columnIndex: 1 },
        ],
        storedMappingByKey: new Map(over.stored ?? [['column_0001', storedColumn()]]) as never,
      }}
    />
  )
}

describe('ImportMappingCard form coverage', () => {
  afterEach(() => {
    cleanup()
    prepareForm.mockReset()
  })

  it('shows the counts and Prepare form to a holder of forms.manage', () => {
    renderCard()
    expect(screen.getByText(pendingBar)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
    expect(prepareForm).toHaveBeenCalledTimes(1)
  })

  it('Prepare form is hidden without forms.manage and a read-only notice shows instead', () => {
    renderCard({ canManageForms: false })
    expect(screen.getByText(pendingBar)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
    expect(
      screen.getByText('Someone who manages forms can prepare the form from this file.'),
    ).toBeTruthy()
  })

  it('shows Prepare form from the batch detail coverage to a forms.manage holder with no session receipt', () => {
    const coverage = { coverage: 'NOT_COVERED', uncoveredColumns: 2, unresolvedValues: 4 }
    renderCard({ receipts: {}, batch: { coverage, uploadedByCurrentUser: false } })
    expect(screen.getByText(pendingBar)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare form' }))
    expect(prepareForm).toHaveBeenCalledTimes(1)
  })

  it('does not repeat the notice for a batch whose uploader saw Prepare form in the file check', () => {
    renderCard({ formOfferSeen: new Set(['batch-1']) })
    expect(
      screen.queryByText(/column needs a decision|columns need a decision|will not be saved/),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
  })

  it('prefers the server coverage over a stale session receipt', () => {
    renderCard({ batch: { coverage: { ...notCovered, coverage: 'COVERED' } } })
    expect(
      screen.queryByText(/column needs a decision|columns need a decision|will not be saved/),
    ).toBeNull()
  })

  it('shows nothing for a covered file, a missing receipt or a later reviewed revision', () => {
    for (const over of [
      { receipts: { 'batch-1': { ...notCovered, coverage: 'COVERED' } } },
      { receipts: {} },
      { batch: { mappingRevision: 2 } },
    ]) {
      renderCard(over)
      expect(
        screen.queryByText(/column needs a decision|columns need a decision|will not be saved/),
      ).toBeNull()
      cleanup()
    }
  })

  it('names an AUTO_SMART_V3 match like a V2 one', () => {
    renderCard()
    expect(screen.getByText('Auto-matched: exact name')).toBeTruthy()
  })

  it('warns of a required field with no column, except the enrollment date of a registration form', () => {
    const fields = [
      { code: 'first_name', label: 'First name', dataType: 'TEXT', required: true },
      { code: 'enrollment_date', label: 'Enrollment date', dataType: 'DATE', required: true },
    ]
    const warningOf = (formType: string) => {
      cleanup()
      renderCard({
        receipts: {},
        batch: { formType },
        mapping: { column_0001: 'first_name' },
        selectedForm: { fields },
      })
      return screen.queryByText(/Validation will be refused/)?.textContent ?? null
    }
    expect(warningOf('BENEFICIARY_REGISTRATION')).toBeNull()
    expect(warningOf('PRE_TEST')).toContain('Enrollment date (enrollment_date)')
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

describe('ImportMappingCard translations only where values match no answer', () => {
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
  const card = (values: string[], over: object = {}) =>
    renderCard({
      receipts: {},
      mapping: { column_0001: 'data_processing_consent_recorded' },
      columnValues: new Map([['column_0001', values]]),
      selectedForm: consentForm,
      canReview: true,
      ...over,
    })
  const translations = () => document.querySelector('details') as HTMLDetailsElement

  it('offers Add translations in the warning, which opens the column and focuses into it', () => {
    card(['Yes', 'Maybe'])
    expect(translations().open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Add translations for column 1' }))
    expect(translations().open).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText('Data type for column 1'))
    // The button only opens the section; it adds no pairs.
    expect(screen.queryByLabelText('Source value 1')).toBeNull()
  })

  it('lets the person close the section again', () => {
    card(['Yes', 'Maybe'])
    fireEvent.click(screen.getByRole('button', { name: 'Add translations for column 1' }))
    translations().open = false
    fireEvent(translations(), new Event('toggle'))
    expect(translations().open).toBe(false)
  })

  it('marks the section optional and closed when every value matches an answer', () => {
    card(['Yes', 'No'])
    // The column needs no decision, so show all columns to reach it.
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText('Data type and value translations (optional)')).toBeTruthy()
    expect(translations().open).toBe(false)
    expect(screen.queryByRole('button', { name: /Add translations/ })).toBeNull()
  })

  it('keeps the plain summary while values match no answer', () => {
    card(['Yes', 'Maybe'])
    expect(screen.getByText('Data type and value translations')).toBeTruthy()
  })

  it('shows the warning without the button to someone who cannot edit the mapping', () => {
    card(['Yes', 'Maybe'], { canReview: false })
    expect(screen.getByText(/1 value matches no answer: Maybe/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add translations/ })).toBeNull()
  })

  it('shows no button while the mapping is locked', () => {
    card(['Yes', 'Maybe'], { mappingEditable: false })
    expect(screen.queryByRole('button', { name: /Add translations/ })).toBeNull()
  })
})

describe('ImportMappingCard ignored and pending columns', () => {
  afterEach(cleanup)

  const columns = [
    { key: 'column_0001', header: 'Total score', columnIndex: 1 },
    { key: 'column_0002', header: 'Mystery', columnIndex: 2 },
  ]
  const ignoredStored = (message: string) =>
    storedColumn({ status: 'IGNORED', targetField: null, validationMessage: message })
  const firstName = { fields: [{ code: 'first_name', label: 'First name', dataType: 'TEXT' }] }
  const choose = (name: string) => {
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    fireEvent.click(screen.getByRole('option', { name }))
  }

  it('shows the matcher reason under an ignored column and drops it once the person changes the select', () => {
    renderCard({
      columns: columns.slice(0, 1),
      mapping: { column_0001: '__ignore__' },
      stored: [['column_0001', ignoredStored('AUTO_SMART_V5:CALCULATED_FIELD')]],
      selectedForm: firstName,
    })
    // A decided column is hidden by the default filter.
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText('Ignored: the form works this out from other answers.')).toBeTruthy()
    choose('First name (first_name)')
    expect(screen.queryByText(/^Ignored:/)).toBeNull()
  })

  it('shows up to three cut samples, the pending line and the Not sure line for a pending column', () => {
    renderCard({
      columns: columns.slice(1),
      mapping: { column_0002: '__pending__' },
      stored: [['column_0002', storedColumn({ status: 'PENDING', targetField: null })]],
      columnValues: new Map([['column_0002', ['Alpha', 'Beta', 'x'.repeat(60), 'Delta']]]),
    })
    expect(screen.getByText(`Sample values: Alpha, Beta, ${'x'.repeat(37)}...`)).toBeTruthy()
    expect(screen.queryByText(/Delta/)).toBeNull()
    expect(screen.getByText('Not in the form. If ignored, this column is not saved.')).toBeTruthy()
    expect(
      screen.getByText(
        'Not sure? Ignore it. The file stays stored, and after a form manager adds the field, the uploader can re-run this import.',
      ),
    ).toBeTruthy()
  })

  it('follows the decision: pending bar, then a neutral ignored bar, then no bar', () => {
    renderCard({
      columns: columns.slice(1),
      mapping: { column_0002: '__pending__' },
      stored: [['column_0002', storedColumn({ status: 'PENDING', targetField: null })]],
      selectedForm: firstName,
    })
    const bar = () => screen.getByRole('region', { name: 'Mapping decisions' })
    expect(bar().textContent).toContain(pendingBar)
    expect(bar().className).toContain('border-warning')
    choose('Ignore this source column')
    expect(bar().textContent).toContain(
      '1 ignored column is not in the form and will not be saved. Prepare form to keep it.',
    )
    expect(bar().className).not.toContain('warning')
    expect(screen.queryByText(/Not sure\?/)).toBeNull()
    choose('First name (first_name)')
    expect(screen.queryByRole('region', { name: 'Mapping decisions' })).toBeNull()
  })

  it('shows a Project Officer the reasons and the bar without Prepare form', () => {
    renderCard({
      canManageForms: false,
      canReview: false,
      mappingEditable: false,
      columns,
      mapping: { column_0001: '__ignore__', column_0002: '__ignore__' },
      stored: [
        ['column_0001', ignoredStored('AUTO_SMART_V5:SUBMISSION_TIME')],
        ['column_0002', storedColumn({ status: 'PENDING', targetField: null })],
      ],
    })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText('Ignored: the time the form was submitted.')).toBeTruthy()
    const bar = screen.getByRole('region', { name: 'Mapping decisions' }).textContent
    expect(bar).toContain('1 ignored column is not in the form and will not be saved.')
    expect(bar).not.toContain('Prepare form to keep')
    expect(bar).toContain('Someone who manages forms can prepare the form from this file.')
    expect(screen.queryByRole('button', { name: 'Prepare form' })).toBeNull()
  })

  it('gives a pending column with a suggestion no not-in-the-form line, yet still counts it', () => {
    renderCard({
      columns: columns.slice(1),
      mapping: { column_0002: '__pending__' },
      stored: [['column_0002', storedColumn({ status: 'PENDING', targetField: null })]],
      suggestions: [{ column: columns[1], label: 'First name (first_name)' }],
      columnValues: new Map([['column_0002', ['Alpha']]]),
    })
    expect(screen.getByText('Suggested: First name (first_name)')).toBeTruthy()
    expect(screen.queryByText(/Not in the form/)).toBeNull()
    expect(screen.queryByText(/Sample values/)).toBeNull()
    expect(screen.getByText(pendingBar)).toBeTruthy()
  })

  it('does not call an auto-mapped column the person switches to ignore not in the form', () => {
    renderCard({
      columns: columns.slice(1),
      mapping: { column_0002: 'first_name' },
      stored: [['column_0002', storedColumn()]],
      selectedForm: { fields: [{ code: 'first_name', label: 'First name', dataType: 'TEXT' }] },
    })
    // Column 2 is mapped by the matcher; switching it to ignore says nothing about the form.
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Target for column 2/ }), {
      key: 'Enter',
    })
    fireEvent.click(screen.getByRole('option', { name: 'Ignore this source column' }))
    expect(screen.queryByText(/ignored column/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Mapping decisions' })).toBeNull()
  })

  it('ties the reason and the pending help to the column select', () => {
    renderCard({
      columns,
      mapping: { column_0001: '__ignore__', column_0002: '__pending__' },
      stored: [
        ['column_0001', ignoredStored('AUTO_SMART_V5:BLANK_COLUMN')],
        ['column_0002', storedColumn({ status: 'PENDING', targetField: null })],
      ],
    })
    fireEvent.click(screen.getByRole('checkbox'))
    const describedText = (name: RegExp) => {
      const id = screen.getByRole('combobox', { name }).getAttribute('aria-describedby')
      return id ? document.getElementById(id)?.textContent : null
    }
    expect(describedText(/column 1/)).toBe('Ignored: the column is empty.')
    expect(describedText(/column 2/)).toBe('Not in the form. If ignored, this column is not saved.')
  })

  it('counts columns with answers that match no option, live', () => {
    renderCard({
      columns: columns.slice(0, 1),
      mapping: { column_0001: 'consent' },
      columnValues: new Map([['column_0001', ['Yes', 'Maybe']]]),
      selectedForm: {
        fields: [
          {
            code: 'consent',
            label: 'Consent',
            dataType: 'BOOLEAN',
            allowedValues: null,
            valueAliases: null,
          },
        ],
      },
    })
    expect(screen.getByText('1 column has answers that match no option.')).toBeTruthy()
  })
})
