import assert from 'node:assert/strict'
import test from 'node:test'

import { assertRecipient, copyNewFiles, offsiteKey } from './offsite-files.mjs'

const recipient = `age1${'q'.repeat(58)}`

function run({ stored, offsite = [], fail = () => false, recipient: to = recipient }) {
  const calls = { listStored: 0, copied: [] }
  const result = copyNewFiles({
    recipient: to,
    listStored: async () => {
      calls.listStored += 1
      return stored
    },
    listOffsite: async () => new Set(offsite),
    copyOne: async (object, key) => {
      if (fail(object)) throw new Error('copy failed')
      calls.copied.push(key)
    },
  })
  return { calls, result }
}

test('an object already offsite is skipped', async () => {
  const { calls, result } = run({
    stored: [{ bucket: 'reports', name: 'a.pdf' }],
    offsite: ['files/reports/a.pdf.age'],
  })
  assert.deepEqual(await result, { copied: 0, skipped: 1, failed: 0 })
  assert.deepEqual(calls.copied, [])
})

test('a new object is copied under its name with the .age suffix', async () => {
  const { calls, result } = run({ stored: [{ bucket: 'reports', name: 'a.pdf' }] })
  assert.deepEqual(await result, { copied: 1, skipped: 0, failed: 0 })
  assert.deepEqual(calls.copied, ['files/reports/a.pdf.age'])
})

test('a name with a space, a slash and a non-ASCII letter keeps its exact name', () => {
  assert.equal(
    offsiteKey({ bucket: 'pathways-private', name: 'org 1/niño file.jpg' }),
    'files/pathways-private/org 1/niño file.jpg.age',
  )
})

test('an empty recipient stops before anything is listed or downloaded', async () => {
  const { calls, result } = run({ stored: [{ bucket: 'reports', name: 'a.pdf' }], recipient: '' })
  await assert.rejects(result, /recipient/)
  assert.equal(calls.listStored, 0)
  assert.deepEqual(calls.copied, [])
})

test('a recipient that is not one age public key is refused', () => {
  for (const bad of [
    undefined,
    'AGE-SECRET-KEY-1ABC',
    `${recipient} ${recipient}`,
    'ssh-ed25519 AAAA',
  ])
    assert.throws(() => assertRecipient(bad), /recipient/)
  assert.doesNotThrow(() => assertRecipient(recipient))
})

test('one failed object does not stop the others, and the failure is counted', async () => {
  const { calls, result } = run({
    stored: [
      { bucket: 'reports', name: 'a.pdf' },
      { bucket: 'reports', name: 'b.pdf' },
      { bucket: 'reports', name: 'c.pdf' },
    ],
    fail: (object) => object.name === 'b.pdf',
  })
  assert.deepEqual(await result, { copied: 2, skipped: 0, failed: 1 })
  assert.deepEqual(calls.copied, ['files/reports/a.pdf.age', 'files/reports/c.pdf.age'])
})
