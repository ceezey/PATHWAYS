import { describe, expect, it } from 'vitest'

import { matchesBeneficiarySearch } from './beneficiary-utils'

const beneficiary = {
  code: 'BEN-NCR-001',
  displayName: 'María Sample Santos',
  firstName: 'María',
  middleName: 'Sample',
  lastName: 'Santos',
}

describe('beneficiary search matching', () => {
  it('matches a Beneficiary code despite punctuation differences', () => {
    expect(matchesBeneficiarySearch(beneficiary, 'ben ncr 001')).toBe(true)
  })

  it('matches name tokens in a natural order-insensitive search', () => {
    expect(matchesBeneficiarySearch(beneficiary, 'Santos Maria')).toBe(true)
    expect(matchesBeneficiarySearch(beneficiary, 'sample santos')).toBe(true)
  })

  it('returns all records for blank input and rejects unrelated text', () => {
    expect(matchesBeneficiarySearch(beneficiary, '   ')).toBe(true)
    expect(matchesBeneficiarySearch(beneficiary, 'unrelated name')).toBe(false)
  })
})
