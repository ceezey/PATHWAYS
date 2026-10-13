import { describe, expect, it } from 'vitest'

import { canonicalCode } from '../beneficiaries/beneficiary-registration.helpers'
import { normalizedCode, normalizedText } from './participants.dto'

const grin = String.fromCodePoint(0x1f600)

describe('participation beneficiary code', () => {
  it.each([
    ['BEN-001', 'BEN-001'],
    [' ben_001 ', 'BEN_001'],
    ['b1', 'B1'],
    ['B', null],
    ['-BEN', null],
    ['BEN 001', null],
    ['BEN.001', null],
    ['X'.repeat(40), 'X'.repeat(40)],
    ['X'.repeat(41), null],
    [`BEN${grin}`, null],
    ['', null],
    [null, null],
    [42, null],
  ])('reads %j as %j with the registration code rule', (value, expected) => {
    expect(canonicalCode(value)).toBe(expected)
    expect(normalizedCode(value)).toBe(expected)
  })
})

describe('normalizedText', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    [7, null],
    ['  Attended.  ', 'Attended.'],
    ['x'.repeat(2000), 'x'.repeat(2000)],
    ['x'.repeat(2001), null],
  ])('reads %j as %j', (value, expected) => {
    expect(normalizedText(value)).toBe(expected)
  })

  it('applies a shorter maximum when given', () => {
    expect(normalizedText('abcd', 3)).toBeNull()
    expect(normalizedText('abc', 3)).toBe('abc')
  })
})
