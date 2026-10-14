import { describe, expect, it } from 'vitest'

import { ownProfileResponse, updateOwnProfileRequest } from './own-profile'

const body = {
  fullName: 'Synthetic User',
  contactNumber: '+63 900 000 0000',
  expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
}

describe('own profile contracts', () => {
  it('trims the name and accepts an empty contact number', () => {
    expect(
      updateOwnProfileRequest.parse({
        ...body,
        fullName: '  Synthetic User  ',
        contactNumber: ' ',
      }),
    ).toEqual({ ...body, contactNumber: '' })
  })

  it.each([
    { ...body, fullName: 'x' },
    { ...body, fullName: 'x'.repeat(81) },
    { ...body, contactNumber: 'not a phone' },
    { ...body, expectedUpdatedAt: '2026-02-30' },
    { fullName: 'Synthetic User', expectedUpdatedAt: body.expectedUpdatedAt },
    { ...body, email: 'a@example.invalid' },
  ])('rejects %j', (input) => {
    expect(updateOwnProfileRequest.safeParse(input).success).toBe(false)
  })

  it('reads only the three own profile fields', () => {
    const profile = {
      fullName: 'Synthetic User',
      contactNumber: null,
      updatedAt: body.expectedUpdatedAt,
    }
    expect(ownProfileResponse.parse(profile)).toEqual(profile)
    expect(ownProfileResponse.safeParse({ ...profile, email: 'a@example.invalid' }).success).toBe(
      false,
    )
  })

  it.each([
    ['2 characters', 'Al', true],
    ['80 characters', 'x'.repeat(80), true],
    ['81 characters', 'x'.repeat(81), false],
    ['1 character after the trim', ' A ', false],
  ])('checks the name length: %s', (_label, fullName, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, fullName }).success).toBe(accepted)
  })

  it.each([
    ['7 characters', '1234567', true],
    ['30 characters', '1'.repeat(30), true],
    ['6 characters', '123456', false],
    ['31 characters', '1'.repeat(31), false],
    ['every allowed symbol', '+63 (912) 345-6789', true],
    ['a letter inside', '12345a7', false],
    ['a letter before', 'abc1234567', false],
    ['a letter after', '1234567abc', false],
    ['null', null, false],
  ])('checks the contact number: %s', (_label, contactNumber, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, contactNumber }).success).toBe(accepted)
  })

  it.each([
    ['a date', '2026-10-09', true],
    ['an offset time', '2026-10-09T01:02:03+08:00', true],
    ['a text', 'yesterday', false],
    ['a number', 5, false],
  ])('checks the expected update time: %s', (_label, expectedUpdatedAt, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, expectedUpdatedAt }).success).toBe(accepted)
  })

  it.each([
    ['a text contact number', { contactNumber: '+63 900 000 0000' }, true],
    ['an offset time', { updatedAt: '2026-10-01T00:00:00+08:00' }, false],
    ['a date', { updatedAt: '2026-10-01' }, false],
    ['a missing contact number', { contactNumber: undefined }, false],
    ['a number as the name', { fullName: 5 }, false],
  ])('checks the own profile response: %s', (_label, change, accepted) => {
    const profile = {
      fullName: 'Synthetic User',
      contactNumber: null,
      updatedAt: body.expectedUpdatedAt,
    }
    expect(ownProfileResponse.safeParse({ ...profile, ...change }).success).toBe(accepted)
  })
})
