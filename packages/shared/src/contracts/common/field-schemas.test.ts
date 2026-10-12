import { describe, expect, it } from 'vitest'

import {
  countInput,
  hasUniqueItems,
  isoDateString,
  lengthString,
  pesoAmountInput,
  strictIsoDateString,
  trimmedInput,
  uuidString,
  validatorLength,
} from './field-schemas'

const grin = String.fromCodePoint(0x1f600)
const heart = String.fromCharCode(0x2764, 0xfe0f)
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('class-validator field schemas', () => {
  it('counts a surrogate pair and a presentation selector pair as one character', () => {
    expect(validatorLength(grin.repeat(3))).toBe(3)
    expect(validatorLength(heart.repeat(2))).toBe(2)
    expect(accepts(lengthString(3, 160), grin.repeat(2))).toBe(false)
    expect(accepts(lengthString(3, 160), grin.repeat(3))).toBe(true)
  })

  it.each([
    ['10000000-0000-4000-8000-000000000001', true],
    ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', true],
    ['00000000-0000-0000-0000-000000000000', true],
    ['10000000-0000-0000-8000-000000000001', false],
    ['10000000-0000-9000-8000-000000000001', false],
    ['10000000-0000-4000-c000-000000000001', false],
  ])('uuidString %s accepts %s', (value, accepted) => {
    expect(accepts(uuidString, value)).toBe(accepted)
  })

  it.each([
    ['2026-01-01', true, true],
    ['2026-02-30', true, false],
    ['2024-366', true, true],
    ['2026-366', true, false],
    ['2026-W01-1', true, true],
    ['2026-01-01T00:00:00.000Z', true, true],
    ['20260101', true, true],
    ['2026-1-1', false, false],
    ['01/02/2026', false, false],
    ['', false, false],
  ])('%s is ISO 8601 %s and a real day %s', (value, iso, strict) => {
    expect(accepts(isoDateString, value)).toBe(iso)
    expect(accepts(strictIsoDateString, value)).toBe(strict)
  })

  it('trims a string before validating and leaves other values alone', () => {
    expect(trimmedInput(lengthString(3, 10)).parse('  abc  ')).toBe('abc')
    expect(accepts(trimmedInput(lengthString(3, 10)), '  ab  ')).toBe(false)
    expect(accepts(trimmedInput(lengthString(3, 10)), 123)).toBe(false)
  })

  it('treats items as repeated by strict equality', () => {
    expect(hasUniqueItems(['a', 'b'])).toBe(true)
    expect(hasUniqueItems(['a', 'a'])).toBe(false)
    expect(hasUniqueItems(['a', 'A'])).toBe(true)
  })

  it('turns numeric text into a count and rejects blanks and out-of-range numbers', () => {
    expect(countInput(100).parse('50')).toBe(50)
    expect(countInput(100).parse(true)).toBe(1)
    expect(countInput(100).parse([5])).toBe(5)
    expect(accepts(countInput(100), '')).toBe(false)
    expect(accepts(countInput(100), null)).toBe(false)
    expect(accepts(countInput(100), -1)).toBe(false)
    expect(accepts(countInput(100), 1.5)).toBe(false)
    expect(accepts(countInput(100), 101)).toBe(false)
    expect(accepts(countInput(100).nullish(), null)).toBe(true)
  })

  it('trims a PHP amount and allows at most two decimals', () => {
    expect(pesoAmountInput.parse(' 125000.50 ')).toBe('125000.50')
    for (const value of ['0', '10', '0.5', '9999999999999999.99'])
      expect(accepts(pesoAmountInput, value)).toBe(true)
    for (const value of ['-1', '1.001', '1e3', '01', '', 10])
      expect(accepts(pesoAmountInput, value)).toBe(false)
  })
})
