import type { FormFieldValidationContract } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import type { IntakeField } from './intake-rules'
import { normalizeImportedRow } from './normalization'
import { buildImportValueMap, compatibleImportDataTypes } from './value-map'

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
      warnings: [],
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

  it('reads a whole-number cell in a text field as its digits', () => {
    const phone: FormFieldValidationContract = {
      code: 'contact_number',
      label: 'Contact Number',
      dataType: 'TEXT',
      required: false,
    }
    const result = normalizeImportedRow([phone], { contact_number: 9171234567 })
    expect(result.values.contact_number).toBe('9171234567')
    expect(result.valid).toBe(true)
  })

  it('reports ambiguous coercions instead of guessing spreadsheet conventions', () => {
    const result = normalizeImportedRow(fields, {
      text: 12.5,
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

  // QAD-T54
  describe('value map and declared type', () => {
    const sex: FormFieldValidationContract = {
      code: 'sex',
      label: 'Sex',
      dataType: 'SELECT',
      required: true,
      allowedValues: ['Male', 'Female'],
    }
    const map = buildImportValueMap([
      { from: 'M', to: 'Male' },
      { from: 'F', to: 'Female' },
    ])

    it('translates source codes to canonical values, ignoring case and spaces', () => {
      const rules = { sex: { valueMap: map } }
      expect(normalizeImportedRow([sex], { sex: ' m ' }, rules).values.sex).toBe('Male')
      expect(normalizeImportedRow([sex], { sex: 'F' }, rules).values.sex).toBe('Female')
    })

    it('keeps an untranslated value invalid with a reason instead of dropping it', () => {
      const result = normalizeImportedRow([sex], { sex: 'X' }, { sex: { valueMap: map } })
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([
        expect.objectContaining({ fieldCode: 'sex', code: 'invalid_value' }),
      ])
    })

    it('fails a value that does not fit the declared data type', () => {
      const count: FormFieldValidationContract = {
        code: 'count',
        label: 'Count',
        dataType: 'DECIMAL',
        required: true,
      }
      const rules = { count: { dataType: 'INTEGER' as const } }
      expect(normalizeImportedRow([count], { count: '4' }, rules).valid).toBe(true)
      const bad = normalizeImportedRow([count], { count: '4.5' }, rules)
      expect(bad.valid).toBe(false)
      expect(bad.errors[0]).toMatchObject({ fieldCode: 'count', code: 'AMBIGUOUS_INTEGER' })
    })

    it('does not execute or special-case prototype and formula-like source keys', () => {
      const result = normalizeImportedRow(
        [sex],
        { sex: '=cmd|calc' },
        { sex: { valueMap: buildImportValueMap([{ from: '__proto__', to: 'Male' }]) } },
      )
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([expect.objectContaining({ fieldCode: 'sex' })])
    })

    it('rejects oversized and duplicate maps', () => {
      const many = Array.from({ length: 51 }, (_, index) => ({ from: `k${index}`, to: 'Male' }))
      expect(() => buildImportValueMap(many)).toThrow('VALUE_MAP_TOO_LARGE')
      expect(() =>
        buildImportValueMap([
          { from: 'M', to: 'Male' },
          { from: ' m', to: 'Female' },
        ]),
      ).toThrow('VALUE_MAP_INVALID')
    })

    it('offers only data types that fit the target field', () => {
      expect(compatibleImportDataTypes('DECIMAL')).toEqual(['INTEGER', 'DECIMAL'])
      expect(compatibleImportDataTypes('DATE')).toEqual(['DATE'])
    })
  })

  describe('intake metadata', () => {
    const intake = (extra: Partial<IntakeField> & Pick<IntakeField, 'code' | 'dataType'>) =>
      ({ label: extra.code, required: false, ...extra }) as IntakeField
    const options = { uploadDate: '2026-10-22' }
    const sex = intake({
      code: 'sex',
      dataType: 'SELECT',
      required: true,
      allowedValues: ['MALE', 'FEMALE'],
      valueAliases: [{ from: 'A. Babae', to: 'FEMALE' }],
    })
    const ageFields = (extra: Partial<IntakeField> = {}) => [
      intake({ code: 'birth_date', dataType: 'DATE' }),
      intake({ code: 'enrollment_date', dataType: 'DATE' }),
      intake({
        code: 'age_at_registration',
        dataType: 'INTEGER',
        rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
        ...extra,
      }),
    ]
    const dates = { birth_date: '2008-08-17', enrollment_date: '2026-05-28' }
    // Under 18 on the upload date 2026-10-22, unlike the birth date above.
    const minorDates = { birth_date: '2008-11-01', enrollment_date: '2026-05-28' }

    it('holds a row whose birth date is after the enrollment date instead of a negative age', () => {
      const options = { uploadDate: '2026-10-22' }
      const result = normalizeImportedRow(
        ageFields(),
        { birth_date: '2028-01-01', enrollment_date: '2026-05-28' },
        {},
        options,
      )
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([
        expect.objectContaining({ fieldCode: 'birth_date', code: 'BIRTH_AFTER_DATE' }),
      ])
      expect(result.values.age_at_registration).toBeNull()
    })

    it('"A. Babae" with an alias resolves to FEMALE', () => {
      expect(normalizeImportedRow([sex], { sex: 'A. Babae' })).toMatchObject({
        valid: true,
        values: { sex: 'FEMALE' },
      })
    })

    it('boolean true into a SELECT with alias true to YES gives YES', () => {
      const yesNo = intake({
        code: 'works',
        dataType: 'SELECT',
        allowedValues: ['YES', 'NO'],
        valueAliases: [{ from: 'true', to: 'YES' }],
      })
      expect(normalizeImportedRow([yesNo], { works: true }).values.works).toBe('YES')
      expect(normalizeImportedRow([yesNo], { works: false }).errors).toEqual([
        expect.objectContaining({ fieldCode: 'works', code: 'invalid_value' }),
      ])
    })

    it('resolves each multiple-select element and leaves unresolved ones unchanged', () => {
      const multi = intake({
        code: 'multi',
        dataType: 'MULTIPLE_SELECT',
        allowedValues: ['Alpha', 'Beta'],
      })
      expect(
        normalizeImportedRow([multi], { multi: '["A. Alpha","b) Beta"]' }).values.multi,
      ).toEqual(['Alpha', 'Beta'])
      const result = normalizeImportedRow([multi], { multi: '["A. Alpha","Zeta"]' })
      expect(result.errors).toEqual([expect.objectContaining({ code: 'invalid_value' })])
    })

    it('importDefault CREATE fills registration_operation', () => {
      const operation = intake({
        code: 'registration_operation',
        dataType: 'SELECT',
        required: true,
        allowedValues: ['CREATE', 'UPDATE'],
        importDefault: 'CREATE',
      })
      expect(normalizeImportedRow([operation], {})).toMatchObject({
        valid: true,
        values: { registration_operation: 'CREATE' },
      })
      expect(
        normalizeImportedRow([operation], { registration_operation: 'UPDATE' }).values,
      ).toEqual({ registration_operation: 'UPDATE' })
    })

    it('a mapped blank cell does not take the importDefault', () => {
      const operation = intake({
        code: 'registration_operation',
        dataType: 'SELECT',
        required: true,
        allowedValues: ['CREATE', 'UPDATE'],
        importDefault: 'CREATE',
      })
      const result = normalizeImportedRow([operation], { registration_operation: '' })
      expect(result.valid).toBe(false)
      expect(result.values.registration_operation).toBeNull()
      expect(normalizeImportedRow([operation], { registration_operation: undefined }).valid).toBe(
        false,
      )
    })

    it('a MULTIPLE_SELECT importDefault fills a one-element array', () => {
      const multi = intake({
        code: 'multi',
        dataType: 'MULTIPLE_SELECT',
        required: true,
        allowedValues: ['Alpha', 'Beta'],
        importDefault: 'Alpha',
      })
      expect(normalizeImportedRow([multi], {})).toMatchObject({
        valid: true,
        values: { multi: ['Alpha'] },
      })
      expect(normalizeImportedRow([multi], { multi: '["Beta"]' }).values.multi).toEqual(['Beta'])
    })

    it('resolves identically across repeated rows with the cached resolver', () => {
      const select = intake({ code: 'pick', dataType: 'SELECT', allowedValues: ['Alpha'] })
      const first = normalizeImportedRow([select], { pick: 'a. alpha' })
      const second = normalizeImportedRow([select], { pick: 'A. Alpha' })
      expect([first.values.pick, second.values.pick]).toEqual(['Alpha', 'Alpha'])
    })

    it('a provided consent answer survives SAME_ANSWER_AS and the row stays false', () => {
      const list = [
        intake({
          code: 'consent_recorded',
          dataType: 'BOOLEAN',
          rule: { kind: 'SAME_ANSWER_AS', field: 'data_processing_consent_recorded' },
        }),
        intake({ code: 'data_processing_consent_recorded', dataType: 'BOOLEAN' }),
      ]
      const result = normalizeImportedRow(
        list,
        { consent_recorded: 'false', data_processing_consent_recorded: 'true' },
        {},
        options,
      )
      expect(result.values.consent_recorded).toBe(false)
      expect(result.warnings).toEqual([])
    })

    it('a calculated is_minor satisfies a required field', () => {
      const list = [
        intake({ code: 'birth_date', dataType: 'DATE', required: true }),
        intake({ code: 'enrollment_date', dataType: 'DATE', required: true }),
        intake({
          code: 'is_minor',
          dataType: 'BOOLEAN',
          required: true,
          rule: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
        }),
      ]
      expect(normalizeImportedRow(list, minorDates, {}, options)).toMatchObject({
        valid: true,
        values: { is_minor: true },
      })
      expect(normalizeImportedRow(list, dates, {}, options)).toMatchObject({
        valid: true,
        values: { is_minor: false },
      })
      expect(normalizeImportedRow(list, dates).valid).toBe(false)
    })

    it('a blank SAME_ANSWER_AS source stays null so the required consent field fails', () => {
      const list = [
        intake({ code: 'consent_recorded', dataType: 'BOOLEAN' }),
        intake({
          code: 'data_processing_consent_recorded',
          dataType: 'BOOLEAN',
          required: true,
          rule: { kind: 'SAME_ANSWER_AS', field: 'consent_recorded' },
        }),
      ]
      const result = normalizeImportedRow(list, {}, {}, options)
      expect(result.valid).toBe(false)
      expect(result.values.data_processing_consent_recorded).toBeNull()
    })

    it('warns on a mapped source that disagrees with the calculation, not on an absent one', () => {
      expect(normalizeImportedRow(ageFields(), dates, {}, options).warnings).toEqual([])
      expect(
        normalizeImportedRow(ageFields(), { ...dates, age_at_registration: 30 }, {}, options)
          .warnings,
      ).toEqual([{ fieldCode: 'age_at_registration', code: 'CALCULATION_MISMATCH' }])
    })

    it('a SADDD calculation mismatch makes the row invalid', () => {
      const result = normalizeImportedRow(
        ageFields({ sadddField: true }),
        { ...dates, age_at_registration: 30 },
        {},
        options,
      )
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([
        expect.objectContaining({ fieldCode: 'age_at_registration', code: 'CALCULATION_MISMATCH' }),
      ])
    })

    it('ISO text date passes and 8/17/2008 is INVALID AMBIGUOUS_DATE', () => {
      const birth = intake({ code: 'birth_date', dataType: 'DATE', required: true })
      expect(normalizeImportedRow([birth], { birth_date: '2008-08-17' }).valid).toBe(true)
      const result = normalizeImportedRow([birth], { birth_date: '8/17/2008' })
      expect(result.valid).toBe(false)
      expect(result.errors).toEqual([expect.objectContaining({ code: 'AMBIGUOUS_DATE' })])
    })

    it('reads a text date by the column date rule', () => {
      const birth = intake({ code: 'birth_date', dataType: 'DATE', required: true })
      const result = normalizeImportedRow(
        [birth],
        { birth_date: '8/17/2008' },
        { birth_date: { date: { order: 'MDY', referenceYear: 2026 } } },
      )
      expect(result.values.birth_date).toBe('2008-08-17')
      expect(result.valid).toBe(true)
    })

    it('returns warnings without making the row invalid', () => {
      const list = [
        ...ageFields(),
        intake({
          code: 'is_minor',
          dataType: 'BOOLEAN',
          rule: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
        }),
        intake({ code: 'guardian_consent_recorded', dataType: 'BOOLEAN' }),
      ]
      const result = normalizeImportedRow(list, minorDates, {}, options)
      expect(result.valid).toBe(true)
      expect(result.warnings).toEqual([
        { fieldCode: 'guardian_consent_recorded', code: 'GUARDIAN_CONSENT_MISSING' },
      ])
    })

    it('the existing call shape without options returns warnings []', () => {
      expect(normalizeImportedRow([sex], { sex: 'MALE' })).toEqual({
        valid: true,
        values: { sex: 'MALE' },
        errors: [],
        warnings: [],
      })
    })
  })
})
