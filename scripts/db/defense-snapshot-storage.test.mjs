import assert from 'node:assert/strict'
import test from 'node:test'

import { copyObjects, objectUrl, uploadContentType } from './defense-snapshot-storage.mjs'

function fakeFetch(responses) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, init })
    const next = responses.shift()
    return {
      ok: next.status < 300,
      status: next.status,
      arrayBuffer: async () => Uint8Array.from(Buffer.from(next.body ?? '')).buffer,
      text: async () => next.body ?? '',
    }
  }
  return { calls, impl }
}

const object = {
  bucket: 'pathways-private',
  name: 'organizations/o/r.csv',
  contentType: 'text/csv; charset=utf-8',
}
const source = { url: 'http://127.0.0.1:54321', key: 'local-key' }
const target = { url: 'https://example.supabase.co/', key: 'hosted-key' }
const quiet = () => {}

test('objectUrl encodes each path segment and trims the base slash', () => {
  assert.equal(
    objectUrl('https://example.supabase.co/', 'pathways-private', 'organizations/a b/c#1.png'),
    'https://example.supabase.co/storage/v1/object/pathways-private/organizations/a%20b/c%231.png',
  )
})

test('uploadContentType strips media type parameters', () => {
  assert.equal(uploadContentType('text/csv; charset=utf-8'), 'text/csv')
  assert.equal(uploadContentType('application/pdf'), 'application/pdf')
  assert.equal(uploadContentType(null), 'application/octet-stream')
})

test('copyObjects downloads with the source key and upserts with the target key', async () => {
  const { calls, impl } = fakeFetch([{ status: 200, body: 'a,b' }, { status: 200 }])
  const copied = await copyObjects([object], source, target, { fetchImpl: impl, log: quiet })
  assert.equal(copied, 1)
  assert.equal(
    calls[0].url,
    'http://127.0.0.1:54321/storage/v1/object/pathways-private/organizations/o/r.csv',
  )
  assert.equal(calls[0].init.headers.apikey, 'local-key')
  assert.equal(calls[1].init.method, 'POST')
  assert.equal(calls[1].init.headers.authorization, 'Bearer hosted-key')
  assert.equal(calls[1].init.headers['x-upsert'], 'true')
  assert.equal(calls[1].init.headers['content-type'], 'text/csv')
  assert.equal(Buffer.from(calls[1].init.body).toString(), 'a,b')
})

test('copyObjects stops on the first failed upload with its status and reason', async () => {
  const { impl } = fakeFetch([
    { status: 200, body: 'x' },
    { status: 400, body: 'mime type not supported' },
  ])
  await assert.rejects(
    copyObjects([object, object], source, target, { fetchImpl: impl, log: quiet }),
    /Upload failed \(400\).*mime type not supported/,
  )
})

test('copyObjects refuses to run without both keys', async () => {
  await assert.rejects(
    copyObjects([object], source, { url: target.url, key: '' }, { fetchImpl: fakeFetch([]).impl }),
    /service role keys/,
  )
})
