import assert from 'node:assert/strict'
import test from 'node:test'

import { assertShiftAllowed, guardRun, summaryLines } from './defense-snapshot-plan.mjs'

test('assertShiftAllowed refuses a shift or any warning unless allowed', () => {
  assert.doesNotThrow(() => assertShiftAllowed({ warnings: [], delta: 0, allowShift: false }))
  assert.throws(
    () => assertShiftAllowed({ warnings: [], delta: 2, allowShift: false }),
    /--allow-shift/,
  )
  assert.throws(
    () => assertShiftAllowed({ warnings: ['w'], delta: 0, allowShift: false }),
    /--allow-shift/,
  )
  assert.doesNotThrow(() => assertShiftAllowed({ warnings: ['w'], delta: 2, allowShift: true }))
})

test('summaryLines reports day, delta, migration, rows, storage and identities', () => {
  const text = summaryLines({
    manifest: {
      seedDay: '2026-10-06',
      migration: '0063_x',
      tables: [{ rows: 3 }, { rows: 4 }],
      storage: [1, 2],
    },
    restoreDay: '2026-10-07',
    delta: 1,
    identities: { capturedAt: '2026-10-05T00:00:00Z', users: [{}, {}, {}] },
  }).join('\n')
  for (const part of ['2026-10-06', '2026-10-07', 'delta 1', '0063_x', '2 tables', '7 rows'])
    assert.ok(text.includes(part), part)
  assert.match(text, /2 storage object/)
  assert.match(text, /3 identities.*2026-10-05T00:00:00Z/)
})

test('guardRun explains psql exit 3 and 2, and rethrows', () => {
  for (const [status, pattern] of [
    [3, /Restore rolled back; devV2 unchanged\./],
    [
      2,
      /Connection lost; if it happened during COMMIT, check with the wipe dry-run \(runbook section 4 step 2\)\./,
    ],
  ]) {
    const logs = []
    const failure = Object.assign(new Error('psql failed'), { status })
    const run = guardRun(
      () => {
        throw failure
      },
      (line) => logs.push(line),
    )
    assert.throws(() => run('SELECT 1'), failure)
    assert.match(logs.join('\n'), pattern)
  }
  const logs = []
  const other = Object.assign(new Error('x'), { status: 1 })
  assert.throws(
    () =>
      guardRun(
        () => {
          throw other
        },
        (line) => logs.push(line),
      )('s'),
    other,
  )
  assert.equal(logs.length, 0)
  assert.equal(
    guardRun(
      (sql) => `ok ${sql}`,
      () => {},
    )('a'),
    'ok a',
  )
})
