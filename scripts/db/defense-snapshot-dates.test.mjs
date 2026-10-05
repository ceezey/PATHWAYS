import assert from 'node:assert/strict'
import test from 'node:test'

import { dayDelta, manilaDay, restoreWarnings } from './defense-snapshot-dates.mjs'

test('manilaDay uses the Asia/Manila calendar', () => {
  assert.equal(manilaDay(new Date('2026-10-05T16:30:00Z')), '2026-10-06')
  assert.equal(manilaDay(new Date('2026-10-05T15:59:00Z')), '2026-10-05')
})

test('dayDelta counts whole days, across months', () => {
  assert.equal(dayDelta('2026-10-06', '2026-10-06'), 0)
  assert.equal(dayDelta('2026-10-06', '2026-10-09'), 3)
  assert.equal(dayDelta('2026-09-29', '2026-10-02'), 3)
})

test('dayDelta refuses backwards shifts and invalid days', () => {
  assert.throws(() => dayDelta('2026-10-06', '2026-10-05'), /before seed day/)
  assert.throws(() => dayDelta('2026-02-30', '2026-10-05'), /Invalid day/)
  assert.throws(() => dayDelta('6 Oct', '2026-10-05'), /Invalid day/)
})

test('restoreWarnings flags timestamps that land after now', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-10-06',
    restoreDay: '2026-10-08',
    dumpedAt: '2026-10-06T12:00:00Z',
    now: new Date('2026-10-08T01:00:00Z'),
  })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /2026-10-08T12:00:00\.000Z, after now/)
})

test('restoreWarnings is quiet when the restore runs later in the day', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-10-06',
    restoreDay: '2026-10-08',
    dumpedAt: '2026-10-06T01:00:00Z',
    now: new Date('2026-10-08T03:00:00Z'),
  })
  assert.deepEqual(warnings, [])
})

test('restoreWarnings flags a month change', () => {
  const warnings = restoreWarnings({
    seedDay: '2026-09-29',
    restoreDay: '2026-10-02',
    dumpedAt: '2026-09-29T01:00:00Z',
    now: new Date('2026-10-02T03:00:00Z'),
  })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /different months/)
})
