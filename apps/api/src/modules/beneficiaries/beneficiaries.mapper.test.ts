import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type BeneficiaryRow, mapBeneficiary } from './beneficiaries.mapper'

const row = (patch: Record<string, unknown>) =>
  ({
    id: 'person',
    code: 'PW0000000001',
    subjectType: 'INDIVIDUAL',
    displayName: 'Synthetic Person',
    birthDate: null,
    isMinor: false,
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    beneficiaryProjectEnrollment_beneficiary: [],
    beneficiaryConsentRecord_beneficiary: [],
    ...patch,
  }) as unknown as BeneficiaryRow

describe('mapBeneficiary minor status', () => {
  beforeEach(() => {
    // 12:00 on 2026-10-26 in Manila.
    vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads minor status from the birth date on the business date', () => {
    const under18 = row({ birthDate: new Date('2008-10-27T00:00:00.000Z'), isMinor: false })
    const turned18 = row({ birthDate: new Date('2008-10-26T00:00:00.000Z'), isMinor: true })
    expect(mapBeneficiary(under18, 'project').isMinor).toBe(true)
    expect(mapBeneficiary(turned18, 'project').isMinor).toBe(false)
  })

  it('keeps the stored flag when there is no birth date', () => {
    expect(mapBeneficiary(row({ isMinor: true }), 'project').isMinor).toBe(true)
  })

  it('follows the shared minor rule, so a future birth date is no age', () => {
    const future = row({ birthDate: new Date('2027-01-01T00:00:00.000Z'), isMinor: true })
    expect(mapBeneficiary(future, 'project').isMinor).toBe(false)
  })
})
