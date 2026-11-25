import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { decryptRecoveryPoint } from './decrypt-recovery-point.mjs'

// Same vector as apps/api/src/modules/backups/recovery-point-encryption.test.ts, so the script and the module share one format.
const VECTOR_HEX =
  '50575250316ccd5d408ec4243d00630aac73b24e32e536e385caf93822f8540e05299710cc2aea7d6a9a959b8b50b922adb951a820010e4673fc3d114f1549fc388b2f90cfea342bed7cd4f0d1c3106b3290fba4'
const VECTOR_PASSPHRASE = 'correct horse battery staple'
const VECTOR_TEXT = 'pathways recovery point test vector'
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'decrypt-recovery-point.mjs')
const vector = Buffer.from(VECTOR_HEX, 'hex')

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

test('the exported function opens the known-answer vector', () => {
  assert.equal(decryptRecoveryPoint(vector, VECTOR_PASSPHRASE).toString('utf8'), VECTOR_TEXT)
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

const refusals = {
  'a wrong passphrase': [vector, 'another passphrase 1'],
  'a truncated file': [vector.subarray(0, 40), VECTOR_PASSPHRASE],
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
