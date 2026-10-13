import { describe, expect, it } from 'vitest'

import {
  createFormRequest,
  digitalFormTypes,
  formResponseValues,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  updateFormRequest,
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
