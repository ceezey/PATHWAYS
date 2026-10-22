/* @vitest-environment jsdom */
import { CONSENT_FIELD_CODES } from '@pathways/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormField } from '../../collection.utils'
import { emptyIntake } from '../digital-form-contract'
import { FieldIntakeEditor } from './field-intake-editor'

afterEach(cleanup)

const field = (patch: Partial<FormField> = {}): FormField => ({
  id: 'f1',
  label: 'Sex',
  code: 'sex',
  type: 'single_select',
  required: true,
  metadataKey: false,
  sadddField: true,
  allowedValues: ['Male', 'Female'],
  minimumValue: '',
  maximumValue: '',
  minimumLength: '',
  maximumLength: '',
  mappingStatus: 'mapped',
  ...emptyIntake,
  ...patch,
})
const codes = ['sex', 'birth_date', 'enrollment_date', 'consent_recorded']
const renderEditor = (f: FormField, onChange = vi.fn(), readOnly = false) =>
  render(<FieldIntakeEditor field={f} fieldCodes={codes} onChange={onChange} readOnly={readOnly} />)
const optionValues = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.getAttribute('value'))
const kindOptions = () => optionValues(screen.getByLabelText('Calculation or check'))

describe('FieldIntakeEditor', () => {
  it('renders source names and aliases from the form', () => {
    renderEditor(field({ sourceNames: ['Gender'], valueAliases: [{ from: 'M', to: 'Male' }] }))
    expect(screen.getByText('Gender')).toBeTruthy()
    expect((screen.getByLabelText('Source value 1') as HTMLInputElement).value).toBe('M')
    expect((screen.getByLabelText('Stored value 1') as HTMLSelectElement).value).toBe('Male')
  })

  it('adds and removes source names, adds an alias and sets an import default', () => {
    const onChange = vi.fn()
    renderEditor(field({ sourceNames: ['Gender'] }), onChange)
    fireEvent.change(screen.getByLabelText('New source name'), {
      target: { value: ' Sex at birth ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add source name' }))
    expect(onChange).toHaveBeenLastCalledWith({ sourceNames: ['Gender', 'Sex at birth'] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove source name Gender' }))
    expect(onChange).toHaveBeenLastCalledWith({ sourceNames: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Add alias' }))
    expect(onChange).toHaveBeenLastCalledWith({ valueAliases: [{ from: '', to: '' }] })
    fireEvent.change(screen.getByLabelText('Import default'), { target: { value: 'Female' } })
    expect(onChange).toHaveBeenLastCalledWith({ importDefault: 'Female' })
  })

  it('does not offer aliases on a field that is not a choice', () => {
    renderEditor(field({ type: 'text', allowedValues: [] }))
    expect(screen.queryByRole('button', { name: 'Add alias' })).toBeNull()
  })

  it('SAME_ANSWER_AS is offered only on consent_recorded', () => {
    renderEditor(field({ code: 'consent_recorded', type: 'boolean' }))
    expect(kindOptions()).toContain('SAME_ANSWER_AS')
    cleanup()
    for (const code of ['data_processing_consent_recorded', 'guardian_consent_recorded', 'sex']) {
      renderEditor(field({ code, type: 'boolean' }))
      expect(kindOptions()).not.toContain('SAME_ANSWER_AS')
      cleanup()
    }
  })

  it('sets SAME_ANSWER_AS to the data processing consent', () => {
    const onChange = vi.fn()
    renderEditor(field({ code: 'consent_recorded', type: 'boolean' }), onChange)
    fireEvent.change(screen.getByLabelText('Calculation or check'), {
      target: { value: 'SAME_ANSWER_AS' },
    })
    expect(onChange).toHaveBeenCalledWith({
      rule: { kind: 'SAME_ANSWER_AS', field: 'data_processing_consent_recorded' },
    })
  })

  it('importDefault control is absent on consent fields', () => {
    for (const code of CONSENT_FIELD_CODES) {
      renderEditor(field({ code, type: 'boolean' }))
      expect(screen.queryByLabelText('Import default')).toBeNull()
      cleanup()
    }
    renderEditor(field())
    expect(screen.getByLabelText('Import default')).toBeTruthy()
  })

  it('hides the import default when the field is calculated', () => {
    renderEditor(
      field({
        code: 'is_minor',
        type: 'boolean',
        rule: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
      }),
    )
    expect(screen.queryByLabelText('Import default')).toBeNull()
  })

  it('picks rule fields from the form own field codes', () => {
    const onChange = vi.fn()
    renderEditor(
      field({
        code: 'age_at_registration',
        type: 'integer',
        allowedValues: [],
        rule: { kind: 'AGE_AT_DATE', birthField: '', atField: '' },
      }),
      onChange,
    )
    const birth = screen.getByLabelText('Birth date field')
    expect(optionValues(birth)).toEqual(['', ...codes])
    fireEvent.change(birth, { target: { value: 'birth_date' } })
    expect(onChange).toHaveBeenCalledWith({
      rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: '' },
    })
  })

  it('asks for exactly six question fields for the Washington Group rule', () => {
    renderEditor(
      field({
        code: 'disability_status',
        rule: {
          kind: 'WASHINGTON_GROUP_DISABILITY',
          questionFields: ['', '', '', '', '', ''],
          disabilityValues: [],
        },
      }),
    )
    expect(screen.getAllByLabelText(/^Question field \d$/)).toHaveLength(6)
  })

  it('starts a new rule with empty choices when the kind changes', () => {
    const onChange = vi.fn()
    renderEditor(field({ code: 'disability_status' }), onChange)
    fireEvent.change(screen.getByLabelText('Calculation or check'), {
      target: { value: 'WASHINGTON_GROUP_DISABILITY' },
    })
    expect(onChange).toHaveBeenCalledWith({
      rule: {
        kind: 'WASHINGTON_GROUP_DISABILITY',
        questionFields: ['', '', '', '', '', ''],
        disabilityValues: [],
      },
    })
    fireEvent.change(screen.getByLabelText('Calculation or check'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ rule: null })
  })

  it('locks every control when read only', () => {
    renderEditor(
      field({ sourceNames: ['Gender'], valueAliases: [{ from: 'M', to: 'Male' }] }),
      vi.fn(),
      true,
    )
    const controls = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('combobox'),
    ]
    expect(controls.length).toBeGreaterThan(5)
    for (const control of controls) expect((control as HTMLButtonElement).disabled).toBe(true)
  })
})
