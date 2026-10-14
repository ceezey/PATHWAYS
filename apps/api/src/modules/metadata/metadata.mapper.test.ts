import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { type FormFieldContractRow, formFieldContract, jsonStringArray } from './metadata.mapper'

const row = (patch: Partial<FormFieldContractRow> = {}): FormFieldContractRow => ({
  code: 'score',
  label: 'Score',
  dataType: 'DECIMAL',
  isRequired: true,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  ...patch,
})

describe('form field contract mapping', () => {
  it('maps decimals to strings, dates to calendar days and keeps null limits', () => {
    expect(
      formFieldContract(
        row({
          minimumValue: new Prisma.Decimal('-1.50'),
          maximumValue: new Prisma.Decimal('100'),
          minimumDate: new Date('2026-01-31T00:00:00.000Z'),
          maximumDate: new Date('2026-12-31T23:59:59.000Z'),
          minimumLength: 0,
          maximumLength: 40,
        }),
      ),
    ).toEqual({
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      required: true,
      allowedValues: null,
      minimumValue: '-1.5',
      maximumValue: '100',
      minimumDate: '2026-01-31',
      maximumDate: '2026-12-31',
      minimumLength: 0,
      maximumLength: 40,
    })
    expect(formFieldContract(row())).toEqual({
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      required: true,
      allowedValues: null,
      minimumValue: undefined,
      maximumValue: undefined,
      minimumDate: undefined,
      maximumDate: undefined,
      minimumLength: null,
      maximumLength: null,
    })
  })

  it('keeps only an array of strings as allowed values', () => {
    expect(jsonStringArray(['Yes', 'No'])).toEqual(['Yes', 'No'])
    expect(jsonStringArray([])).toEqual([])
    expect(jsonStringArray(['Yes', 1])).toBeNull()
    expect(jsonStringArray({ value: 'Yes' })).toBeNull()
    expect(jsonStringArray('Yes')).toBeNull()
    expect(jsonStringArray(null)).toBeNull()
    expect(
      formFieldContract(row({ dataType: 'SELECT', allowedValues: ['A'] })).allowedValues,
    ).toEqual(['A'])
  })
})
