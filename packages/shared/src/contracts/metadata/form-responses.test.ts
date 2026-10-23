import { describe, expect, it } from 'vitest'

import { formResponse, formSubmissionPageResponse, formSubmissionResponse } from './form-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const field = {
  id: uuid,
  code: 'score',
  label: 'Score',
  dataType: 'INTEGER',
  required: true,
  metadataKey: false,
  sadddField: false,
  allowedValues: null,
  minimumValue: '0',
  minimumLength: null,
  maximumLength: null,
  sequence: 1,
}
const form = {
  id: uuid,
  projectId: uuid,
  code: 'post_test',
  version: 1,
  name: 'Post test',
  description: null,
  formType: 'POST_TEST',
  status: 'PUBLISHED',
  activityId: null,
  journeyStageId: null,
  publishedAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
  createdByCurrentUser: false,
  draftSummary: null,
  fields: [field],
}
const submission = {
  id: uuid,
  clientSubmissionId: uuid,
  beneficiaryId: null,
  status: 'DRAFT',
  formId: uuid,
  formVersion: 1,
  updatedAt: '2026-10-13T00:00:00.000Z',
  values: { score: 7, topics: ['a', 'b'], consent: true, note: null },
}

describe('form response contracts', () => {
  it('describe a form with its fields, a submission and a submission page', () => {
    expect(formResponse.safeParse(form).success).toBe(true)
    expect(formSubmissionResponse.safeParse(submission).success).toBe(true)
    expect(
      formSubmissionPageResponse.safeParse({
        offset: 0,
        limit: 10,
        total: 1,
        items: [{ id: uuid, status: 'VALIDATED', formVersion: 1, updatedAt: '2026-10-13' }],
      }).success,
    ).toBe(true)
  })

  it('accept a draft summary on a form and reject a malformed one', () => {
    const draftSummary = {
      addedFields: ['given_name'],
      sourceNamesAdded: [],
      optionsAdded: [],
      aliasesAdded: 1,
      defaults: [],
      rules: [],
      needsCheck: [{ fieldCode: 'given_name', reason: 'IMPORT_DEFAULT' }],
    }
    expect(formResponse.safeParse({ ...form, draftSummary }).success).toBe(true)
    expect(formResponse.safeParse({ ...form, draftSummary: { addedFields: 'x' } }).success).toBe(
      false,
    )
    const { draftSummary: _omitted, ...without } = form
    expect(formResponse.safeParse(without).success).toBe(false)
  })

  it('reject a form with an unknown type or status, or a field without a data type', () => {
    expect(formResponse.safeParse({ ...form, formType: 'SURVEY' }).success).toBe(false)
    expect(formResponse.safeParse({ ...form, status: 'RETIRED' }).success).toBe(false)
    expect(
      formResponse.safeParse({ ...form, fields: [{ ...field, dataType: 'JSON' }] }).success,
    ).toBe(false)
  })

  it('reject a submission whose value is an object or whose contributor is not a string', () => {
    expect(
      formSubmissionResponse.safeParse({ ...submission, values: { score: { nested: 1 } } }).success,
    ).toBe(false)
    expect(formSubmissionResponse.safeParse({ ...submission, beneficiaryId: 7 }).success).toBe(
      false,
    )
  })
})
