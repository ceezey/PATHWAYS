import { describe, expect, it } from 'vitest'

import {
  archiveBeneficiaryRequest,
  beneficiaryListQuery,
  enrollBeneficiaryRequest,
  registerBeneficiaryRequest,
  resolveDuplicateRequest,
  updateBeneficiaryRequest,
} from './beneficiary-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const person = {
  subjectType: 'INDIVIDUAL',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}

describe('beneficiary request contracts', () => {
  it('defaults the page size, coerces it from a string and trims the search', () => {
    expect(beneficiaryListQuery.parse({})).toEqual({ limit: 25 })
    expect(beneficiaryListQuery.parse({ limit: '10', search: '  Ana ' })).toEqual({
      limit: 10,
      search: 'Ana',
    })
  })

  it.each([
    [' 7 ', 7],
    ['1e1', 10],
    ['0x10', 16],
    [['10'], 10],
  ])('coerces the list limit %j to %d as the DTO transform did', (limit, parsed) => {
    expect(beneficiaryListQuery.parse({ limit }).limit).toBe(parsed)
  })

  it.each([{ limit: '' }, { limit: '1.5' }, { limit: ['1', '2'] }])(
    'rejects the list limit %j',
    (query) => {
      expect(beneficiaryListQuery.safeParse(query).success).toBe(false)
    },
  )

  it.each([{ limit: '0' }, { limit: '51' }, { search: '   ' }, { ageBand: '5-9' }, { page: '2' }])(
    'rejects the list query %j',
    (query) => {
      expect(beneficiaryListQuery.safeParse(query).success).toBe(false)
    },
  )

  it('keeps registration values as sent', () => {
    const body = { formId: uuid, clientRegistrationId: uuid, values: { a: [1], b: null } }
    expect(registerBeneficiaryRequest.parse(body)).toEqual(body)
    expect(registerBeneficiaryRequest.safeParse({ ...body, values: [] }).success).toBe(false)
  })

  it('keeps null on optional profile fields and lists the audited fields in order', () => {
    const body = { ...person, firstName: null, birthDate: null, ageAtRegistration: null }
    expect(updateBeneficiaryRequest.parse(body)).toEqual(body)
    expect(Object.keys(updateBeneficiaryRequest.shape)).toEqual([
      'subjectType',
      'displayName',
      'firstName',
      'middleName',
      'lastName',
      'sex',
      'birthDate',
      'ageAtRegistration',
      'disabilityStatus',
      'locationBarangay',
      'locationCityMunicipality',
      'locationProvince',
      'expectedUpdatedAt',
    ])
  })

  it.each([
    { birthDate: '2026-02-30' },
    { ageAtRegistration: '26' },
    { ageAtRegistration: 131 },
    { status: 'ACTIVE' },
    JSON.parse('{"__proto__":{"a":1}}'),
    { constructor: { a: 1 } },
  ])('rejects the profile update %j', (extra) => {
    expect(updateBeneficiaryRequest.safeParse({ ...person, ...extra }).success).toBe(false)
  })

  it('accepts only the two duplicate decisions', () => {
    expect(
      resolveDuplicateRequest.safeParse({ leftId: uuid, rightId: uuid, decision: 'LINK' }).success,
    ).toBe(true)
    expect(
      resolveDuplicateRequest.safeParse({ leftId: uuid, rightId: uuid, decision: 'MERGE' }).success,
    ).toBe(false)
  })

  it.each([
    [
      'register',
      registerBeneficiaryRequest,
      { formId: uuid, clientRegistrationId: uuid, values: {} },
    ],
    ['archive', archiveBeneficiaryRequest, { expectedUpdatedAt: '2026-09-24' }],
    ['enroll', enrollBeneficiaryRequest, { enrollmentDate: '2026-01-01' }],
    ['resolve', resolveDuplicateRequest, { leftId: uuid, rightId: uuid, decision: 'LINK' }],
  ])('rejects an unknown key on the %s body', (_name, contract, body) => {
    expect(contract.safeParse(body).success).toBe(true)
    expect(contract.safeParse({ ...body, extra: true }).success).toBe(false)
  })
})
