import { isISO8601, isUUID, length } from 'class-validator'
import { describe, expect, it } from 'vitest'

import { isoDateString, lengthString, strictIsoDateString, uuidString } from '@pathways/shared'

const grin = String.fromCodePoint(0x1f600)
const heart = String.fromCharCode(0x2764, 0xfe0f)

// Inputs on both sides of every class-validator rule the shared field schemas port.
const inputs = [
  '2026-01-01',
  '2026-02-30',
  '2024-02-29',
  '2026-02-29',
  '2026-W53',
  '2026-W54',
  '2026-W01-7',
  '2026-000',
  '2026-365',
  '2026-366',
  '2000-366',
  '1900-366',
  '2026-01',
  '2026',
  '+2026-01-01',
  '-2026-01-01',
  '20260101',
  '2026-0101',
  '202601-01',
  '2026-04-31',
  '2026-12-32',
  '2026-13-01',
  '2026-1-1',
  '01/02/2026',
  '2026-01-01T24:00',
  '2026-01-01T23:59:60',
  '2026-01-01T10:00:00,5+08:00',
  '2026-01-01T10:00+0800',
  '2026-01-01T10:00:00.123456789Z',
  '2026-01-01t10:00Z',
  '2026-01-01 10:00',
  '2026-01-01T10',
  ' 2026-01-01',
  '2026-01-01 ',
  '',
  'x',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
  '10000000-0000-0000-8000-000000000001',
  '10000000-0000-8000-8000-000000000001',
  '10000000-0000-9000-8000-000000000001',
  '10000000-0000-4000-7000-000000000001',
  '10000000000040008000000000000001',
  '{10000000-0000-4000-8000-000000000001}',
  'ab',
  'abc',
  'x'.repeat(160),
  'x'.repeat(161),
  grin.repeat(2),
  grin.repeat(3),
  `e${String.fromCharCode(0x301)}`,
  heart.repeat(3),
  String.fromCharCode(0xfe0f).repeat(3),
  String.fromCharCode(0xd800, 0xd800),
  `ab${String.fromCharCode(0xfe0e)}`,
]

describe('shared field schemas and class-validator', () => {
  it.each(inputs)('agree on %j', (value) => {
    expect({
      uuid: uuidString.safeParse(value).success,
      iso: isoDateString.safeParse(value).success,
      strictIso: strictIsoDateString.safeParse(value).success,
      length: lengthString(3, 160).safeParse(value).success,
    }).toEqual({
      uuid: isUUID(value),
      iso: isISO8601(value),
      strictIso: isISO8601(value, { strict: true }),
      length: length(value, 3, 160),
    })
  })

  it('rejects non-strings on both sides', () => {
    for (const value of [null, 1, true, [], {}]) {
      expect(uuidString.safeParse(value).success).toBe(isUUID(value))
      expect(isoDateString.safeParse(value).success).toBe(isISO8601(value))
      expect(lengthString(0, 10).safeParse(value).success).toBe(length(value, 0, 10))
    }
  })
})
