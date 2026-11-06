import assert from 'node:assert/strict'
import { PassThrough, Readable, Writable } from 'node:stream'
import { test } from 'node:test'
import {
  MAX_RUNTIME_LINE,
  OVERSIZED_OUTPUT,
  createRuntimeRedactor,
  forwardRedactedLines,
} from './runtime-output.mjs'

const password = 'SYNTHETIC password/+canary'
const fakeUrl = `postgresql://fixture:${encodeURIComponent(password)}@invalid.invalid/fixture`
const jwt = 'eyJTeW50aGV0aWM.SYNTHETIC_PAYLOAD.SYNTHETIC_SIGNATURE'
const marker = 'PATHWAYS_ROUTE_CHECK_UNAVAILABLE'
const valueSets = [{ DATABASE_URL: fakeUrl, SYNTHETIC_SECRET: 'SYNTHETIC_SECRET_CANARY' }]
const redact = createRuntimeRedactor(valueSets)

async function capture(chunks, filter = redact) {
  let text = ''
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  await forwardRedactedLines(Readable.from(chunks), destination, filter)
  return text
}

test('configured secrets, encoded/decoded passwords, URLs and JWTs are redacted', () => {
  const canaries = [fakeUrl, password, encodeURIComponent(password), jwt, 'SYNTHETIC_SECRET_CANARY']
  const safe = redact(canaries.join(' '))
  for (const canary of canaries) assert.equal(safe.includes(canary), false)
  assert.ok(safe.includes('[connection URL withheld]'))
  assert.ok(safe.includes('[JWT withheld]'))
})

test('safe operation marker/stage/reason remain intact', async () => {
  const line = JSON.stringify({ event: marker, stage: 'PROFILE_READ', reason: 'P2024' })
  assert.equal(await capture([`${line}\n`]), `${line}\n`)
})

test('every secret chunk boundary is redacted before output, including EOF', async () => {
  for (const secret of [fakeUrl, password, encodeURIComponent(password), jwt]) {
    for (let split = 1; split < secret.length; split++) {
      assert.equal(await capture([secret.slice(0, split), secret.slice(split)]), redact(secret))
    }
  }
})

test('split UTF-8, CRLF, blank lines and trailing partial line are preserved', async () => {
  const text = 'synthetic ✓\r\n\nlast ✓'
  assert.equal(await capture([...Buffer.from(text)].map((byte) => Buffer.from([byte]))), text)
})

test('unterminated input emits nothing before redaction can see the complete line', async () => {
  const source = new PassThrough()
  let output = ''
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString()
      callback()
    },
  })
  const finished = forwardRedactedLines(source, sink, redact)
  source.write('SYNTHETIC_SECRET_')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(output, '')
  source.end('CANARY\n')
  await finished
  assert.equal(output, '[secret withheld]\n')
})

test('oversized complete line is replaced, then next marker survives', async () => {
  const output = await capture([`${'x'.repeat(MAX_RUNTIME_LINE + 1)}\n${marker}\n`])
  assert.equal(output, `${OVERSIZED_OUTPUT}\n${marker}\n`)
})

test('oversized split line discards its entire tail through newline or EOF', async () => {
  for (const ending of ['', '\n']) {
    const output = await capture([
      'x'.repeat(MAX_RUNTIME_LINE),
      'SYNTHETIC_SECRET_',
      `CANARY${ending}`,
    ])
    assert.equal(output, OVERSIZED_OUTPUT + ending)
  }
})

test('legacy buffer-reset algorithm reproduces a disclosed oversized-line tail', () => {
  // Exact former reset behavior, with synthetic input only.
  let pending = `${'x'.repeat(MAX_RUNTIME_LINE)}SYNTHETIC_SECRET_`
  if (pending.length > 1_000_000) pending = '[Oversized output withheld]'
  pending += 'CANARY'
  assert.equal(redact(pending), '[Oversized output withheld]CANARY')
})

test('exact line limit is accepted without truncation', async () => {
  const text = 'x'.repeat(MAX_RUNTIME_LINE)
  assert.equal(await capture([text]), text)
})

test('destination backpressure bounds queued output', async () => {
  let lines = 0
  const sink = new Writable({
    highWaterMark: 8,
    write(_chunk, _encoding, callback) {
      lines++
      setImmediate(callback)
    },
  })
  await forwardRedactedLines(Readable.from([`${marker}\n`.repeat(1000)]), sink, redact)
  assert.equal(lines, 1000)
  assert.ok(sink.writableLength <= marker.length + 1)
})

test('malformed configured URL remains withheld and longer secrets redact first', () => {
  const filter = createRuntimeRedactor([
    { DATABASE_URL: 'synthetic-invalid-url', SHORT_KEY: 'fixture', LONG_KEY: 'fixture-long' },
  ])
  assert.equal(filter('synthetic-invalid-url fixture-long'), '[secret withheld] [secret withheld]')
})
