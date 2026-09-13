import { describe, expect, it } from 'vitest'

import { type FormFieldValidationContract, validateAndNormalizeFormData } from './form-data'

const fields: FormFieldValidationContract[] = [
  { code: 'short_text', label: 'Short text', dataType: 'TEXT', required: true, maximumLength: 8 },
  { code: 'long_text', label: 'Long text', dataType: 'LONG_TEXT', required: false },
  { code: 'count', label: 'Count', dataType: 'INTEGER', required: true, minimumValue: 0 },
  {
    code: 'score',
    label: 'Score',
    dataType: 'DECIMAL',
    required: true,
    minimumValue: '0',
    maximumValue: '100.0000',
  },
  {
    code: 'day',
    label: 'Day',
    dataType: 'DATE',
    required: true,
    minimumDate: '2020-01-01',
    maximumDate: '2030-12-31',
  },
  { code: 'confirmed', label: 'Confirmed', dataType: 'BOOLEAN', required: true },
  {
    code: 'choice',
    label: 'Choice',
    dataType: 'SELECT',
    required: true,
    allowedValues: ['A', 'B'],
  },
  {
    code: 'choices',
    label: 'Choices',
    dataType: 'MULTIPLE_SELECT',
    required: false,
    allowedValues: ['A', 'B'],
  },
]

describe('versioned form data validation contract', () => {
  it('normalizes every supported type while preserving false and zero', () => {
    const result = validateAndNormalizeFormData(fields, {
      short_text: '  text  ',
      long_text: null,
      count: 0,
      score: '0.5000',
      day: '2024-02-29',
      confirmed: false,
      choice: 'A',
      choices: ['B', 'A'],
    })
    expect(result).toEqual({
      valid: true,
      errors: [],
      values: {
        short_text: 'text',
        long_text: null,
        count: 0,
        score: '0.5',
        day: '2024-02-29',
        confirmed: false,
        choice: 'A',
        choices: ['B', 'A'],
      },
    })
  })

  it('allows missing required values only in draft mode and treats null as empty', () => {
    expect(validateAndNormalizeFormData(fields, {}, 'draft')).toMatchObject({ valid: true })
    const final = validateAndNormalizeFormData(fields, { confirmed: null })
    expect(final.valid).toBe(false)
    expect(final.errors.filter((item) => item.code === 'required')).toHaveLength(6)
  })

  it('rejects unknown and prototype-oriented keys', () => {
    const payload = JSON.parse('{"short_text":"ok","__proto__":{"admin":true}}')
    const result = validateAndNormalizeFormData(fields, payload, 'draft')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ fieldCode: '__proto__', code: 'unknown_field' }),
    )
  })

  it('enforces allowed values, duplicate multi-select entries, and text limits', () => {
    const result = validateAndNormalizeFormData(
      fields,
      { short_text: 'too long!', choice: 'C', choices: ['A', 'A'] },
      'draft',
    )
    expect(result.errors.map((item) => item.code)).toEqual([
      'too_long',
      'invalid_value',
      'invalid_value',
    ])
  })

  it('enforces exact decimal precision/range and real bounded calendar dates', () => {
    const decimal = validateAndNormalizeFormData(fields, { score: '100.00001' }, 'draft')
    const range = validateAndNormalizeFormData(fields, { score: '100.0001' }, 'draft')
    const date = validateAndNormalizeFormData(fields, { day: '2023-02-29' }, 'draft')
    const dateRange = validateAndNormalizeFormData(fields, { day: '2031-01-01' }, 'draft')
    expect(decimal.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value' }))
    expect(range.errors).toContainEqual(expect.objectContaining({ code: 'above_maximum' }))
    expect(date.errors).toContainEqual(expect.objectContaining({ code: 'invalid_value' }))
    expect(dateRange.errors).toContainEqual(expect.objectContaining({ code: 'above_maximum' }))
  })

  it('rejects unsafe or nonsensical field configuration without executing it', () => {
    const result = validateAndNormalizeFormData(
      [
        {
          code: 'constructor',
          label: 'Unsafe',
          dataType: 'TEXT',
          required: false,
          allowedValues: ['not executable'],
        },
      ],
      {},
      'draft',
    )
    expect(result.valid).toBe(false)
    expect(result.errors.every((item) => item.code === 'invalid_definition')).toBe(true)
  })
})
