import { describe, expect, it } from 'vitest'

import type { IntakeField } from '../intake-rules'
import { type ColumnMapping, unsuppliedRequired, validateRows } from './validate-rows'

const text = (code: string, required = false): IntakeField => ({
  code,
  label: code,
  dataType: 'TEXT',
  required,
})
const age: IntakeField = { code: 'age', label: 'Age', dataType: 'INTEGER', required: false }

// One mapped column per field, keyed by the field code.
const mapped = (fields: IntakeField[]): ColumnMapping[] =>
  fields.map((field) => ({
    sourceFieldName: field.code,
    status: 'MAPPED',
    dataType: null,
    valueMap: null,
    dateOrder: null,
    targetField: { code: field.code, dataType: field.dataType },
  }))

const run = (
  formType: string,
  fields: IntakeField[],
  raws: Record<string, unknown>[],
  metadataKeys: string[] = [],
) =>
  validateRows({
    formType,
    fields,
    mappedFields: fields.map((field) => ({
      ...field,
      metadataKey: metadataKeys.includes(field.code),
    })),
    mappings: mapped(fields),
    raws,
    uploadDate: '2026-10-28',
  })

const codes = (result: { errors: { code: string }[] }) => result.errors.map((error) => error.code)

describe('validateRows', () => {
  it('marks every row sharing a client identifier', () => {
    const fields = [text('external_identifier_value'), age]
    const results = run('BENEFICIARY_REGISTRATION', fields, [
      { external_identifier_value: ' S-1 ', age: '20' },
      { external_identifier_value: 'S-1', age: 'abc' },
      { external_identifier_value: 'S-2', age: '20' },
    ])
    expect(codes(results[0])).toEqual(['IDENTITY_CONFLICT'])
    expect(codes(results[1])).toEqual(['AMBIGUOUS_INTEGER', 'IDENTITY_CONFLICT'])
    expect(results.map((result) => result.valid)).toEqual([false, false, true])
    expect(
      run('ACTIVITY', fields, [
        { external_identifier_value: 'S-1', age: '20' },
        { external_identifier_value: 'S-1', age: '20' },
      ]).every((result) => result.valid),
    ).toBe(true)
  })

  it('marks a duplicated metadata key on valid rows only', () => {
    const results = run(
      'ACTIVITY',
      [text('code'), age],
      [
        { code: 'K1', age: '20' },
        { code: 'K1', age: '21' },
        { code: 'K1', age: 'abc' },
        { code: 'K2', age: '20' },
      ],
      ['code'],
    )
    expect(results.map(codes)).toEqual([
      ['DUPLICATE_BUSINESS_KEY'],
      ['DUPLICATE_BUSINESS_KEY'],
      ['AMBIGUOUS_INTEGER'],
      [],
    ])
    expect(results[0].errors[0]).toEqual({
      fieldCode: 'code',
      code: 'DUPLICATE_BUSINESS_KEY',
      message: 'The metadata key is duplicated within this import.',
    })
  })

  it('uses the one fitting date order for a text date column', () => {
    const birth: IntakeField = {
      code: 'birth_date',
      label: 'Birth',
      dataType: 'DATE',
      required: true,
    }
    const results = run(
      'ACTIVITY',
      [birth],
      [{ birth_date: '17/08/2008' }, { birth_date: '05/04/2009' }],
    )
    expect(results.map((result) => result.values.birth_date)).toEqual(['2008-08-17', '2009-04-05'])
    expect(results.every((result) => result.valid)).toBe(true)
  })
})

describe('unsuppliedRequired', () => {
  it('unsuppliedRequired skips defaulted and calculated fields', () => {
    const fields: IntakeField[] = [
      text('mapped', true),
      text('missing', true),
      text('optional'),
      { ...text('defaulted', true), importDefault: 'Yes' },
      {
        ...age,
        required: true,
        rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'joined_on' },
      },
    ]
    expect(unsuppliedRequired(fields, new Set(['mapped'])).map((field) => field.code)).toEqual([
      'missing',
    ])
  })
})
