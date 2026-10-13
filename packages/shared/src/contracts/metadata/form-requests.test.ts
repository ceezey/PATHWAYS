import { describe, expect, it } from 'vitest'

import {
  createFormRequest,
  digitalFormTypes,
  formResponseValues,
  formVersionRequest,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  submitSubmissionRequest,
  updateFormRequest,
  updateSubmissionRequest,
  validateFormValuesRequest,
} from './form-requests'

const field = {
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
}
const form = { code: 'intake', name: 'Intake form', formType: 'TRAINING_SURVEY', fields: [field] }
const uuid = '10000000-0000-4000-8000-000000000001'

describe('form request contracts', () => {
  it('lists the seven form types in their stored order', () => {
    expect(digitalFormTypes).toEqual([
      'BENEFICIARY_REGISTRATION',
      'TRAINING_SURVEY',
      'PRE_TEST',
      'POST_TEST',
      'OUTCOME_MONITORING',
      'ACTIVITY_MONITORING',
      'OTHER',
    ])
  })

  it('trims and lower-cases codes and trims names as the DTO transforms did', () => {
    expect(
      createFormRequest.parse({
        ...form,
        code: ' INTAKE ',
        name: '  Intake form  ',
        fields: [{ ...field, code: ' FIRST_NAME ', label: '  First name  ' }],
      }),
    ).toEqual(form)
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = { description: null, activityId: null, journeyStageId: null }
    const fieldNulls = {
      allowedValues: null,
      minimumValue: null,
      minimumDate: null,
      maximumLength: null,
    }
    expect(
      createFormRequest.parse({ ...form, ...nulls, fields: [{ ...field, ...fieldNulls }] }),
    ).toEqual({ ...form, ...nulls, fields: [{ ...field, ...fieldNulls }] })
    expect(generateFormRequest.parse({ templateKey: null, code: 'ok_code', name: 'Okay' })).toEqual(
      {
        templateKey: null,
        code: 'ok_code',
        name: 'Okay',
      },
    )
  })

  it('requires the version stamp on update only', () => {
    const stamp = { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
    expect(updateFormRequest.safeParse({ ...form, ...stamp }).success).toBe(true)
    expect(updateFormRequest.safeParse(form).success).toBe(false)
    expect(createFormRequest.safeParse({ ...form, ...stamp }).success).toBe(false)
  })

  it('drops method-named value keys and refuses a constructor key at any depth', () => {
    expect(formResponseValues.parse({ first_name: 'Ana', toString: 'x', valueOf: 1 })).toEqual({
      first_name: 'Ana',
    })
    expect(formResponseValues.safeParse({ constructor: 'x' }).success).toBe(false)
    expect(formResponseValues.safeParse({ tags: [{ constructor: 1 }] }).success).toBe(false)
    expect(formResponseValues.safeParse([1]).success).toBe(false)
  })

  it('refuses a null beneficiary and reads page bounds with Number()', () => {
    const save = { clientSubmissionId: uuid, values: {} }
    expect(saveSubmissionRequest.safeParse({ ...save, beneficiaryId: uuid }).success).toBe(true)
    expect(saveSubmissionRequest.safeParse({ ...save, beneficiaryId: null }).success).toBe(false)
    expect(listSubmissionsQuery.parse({})).toEqual({ offset: 0, limit: 10 })
    expect(listSubmissionsQuery.parse({ offset: '2', limit: '0x5' })).toEqual({
      offset: 2,
      limit: 5,
    })
    expect(listSubmissionsQuery.safeParse({ limit: '51' }).success).toBe(false)
  })
})

describe('form definition rules', () => {
  const grin = String.fromCodePoint(0x1f600)
  const accepts = (
    schema: { safeParse: (value: unknown) => { success: boolean } },
    value: unknown,
  ) => schema.safeParse(value).success
  const withForm = (extra: Record<string, unknown>) => ({ ...form, ...extra })
  const withField = (extra: Record<string, unknown>) =>
    withForm({ fields: [{ ...field, ...extra }] })
  const fields = (count: number) => withForm({ fields: Array.from({ length: count }, () => field) })

  it.each([
    ['another form type', withForm({ formType: 'OTHER' }), true],
    ['code of 64', withForm({ code: `a${'b'.repeat(63)}` }), true],
    ['name of three code points', withForm({ name: grin.repeat(3) }), true],
    ['description of 2000', withForm({ description: 'x'.repeat(2000) }), true],
    [
      'uppercase uuid ids',
      withForm({ activityId: uuid, journeyStageId: uuid.toUpperCase() }),
      true,
    ],
    ['100 fields', fields(100), true],
    ['one-character code', withForm({ code: 'a' }), false],
    ['code with a leading digit', withForm({ code: '1intake' }), false],
    ['code of 65', withForm({ code: `a${'b'.repeat(64)}` }), false],
    ['numeric code', withForm({ code: 7 }), false],
    ['name of two characters', withForm({ name: 'ab' }), false],
    ['name of two characters after trim', withForm({ name: '   ab   ' }), false],
    ['name of two code points', withForm({ name: grin.repeat(2) }), false],
    ['name of 161', withForm({ name: 'x'.repeat(161) }), false],
    ['description of 2001', withForm({ description: 'x'.repeat(2001) }), false],
    ['numeric description', withForm({ description: 7 }), false],
    ['unknown form type', withForm({ formType: 'SURVEY' }), false],
    ['activity id not a uuid', withForm({ activityId: 'not-a-uuid' }), false],
    [
      'stage id with version 0',
      withForm({ journeyStageId: '10000000-0000-0000-8000-000000000001' }),
      false,
    ],
    ['unknown key on the form', withForm({ extra: true }), false],
    ['no fields', fields(0), false],
    ['101 fields', fields(101), false],
    ['null field', withForm({ fields: [null] }), false],
    ['string field', withForm({ fields: ['first_name'] }), false],
    ['array entry in the fields', withForm({ fields: [[]] }), false],
    ['object in place of the fields', withForm({ fields: { 0: field } }), false],
    ['no fields key', { code: 'intake', name: 'Intake form', formType: 'OTHER' }, false],
  ])('form: %s is accepted: %s', (_name, body, expected) => {
    expect(accepts(createFormRequest, body)).toBe(expected)
  })

  it.each([
    ['empty allowed value', { allowedValues: [''] }, true],
    ['allowed value of 120', { allowedValues: ['x'.repeat(120)] }, true],
    ['decimal bounds', { minimumValue: '-12.5', maximumValue: '1000.1234' }, true],
    ['impossible calendar day', { minimumDate: '2026-02-30', maximumDate: '2026-12-31' }, true],
    ['length bounds', { minimumLength: 0, maximumLength: 10000 }, true],
    ['null minimum length', { minimumLength: null }, true],
    ['empty code', { code: '' }, false],
    ['code with a space', { code: 'First Name' }, false],
    ['code of 65', { code: `a${'b'.repeat(64)}` }, false],
    ['blank label', { label: '   ' }, false],
    ['label of 161', { label: 'x'.repeat(161) }, false],
    ['unknown data type', { dataType: 'JSON' }, false],
    ['required as string', { required: 'true' }, false],
    ['metadataKey as number', { metadataKey: 1 }, false],
    ['sadddField null', { sadddField: null }, false],
    ['no allowed values', { allowedValues: [] }, false],
    [
      '101 allowed values',
      { allowedValues: Array.from({ length: 101 }, (_, i) => `v${i}`) },
      false,
    ],
    ['allowed value of 121', { allowedValues: ['x'.repeat(121)] }, false],
    ['numeric allowed value', { allowedValues: [1] }, false],
    ['string allowed values', { allowedValues: 'Yes' }, false],
    ['five decimals', { minimumValue: '1.23456' }, false],
    ['leading zero', { minimumValue: '01' }, false],
    ['numeric bound', { minimumValue: 5 }, false],
    ['exponent bound', { maximumValue: '1e3' }, false],
    ['unpadded date', { minimumDate: '2026-1-1' }, false],
    ['date with time', { maximumDate: '2026-01-01T00:00:00Z' }, false],
    ['minimum length -1', { minimumLength: -1 }, false],
    ['fractional minimum length', { minimumLength: 1.5 }, false],
    ['maximum length 0', { maximumLength: 0 }, false],
    ['maximum length 10001', { maximumLength: 10001 }, false],
    ['maximum length as string', { maximumLength: '5' }, false],
    ['unknown key on the field', { extra: 1 }, false],
  ])('field: %s is accepted: %s', (_name, extra, expected) => {
    expect(accepts(createFormRequest, withField(extra))).toBe(expected)
  })

  it.each([
    [
      'create body',
      createFormRequest,
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false}],"__proto__":{"a":1}}',
    ],
    [
      'create field',
      createFormRequest,
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false,"constructor":{"a":1}}]}',
    ],
    [
      'version body',
      formVersionRequest,
      '{"expectedUpdatedAt":"2026-09-24T00:00:00.000Z","constructor":{"a":1}}',
    ],
    [
      'save body',
      saveSubmissionRequest,
      `{"clientSubmissionId":"${uuid}","values":{},"__proto__":{"a":1}}`,
    ],
  ])('rejects an own prototype key on the %s', (_name, schema, json) => {
    expect(accepts(schema, JSON.parse(json))).toBe(false)
  })
})

describe('other form bodies', () => {
  const stamp = '2026-09-24T00:00:00.000Z'
  const save = (extra: Record<string, unknown>) => ({
    clientSubmissionId: uuid,
    values: { first_name: 'Ana' },
    ...extra,
  })
  const generate = { code: 'ok_code', name: 'Okay' }
  const plainValues = { first_name: 'Ana', age: 3, tags: ['a', 'b'], ok: true, empty: null }
  const accepts = (
    schema: { safeParse: (value: unknown) => { success: boolean } },
    value: unknown,
  ) => schema.safeParse(value).success

  it.each([
    ['update', updateFormRequest, { ...form, expectedUpdatedAt: '2026-W01-1' }, true],
    ['update', updateFormRequest, { ...form, expectedUpdatedAt: 'yesterday' }, false],
    ['update', updateFormRequest, { ...form, expectedUpdatedAt: 5 }, false],
    ['update', updateFormRequest, { ...form, expectedUpdatedAt: stamp, extra: 1 }, false],
    ['generate', generateFormRequest, { ...generate, templateKey: 'training_survey' }, true],
    ['generate', generateFormRequest, { ...generate, sourceFormId: uuid }, true],
    ['generate', generateFormRequest, { ...generate, templateKey: null, sourceFormId: null }, true],
    ['generate', generateFormRequest, { ...generate, templateKey: '' }, true],
    ['generate', generateFormRequest, { code: 'ok_code' }, false],
    ['generate', generateFormRequest, { ...generate, templateKey: 7 }, false],
    ['generate', generateFormRequest, { ...generate, templateKey: 'k'.repeat(65) }, false],
    ['generate', generateFormRequest, { ...generate, sourceFormId: 'not-a-uuid' }, false],
    ['generate', generateFormRequest, { ...generate, code: '1bad' }, false],
    ['generate', generateFormRequest, { ...generate, fields: [] }, false],
    ['version', formVersionRequest, { expectedUpdatedAt: '20260924' }, true],
    ['version', formVersionRequest, {}, false],
    ['version', formVersionRequest, { expectedUpdatedAt: 'not a date' }, false],
    ['version', formVersionRequest, { expectedUpdatedAt: stamp, extra: 1 }, false],
    ['values', validateFormValuesRequest, { values: {} }, true],
    [
      'values',
      validateFormValuesRequest,
      JSON.parse('{"values":{"__proto__":{"a":1},"first_name":"Ana"}}'),
      true,
    ],
    ['values', validateFormValuesRequest, {}, false],
    ['values', validateFormValuesRequest, { values: null }, false],
    ['values', validateFormValuesRequest, { values: [1] }, false],
    ['values', validateFormValuesRequest, { values: 'x' }, false],
    ['values', validateFormValuesRequest, { values: {}, extra: 1 }, false],
    ['save', saveSubmissionRequest, save({}), true],
    ['save', saveSubmissionRequest, save({ clientSubmissionId: 'not-a-uuid' }), false],
    ['save', saveSubmissionRequest, save({ clientSubmissionId: undefined }), false],
    ['save', saveSubmissionRequest, save({ beneficiaryId: 'x' }), false],
    ['save', saveSubmissionRequest, save({ values: [] }), false],
    ['save', saveSubmissionRequest, save({ extra: 1 }), false],
    ['save', saveSubmissionRequest, save({ values: plainValues }), true],
    ['save', saveSubmissionRequest, save({ values: { first_name: { constructor: 1 } } }), false],
    [
      'edit',
      updateSubmissionRequest,
      { expectedUpdatedAt: stamp, values: { first_name: 'Ana' } },
      true,
    ],
    ['edit', updateSubmissionRequest, { expectedUpdatedAt: stamp, values: plainValues }, true],
    [
      'edit',
      updateSubmissionRequest,
      { expectedUpdatedAt: stamp, values: { tags: [{ constructor: 1 }] } },
      false,
    ],
    ['edit', updateSubmissionRequest, { expectedUpdatedAt: stamp, values: {}, extra: 1 }, false],
    ['edit', updateSubmissionRequest, { values: {} }, false],
    ['edit', updateSubmissionRequest, { expectedUpdatedAt: stamp }, false],
    ['submit', submitSubmissionRequest, { expectedUpdatedAt: stamp }, true],
    ['submit', submitSubmissionRequest, { expectedUpdatedAt: 'x' }, false],
    ['submit', submitSubmissionRequest, { expectedUpdatedAt: stamp, extra: 1 }, false],
  ] as const)('%s row %#: accepted %s', (_route, schema, body, expected) => {
    expect(accepts(schema, body)).toBe(expected)
  })

  it('trims and lower-cases the generate code and name', () => {
    expect(
      generateFormRequest.parse({ sourceFormId: uuid, code: ' OK_CODE ', name: '  Okay  ' }),
    ).toEqual({ sourceFormId: uuid, code: 'ok_code', name: 'Okay' })
  })

  it('keeps nested response values and drops the method-named keys', () => {
    const values = { first_name: 'Ana', age: 3, tags: ['a', 'b'], ok: true, empty: null }
    expect(validateFormValuesRequest.parse({ values })).toEqual({ values })
    expect(
      validateFormValuesRequest.parse({ values: { first_name: 'Ana', hasOwnProperty: 1 } }),
    ).toEqual({ values: { first_name: 'Ana' } })
  })

  it('drops a method-named values key on the save and edit bodies', () => {
    const values = { first_name: 'Ana', toString: 'x' }
    expect(saveSubmissionRequest.parse(save({ values })).values).toEqual({ first_name: 'Ana' })
    expect(updateSubmissionRequest.parse({ expectedUpdatedAt: stamp, values }).values).toEqual({
      first_name: 'Ana',
    })
  })

  it.each([
    [{ offset: '10000', limit: '50' }, true],
    [{ offset: '', limit: '1' }, true],
    [{ offset: ' 2 ', limit: '0x5' }, true],
    [{ offset: '-1' }, false],
    [{ offset: '10001' }, false],
    [{ limit: '0' }, false],
    [{ limit: '' }, false],
    [{ offset: '2.5' }, false],
    [{ offset: ['1'] }, false],
    [{ offset: { a: '1' } }, false],
    [{ page: '1' }, false],
  ])('submission query %j is accepted: %s', (query, expected) => {
    expect(accepts(listSubmissionsQuery, query)).toBe(expected)
  })
})
