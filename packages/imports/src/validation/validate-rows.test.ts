import { describe, expect, it } from 'vitest'

import type { IntakeField } from '../intake-rules'
import {
  type ColumnMapping,
  DEFERRED_REGISTRATION_FIELDS,
  deferredRequired,
  unsuppliedRequired,
  validateRows,
} from './validate-rows'

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

describe('a registration row with no enrollment date', () => {
  const enrollment: IntakeField = {
    code: 'enrollment_date',
    label: 'Enrollment date',
    dataType: 'DATE',
    required: true,
  }
  const calculatedAge: IntakeField = {
    ...age,
    rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
  }
  const birth: IntakeField = {
    code: 'birth_date',
    label: 'Birth',
    dataType: 'DATE',
    required: true,
  }
  const fields = [text('first_name', true), birth, enrollment, calculatedAge]
  const raws = [
    { first_name: 'Ana', birth_date: '1990-01-01', enrollment_date: '2026-01-15' },
    { first_name: 'Ben', birth_date: '1990-01-01', enrollment_date: '' },
  ]

  it('validates with a null enrollment date and no age', () => {
    const results = run('BENEFICIARY_REGISTRATION', fields, raws)
    expect(results.map((result) => result.valid)).toEqual([true, true])
    expect(results[1].values.enrollment_date).toBeNull()
    expect(results[1].values.age).toBeNull()
    expect(results[0].values.age).toBe(36)
  })

  it('keeps the required error on any other form type', () => {
    const results = run('STAGE_SURVEY', fields, raws)
    expect(results.map((result) => result.valid)).toEqual([true, false])
    expect(codes(results[1])).toEqual(['required'])
  })
})

describe('deferredRequired', () => {
  const fields: IntakeField[] = [
    text('first_name', true),
    { code: 'enrollment_date', label: 'Enrollment', dataType: 'DATE', required: true },
  ]

  it('relaxes only the deferred fields of a registration form', () => {
    expect(DEFERRED_REGISTRATION_FIELDS).toEqual(['enrollment_date'])
    const relaxed = deferredRequired('BENEFICIARY_REGISTRATION', fields)
    expect(relaxed.map((field) => [field.code, field.required])).toEqual([
      ['first_name', true],
      ['enrollment_date', false],
    ])
    expect(fields[1].required).toBe(true)
  })

  it('returns the fields unchanged for any other form type', () => {
    expect(deferredRequired('STAGE_SURVEY', fields)).toBe(fields)
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
