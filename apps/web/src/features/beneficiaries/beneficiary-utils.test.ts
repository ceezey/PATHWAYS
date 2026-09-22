import { describe, expect, it } from 'vitest'

import { formatDate, matchesBeneficiarySearch } from './beneficiary-utils'

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

describe('beneficiary date formatting', () => {
  it('formats date-only and full ISO timestamp values in UTC', () => {
    expect(formatDate('2026-06-18')).toBe('Jun 18, 2026')
    expect(formatDate('2026-06-18T14:30:00.000Z')).toBe('Jun 18, 2026')
  })

  it('returns a safe label for missing or malformed values', () => {
    expect(formatDate(undefined)).toBe('Date unavailable')
    expect(formatDate('')).toBe('Date unavailable')
    expect(formatDate('not-a-date')).toBe('Date unavailable')
    expect(formatDate('2026-02-31')).toBe('Date unavailable')
  })
})
