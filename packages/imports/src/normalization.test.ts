import type { FormFieldValidationContract } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { normalizeImportedRow } from './normalization'

const fields: FormFieldValidationContract[] = [
  { code: 'text', label: 'Text', dataType: 'TEXT', required: true, maximumLength: 8 },
  { code: 'long', label: 'Long', dataType: 'LONG_TEXT', required: false },
  { code: 'integer', label: 'Integer', dataType: 'INTEGER', required: true, minimumValue: 0 },
  {
    code: 'decimal',
    label: 'Decimal',
    dataType: 'DECIMAL',
    required: true,
    minimumValue: '0',
    maximumValue: '10.0000',
  },
  {
    code: 'date',
    label: 'Date',
    dataType: 'DATE',
    required: true,
    minimumDate: '2020-01-01',
    maximumDate: '2030-12-31',
  },
  { code: 'boolean', label: 'Boolean', dataType: 'BOOLEAN', required: true },
  {
    code: 'select',
    label: 'Select',
    dataType: 'SELECT',
    required: true,
    allowedValues: ['A', 'B'],
  },
  {
    code: 'multi',
    label: 'Multi',
    dataType: 'MULTIPLE_SELECT',
    required: false,
    allowedValues: ['A', 'B'],
  },
]

describe('import normalization contract', () => {
  it('uses the P02 validator for every supported type and preserves false, zero, and null', () => {
    expect(
      normalizeImportedRow(fields, {
        text: '  hello ',
        long: '',
        integer: '0',
        decimal: '0.5000',
        date: '2024-02-29',
        boolean: 'false',
        select: 'A',
        multi: '["B","A"]',
      }),
    ).toEqual({
      valid: true,
      errors: [],
      values: {
        text: 'hello',
        long: null,
        integer: 0,
        decimal: '0.5',
        date: '2024-02-29',
        boolean: false,
        select: 'A',
        multi: ['B', 'A'],
      },
    })
  })

  it('reports ambiguous coercions instead of guessing spreadsheet conventions', () => {
    const result = normalizeImportedRow(fields, {
      text: 12,
      integer: '01',
      decimal: '1e2',
      date: '09/13/2026',
      boolean: 'yes',
      select: 'C',
      multi: 'A,B',
    })

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toEqual([
      'AMBIGUOUS_TEXT',
      'AMBIGUOUS_INTEGER',
      'AMBIGUOUS_DECIMAL',
      'AMBIGUOUS_DATE',
      'AMBIGUOUS_BOOLEAN',
      'AMBIGUOUS_MULTI_SELECT',
    ])
  })

  it('enforces decimal/date boundaries and precise allowed-value errors', () => {
    const result = normalizeImportedRow(fields, {
      text: 'ok',
      integer: 0,
      decimal: '10.0001',
      date: '2031-01-01',
      boolean: false,
      select: 'C',
      multi: '["A","A"]',
    })

    expect(result.errors).toEqual([
      expect.objectContaining({ fieldCode: 'decimal', code: 'above_maximum' }),
      expect.objectContaining({ fieldCode: 'date', code: 'above_maximum' }),
      expect.objectContaining({ fieldCode: 'select', code: 'invalid_value' }),
      expect.objectContaining({ fieldCode: 'multi', code: 'invalid_value' }),
    ])
  })

  it('rejects malicious field configuration without executing code, SQL, formulas, or regex', () => {
    const result = normalizeImportedRow(
      [
        {
          code: 'constructor',
          label: 'Unsafe',
          dataType: 'TEXT',
          required: false,
        },
      ],
      { constructor: 'SELECT pg_sleep(10)' },
    )

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'invalid_definition' }))
  })
})
