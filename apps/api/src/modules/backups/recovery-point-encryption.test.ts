import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptRecoveryPoint, encryptRecoveryPoint } from './recovery-point-encryption'

// Same vector as scripts/db/decrypt-recovery-point.test.mjs, so the module and the script share one format.
const VECTOR_HEX =
  '50575250316ccd5d408ec4243d00630aac73b24e32e536e385caf93822f8540e05299710cc2aea7d6a9a959b8b50b922adb951a820010e4673fc3d114f1549fc388b2f90cfea342bed7cd4f0d1c3106b3290fba4'
const VECTOR_PASSPHRASE = 'correct horse battery staple'
const VECTOR_TEXT = 'pathways recovery point test vector'
const PASS = 'a twelve char passphrase'
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

describe('recovery point encryption', () => {
  it('round trips a 1 MiB buffer and an empty buffer', () => {
    const big = randomBytes(1024 * 1024)
    expect(decryptRecoveryPoint(encryptRecoveryPoint(big, PASS), PASS).equals(big)).toBe(true)
    const empty = Buffer.alloc(0)
    expect(decryptRecoveryPoint(encryptRecoveryPoint(empty, PASS), PASS).length).toBe(0)
  })

  it('starts with PWRP1 and adds 49 bytes', () => {
    const plain = Buffer.from('hello')
    const file = encryptRecoveryPoint(plain, PASS)
    expect(file.subarray(0, 5).toString('latin1')).toBe('PWRP1')
    expect(file.length).toBe(plain.length + 49)
  })

  it('differs on every encryption of the same input', () => {
    const plain = Buffer.from('same input')
    expect(encryptRecoveryPoint(plain, PASS).equals(encryptRecoveryPoint(plain, PASS))).toBe(false)
  })

  it('refuses a wrong passphrase', () => {
    const file = encryptRecoveryPoint(Buffer.from('secret'), PASS)
    expect(() => decryptRecoveryPoint(file, 'another passphrase 1')).toThrow(OPEN_ERROR)
  })

  it('refuses a file with one flipped byte in the salt, nonce, ciphertext or tag', () => {
    const file = encryptRecoveryPoint(Buffer.from('secret data'), PASS)
    for (const i of [5, 21, 33, file.length - 1]) {
      const damaged = Buffer.from(file)
      damaged[i] = (damaged[i] ?? 0) ^ 0x01
      expect(() => decryptRecoveryPoint(damaged, PASS)).toThrow(OPEN_ERROR)
    }
  })

  it('refuses a file shorter than 49 bytes', () => {
    const file = encryptRecoveryPoint(Buffer.from('secret'), PASS)
    expect(() => decryptRecoveryPoint(file.subarray(0, 48), PASS)).toThrow(OPEN_ERROR)
  })

  it('refuses a file with other magic', () => {
    const file = encryptRecoveryPoint(Buffer.from('secret'), PASS)
    file.write('PWRP2', 0, 'latin1')
    expect(() => decryptRecoveryPoint(file, PASS)).toThrow(OPEN_ERROR)
  })

  it('round trips a passphrase with spaces and non-ASCII letters', () => {
    const pass = '  pässwörd ñ 密碼  twelve'
    const plain = Buffer.from('unicode')
    expect(decryptRecoveryPoint(encryptRecoveryPoint(plain, pass), pass).equals(plain)).toBe(true)
  })

  it('treats composed and decomposed forms of a passphrase as the same', () => {
    const plain = Buffer.from('normalized')
    const file = encryptRecoveryPoint(plain, 'café passphrase 1')
    expect(decryptRecoveryPoint(file, 'café passphrase 1').equals(plain)).toBe(true)
  })

  it('opens the known-answer vector', () => {
    const opened = decryptRecoveryPoint(Buffer.from(VECTOR_HEX, 'hex'), VECTOR_PASSPHRASE)
    expect(opened.toString('utf8')).toBe(VECTOR_TEXT)
  })
})
