import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { decryptRecoveryPoint } from './decrypt-recovery-point.mjs'

// The same VECTOR_HEX and VECTOR_V2_HEX are in apps/api/src/modules/backups/recovery-point-encryption.test.ts.
const VECTOR_HEX =
  '50575250316ccd5d408ec4243d00630aac73b24e32e536e385caf93822f8540e05299710cc2aea7d6a9a959b8b50b922adb951a820010e4673fc3d114f1549fc388b2f90cfea342bed7cd4f0d1c3106b3290fba4'
const VECTOR_V2_HEX =
  '5057525032110707070707070707070707070707070709090909090909090909090976f633437c5d9bd5328177182714fb8d2b6bd3faee37f717e021bb61a31412f5535213e33b0a2a53cd43885a0073666cc57413'
const VECTOR_PASSPHRASE = 'correct horse battery staple'
const VECTOR_TEXT = 'pathways recovery point test vector'
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'decrypt-recovery-point.mjs')
const vector = Buffer.from(VECTOR_HEX, 'hex')
const vectorV2 = Buffer.from(VECTOR_V2_HEX, 'hex')
const withCostByte = (logN) =>
  Buffer.concat([vectorV2.subarray(0, 5), Buffer.from([logN]), vectorV2.subarray(6)])

// Builds a file with the given magic, optional cost byte and scrypt cost, as the format describes.
const build = (magic, logN, scryptLogN, plain) => {
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const key = scryptSync(Buffer.from(VECTOR_PASSPHRASE, 'utf8'), salt, 32, {
    N: 2 ** scryptLogN,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const cost = logN === null ? [] : [Buffer.from([logN])]
  return Buffer.concat([
    Buffer.from(magic, 'latin1'),
    ...cost,
    salt,
    nonce,
    body,
    cipher.getAuthTag(),
  ])
}

const withDir = (run) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pwrp-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const cli = (args, passphrase = VECTOR_PASSPHRASE) =>
  spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, PATHWAYS_RECOVERY_PASSPHRASE: passphrase },
    encoding: 'utf8',
  })

test('the exported function opens the known-answer vectors of both versions', () => {
  for (const file of [vector, vectorV2]) {
    assert.equal(decryptRecoveryPoint(file, VECTOR_PASSPHRASE).toString('utf8'), VECTOR_TEXT)
  }
})

test('the exported function opens a PWRP1 file built with the old scrypt cost', () => {
  const file = build('PWRP1', null, 15, Buffer.from('old file'))
  assert.equal(decryptRecoveryPoint(file, VECTOR_PASSPHRASE).toString('utf8'), 'old file')
})

test('the CLI opens a PWRP2 file', () => {
  withDir((dir) => {
    const input = path.join(dir, 'point.pwrp')
    writeFileSync(input, vectorV2)
    assert.equal(cli([input]).status, 0)
    assert.equal(readFileSync(path.join(dir, 'point'), 'utf8'), VECTOR_TEXT)
  })
})

test('the CLI writes the plain file to the given output path', () => {
  withDir((dir) => {
    const input = path.join(dir, 'point.pwrp')
    const output = path.join(dir, 'plain.bin')
    writeFileSync(input, vector)
    const result = cli([input, output])
    assert.equal(result.status, 0)
    assert.equal(readFileSync(output, 'utf8'), VECTOR_TEXT)
  })
})

test('the CLI drops .pwrp from the input path when no output is given', () => {
  withDir((dir) => {
    const input = path.join(dir, 'point.json.gz.pwrp')
    writeFileSync(input, vector)
    assert.equal(cli([input]).status, 0)
    assert.equal(readFileSync(path.join(dir, 'point.json.gz'), 'utf8'), VECTOR_TEXT)
  })
})

test('the CLI asks for an output name when the input does not end in .pwrp', () => {
  withDir((dir) => {
    const input = path.join(dir, 'point.bin')
    writeFileSync(input, vector)
    const result = cli([input])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Give an output file name: the input does not end in \.pwrp\./)
    assert.deepEqual(readdirSync(dir), ['point.bin'])
  })
})

const refusals = {
  'a wrong passphrase': [vector, 'another passphrase 1'],
  'a wrong passphrase on a PWRP2 file': [vectorV2, 'another passphrase 1'],
  'a truncated file': [vector.subarray(0, 40), VECTOR_PASSPHRASE],
  'a truncated PWRP2 file': [vectorV2.subarray(0, 49), VECTOR_PASSPHRASE],
  'a PWRP2 cost byte of 14': [withCostByte(14), VECTOR_PASSPHRASE],
  'a PWRP2 cost byte of 21': [withCostByte(21), VECTOR_PASSPHRASE],
  'a file of other bytes': [
    Buffer.from('not a recovery point at all, just text'),
    VECTOR_PASSPHRASE,
  ],
}
for (const [name, [bytes, passphrase]] of Object.entries(refusals)) {
  test(`the CLI refuses ${name} and writes nothing`, () => {
    withDir((dir) => {
      const input = path.join(dir, 'point.pwrp')
      const output = path.join(dir, 'plain.bin')
      writeFileSync(input, bytes)
      const result = cli([input, output], passphrase)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /could not be opened/)
      assert.equal(existsSync(output), false)
    })
  })
}

test('the CLI never overwrites an existing output file', () => {
  withDir((dir) => {
    const input = path.join(dir, 'point.pwrp')
    const output = path.join(dir, 'plain.bin')
    writeFileSync(input, vector)
    writeFileSync(output, 'keep me')
    const result = cli([input, output])
    assert.equal(result.status, 1)
    assert.equal(readFileSync(output, 'utf8'), 'keep me')
  })
})
