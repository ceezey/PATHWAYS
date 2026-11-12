import { describe, expect, it } from 'vitest'

import { registerBeneficiaryRequest } from '../contracts/beneficiaries/beneficiary-requests'
import { POSSIBLE_DUPLICATE, duplicateNameKey } from './duplicate-match'

describe('duplicate match', () => {
  it('keys names trimmed and case-insensitive', () => {
    expect(duplicateNameKey('  Households REACHED ')).toBe('households reached')
    expect(duplicateNameKey(null)).toBe('')
    expect(POSSIBLE_DUPLICATE).toBe('POSSIBLE_DUPLICATE')
  })

  it('lets a registration confirm a possible duplicate and nothing else', () => {
    const body = {
      formId: '10000000-0000-4000-8000-000000000001',
      clientRegistrationId: '10000000-0000-4000-8000-000000000002',
      values: {},
    }
    expect(
      registerBeneficiaryRequest.parse({ ...body, confirmDuplicate: true }).confirmDuplicate,
    ).toBe(true)
    expect(registerBeneficiaryRequest.safeParse({ ...body, confirmDuplicate: false }).success).toBe(
      false,
    )
  })
})
