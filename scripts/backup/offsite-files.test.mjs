import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  assertRecipient,
  copyNewFiles,
  makeCopyOne,
  objectUrl,
  offsiteKey,
} from './offsite-files.mjs'

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

test('the download address encodes each part of the name and keeps its folders', () => {
  assert.equal(
    objectUrl('https://example.supabase.co/', {
      bucket: 'pathways-private',
      name: 'org 1/niño file#1.jpg',
    }),
    'https://example.supabase.co/storage/v1/object/pathways-private/org%201/ni%C3%B1o%20file%231.jpg',
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

// Stand-ins for the real tools: age writes "ENC:" plus its input to the -o file, aws copies the file it is given.
const fakeAge = `
import { writeFileSync } from 'node:fs'
const out = process.argv[process.argv.indexOf('-o') + 1]
let input = ''
for await (const chunk of process.stdin) input += chunk
writeFileSync(out, 'ENC:' + input)
process.exit(input.includes('BREAK') ? 3 : 0)
`
const fakeAws = `
import { copyFileSync, writeFileSync } from 'node:fs'
const at = process.argv.indexOf('cp')
copyFileSync(process.argv[at + 1], process.env.FAKE_R2_FILE)
writeFileSync(process.env.FAKE_R2_FILE + '.target', process.argv[at + 2])
`

async function realCopy(response) {
  const dir = await mkdtemp(path.join(tmpdir(), 'offsite-test-'))
  await writeFile(path.join(dir, 'age.mjs'), fakeAge)
  await writeFile(path.join(dir, 'aws.mjs'), fakeAws)
  process.env.FAKE_R2_FILE = path.join(dir, 'uploaded')
  process.env.RUNNER_TEMP = dir
  const requests = []
  const copyOne = makeCopyOne({
    supabaseUrl: 'https://example.supabase.co',
    serviceKey: 'test-key',
    recipient,
    bucket: 'offsite',
    endpoint: 'https://r2.example',
    fetchFile: async (url, init) => {
      requests.push({ url, init })
      return response
    },
    age: [process.execPath, path.join(dir, 'age.mjs')],
    aws: [process.execPath, path.join(dir, 'aws.mjs')],
  })
  const object = { bucket: 'reports', name: 'a b.pdf' }
  return { dir, requests, done: copyOne(object, offsiteKey(object)) }
}

test('the real copy step uploads the encrypted file under the offsite key and removes its local copy', async () => {
  const { dir, requests, done } = await realCopy(new Response('file body'))
  await done
  assert.equal(await readFile(path.join(dir, 'uploaded'), 'utf8'), 'ENC:file body')
  assert.equal(
    await readFile(path.join(dir, 'uploaded.target'), 'utf8'),
    's3://offsite/files/reports/a b.pdf.age',
  )
  assert.equal(requests[0].url, 'https://example.supabase.co/storage/v1/object/reports/a%20b.pdf')
  assert.equal(requests[0].init.headers.authorization, 'Bearer test-key')
  assert.equal(existsSync(path.join(dir, 'offsite-file.age')), false)
})

test('a refused download uploads nothing', async () => {
  const { dir, done } = await realCopy(new Response('missing', { status: 404 }))
  await assert.rejects(done, /download answered 404/)
  assert.equal(existsSync(path.join(dir, 'uploaded')), false)
})

test('a failed encryption uploads nothing and leaves no local file', async () => {
  const { dir, done } = await realCopy(new Response('BREAK'))
  await assert.rejects(done, /age exited with 3/)
  assert.equal(existsSync(path.join(dir, 'uploaded')), false)
  assert.equal(existsSync(path.join(dir, 'offsite-file.age')), false)
})
