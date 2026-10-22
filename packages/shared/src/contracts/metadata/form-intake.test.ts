import { describe, expect, it } from 'vitest'

import {
  CALCULATED_RULE_KINDS,
  CONSENT_FIELD_CODES,
  INTAKE_RULE_KINDS,
  formIntakeDefinitionErrors,
} from './form-intake'
import { type FormFieldRequest, formFieldRequest } from './form-requests'

const base = { required: false, metadataKey: false, sadddField: false }
const text = (code: string, extra: object = {}) =>
  formFieldRequest.parse({ code, label: code, dataType: 'TEXT', ...base, ...extra })
const select = (code: string, extra: object = {}) =>
  formFieldRequest.parse({
    code,
    label: code,
    dataType: 'SELECT',
    allowedValues: ['FEMALE', 'MALE'],
    ...base,
    ...extra,
  })
const errorCodes = (fields: FormFieldRequest[]) =>
  formIntakeDefinitionErrors(fields).map((error) => error.fieldCode)

describe('form field intake metadata', () => {
  it('lists the rule kinds, calculated kinds and consent fields', () => {
    expect(INTAKE_RULE_KINDS).toHaveLength(7)
    expect(CALCULATED_RULE_KINDS).toEqual(INTAKE_RULE_KINDS.slice(0, 4))
    expect(CONSENT_FIELD_CODES).toHaveLength(3)
  })

  it('accepts the four properties on a field request', () => {
    const parsed = select('sex', {
      sourceNames: ['Gender - YEE'],
      valueAliases: [{ from: 'A. Babae', to: 'FEMALE' }],
      importDefault: null,
      rule: null,
    })
    expect(parsed.sourceNames).toEqual(['Gender - YEE'])
    expect(parsed.valueAliases).toEqual([{ from: 'A. Babae', to: 'FEMALE' }])
  })

  it('rejects 21 source names and a 101-entry alias list', () => {
    const names = Array.from({ length: 21 }, (_, index) => `name ${index}`)
    const aliases = Array.from({ length: 101 }, (_, index) => ({ from: `a${index}`, to: 'FEMALE' }))
    expect(formFieldRequest.safeParse({ ...select('sex'), sourceNames: names }).success).toBe(false)
    expect(formFieldRequest.safeParse({ ...select('sex'), valueAliases: aliases }).success).toBe(
      false,
    )
  })

  it('refuses formula-like alias text and malformed rules', () => {
    const alias = { ...select('sex'), valueAliases: [{ from: '=SUM(A1)', to: 'FEMALE' }] }
    expect(formFieldRequest.safeParse(alias).success).toBe(false)
    const rule = {
      ...text('x'),
      rule: { kind: 'WASHINGTON_GROUP_DISABILITY', questionFields: ['a'] },
    }
    expect(formFieldRequest.safeParse(rule).success).toBe(false)
  })

  it('flags importDefault on each consent field', () => {
    const fields = CONSENT_FIELD_CODES.map((code) => text(code, { importDefault: 'YES' }))
    expect(formIntakeDefinitionErrors(fields)).toHaveLength(3)
  })

  it('flags an alias whose to is not an allowed value', () => {
    const field = select('sex', { valueAliases: [{ from: 'A. Babae', to: 'OTHER' }] })
    expect(errorCodes([field])).toEqual(['sex'])
  })

  it('flags aliases on a non-choice field', () => {
    const field = text('name', { valueAliases: [{ from: 'x', to: 'y' }] })
    expect(errorCodes([field])).toEqual(['name'])
  })

  it('flags importDefault that is not an allowed value of a SELECT', () => {
    expect(errorCodes([select('sex', { importDefault: 'OTHER' })])).toEqual(['sex'])
    expect(errorCodes([select('sex', { importDefault: 'FEMALE' })])).toEqual([])
  })

  it('flags a rule that names a missing field', () => {
    const field = text('is_minor', {
      rule: { kind: 'MINOR_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
    })
    expect(errorCodes([field, text('birth_date')])).toEqual(['is_minor'])
    expect(errorCodes([field, text('birth_date'), text('enrollment_date')])).toEqual([])
  })

  it('flags SAME_ANSWER_AS outside the two consent fields', () => {
    const sameAs = (code: string, field: string) =>
      text(code, { rule: { kind: 'SAME_ANSWER_AS', field } })
    expect(errorCodes([sameAs('name', 'consent_recorded'), text('consent_recorded')])).toEqual([
      'name',
    ])
    expect(
      errorCodes([
        sameAs('guardian_consent_recorded', 'consent_recorded'),
        text('consent_recorded'),
      ]),
    ).toEqual(['guardian_consent_recorded'])
  })

  it('accepts consent_recorded SAME_ANSWER_AS data_processing_consent_recorded', () => {
    const fields = [
      text('consent_recorded', {
        rule: { kind: 'SAME_ANSWER_AS', field: 'data_processing_consent_recorded' },
      }),
      text('data_processing_consent_recorded'),
    ]
    expect(formIntakeDefinitionErrors(fields)).toEqual([])
  })

  it('flags a calculated rule on a field that also has importDefault', () => {
    const field = text('age_at_registration', {
      importDefault: '20',
      rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
    })
    expect(errorCodes([field, text('birth_date'), text('enrollment_date')])).toEqual([
      'age_at_registration',
    ])
  })
})
