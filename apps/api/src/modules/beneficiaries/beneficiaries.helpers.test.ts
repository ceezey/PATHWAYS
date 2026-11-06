import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ageBandWhere, assertSubjectProfile } from './beneficiaries.helpers'

// A calendar date safely after the business date in any time zone.
const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)

describe('profile edits', () => {
  const subjectProfile = assertSubjectProfile as (input: unknown, current: unknown) => boolean
  const check = (input: Record<string, unknown>, currentPatch: Record<string, unknown> = {}) =>
    subjectProfile(
      {
        subjectType: 'INDIVIDUAL',
        firstName: 'Synthetic',
        lastName: 'Legacy',
        sex: 'NOT_SPECIFIED',
        disabilityStatus: 'NOT_SPECIFIED',
        expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
        ...input,
      },
      {
        birthDate: new Date('2023-01-01T00:00:00.000Z'),
        ageAtRegistration: 3,
        isMinor: true,
        guardianConsentRecorded: true,
        beneficiaryProjectEnrollment_beneficiary: [
          { enrollmentDate: new Date('2026-01-01T00:00:00.000Z') },
        ],
        ...currentPatch,
      },
    )

  it('keeps a legacy under-5 record editable when birth date and age are unchanged', () => {
    expect(() => check({ birthDate: '2023-01-01', ageAtRegistration: 3 })).not.toThrow()
    expect(() => check({ birthDate: '2023-01-01' })).not.toThrow()
  })

  it('applies the minimum age when the birth date or age changes', () => {
    expect(() => check({ birthDate: '2022-01-01', ageAtRegistration: 4 })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: '2022-01-01' })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: undefined, ageAtRegistration: 4 })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: '2021-01-01', ageAtRegistration: 5 })).not.toThrow()
  })

  it('rejects a changed future birth date with the exact message', () => {
    expect(() => check({ birthDate: future })).toThrow('Date of birth cannot be in the future.')
  })

  describe('minor status follows the current age', () => {
    // 12:00 on 2026-10-26 in Manila.
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-10-26T04:00:00.000Z'), toFake: ['Date'] })
    })
    afterEach(() => {
      vi.useRealTimers()
    })
    // Born 2008-08-17: 17 at the 2026-01-01 enrollment, 18 today.
    const adultToday = { birthDate: '2008-08-17', ageAtRegistration: 17 }
    const noGuardian = { isMinor: true, guardianConsentRecorded: false }

    it('recomputes minor status at today', () => {
      expect(check({ birthDate: '2023-01-01', ageAtRegistration: 3 })).toBe(true)
      expect(check(adultToday, { isMinor: true })).toBe(false)
      expect(check({ ...adultToday, birthDate: '2008-11-01' })).toBe(true)
    })

    it('lets an adult who turned 18 edit without guardian consent, though recorded as a minor', () => {
      expect(check(adultToday, noGuardian)).toBe(false)
    })

    it('refuses a minor without guardian consent with a plain error', () => {
      for (const input of [
        { birthDate: '2023-01-01', ageAtRegistration: 3 },
        { birthDate: undefined, ageAtRegistration: 12 },
      ])
        expect(() => check(input, noGuardian)).toThrow(
          'Guardian consent is required while the participant is under 18.',
        )
    })
  })
})

describe('age band filters', () => {
  const end = new Date('2026-12-31T00:00:00.000Z')

  it('bounds each band by whole years before the project end date', () => {
    expect(ageBandWhere(end, '18-24')).toEqual({
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: new Date('2001-12-31T00:00:00.000Z'),
        lte: new Date('2008-12-31T00:00:00.000Z'),
      },
    })
    expect(ageBandWhere(end, 'Unknown')).toEqual({ subjectType: 'INDIVIDUAL', birthDate: null })
    expect(ageBandWhere(end)).toEqual({})
  })

  it('clamps a leap-day reference to the last day of February', () => {
    expect(ageBandWhere(new Date('2028-02-29T00:00:00.000Z'), '10-14')).toEqual({
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: new Date('2013-02-28T00:00:00.000Z'),
        lte: new Date('2018-02-28T00:00:00.000Z'),
      },
    })
  })
})
