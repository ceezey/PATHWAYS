import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptRecoveryPoint, encryptRecoveryPoint } from './recovery-point-encryption'

// The same VECTOR_HEX and VECTOR_V2_HEX are in scripts/db/decrypt-recovery-point.test.mjs.
const VECTOR_HEX =
  '50575250316ccd5d408ec4243d00630aac73b24e32e536e385caf93822f8540e05299710cc2aea7d6a9a959b8b50b922adb951a820010e4673fc3d114f1549fc388b2f90cfea342bed7cd4f0d1c3106b3290fba4'
const VECTOR_V2_HEX =
  '5057525032110707070707070707070707070707070709090909090909090909090976f633437c5d9bd5328177182714fb8d2b6bd3faee37f717e021bb61a31412f5535213e33b0a2a53cd43885a0073666cc57413'
const VECTOR_PASSPHRASE = 'correct horse battery staple'
const VECTOR_TEXT = 'pathways recovery point test vector'
const PASS = 'a twelve char passphrase'
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

// Builds a file with the given magic, optional cost byte and scrypt cost, as the format describes.
const build = (magic: string, logN: number | null, scryptLogN: number, plain: Buffer): Buffer => {
  const salt = randomBytes(16)
  const nonce = randomBytes(12)
  const key = scryptSync(Buffer.from(PASS, 'utf8'), salt, 32, {
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

describe('recovery point encryption', () => {
  it('round trips a 1 MiB buffer and an empty buffer', () => {
    const big = randomBytes(1024 * 1024)
    expect(decryptRecoveryPoint(encryptRecoveryPoint(big, PASS), PASS).equals(big)).toBe(true)
    const empty = Buffer.alloc(0)
    expect(decryptRecoveryPoint(encryptRecoveryPoint(empty, PASS), PASS).length).toBe(0)
  })

  it('starts with PWRP2 and cost byte 17 and adds 50 bytes', () => {
    const plain = Buffer.from('hello')
    const file = encryptRecoveryPoint(plain, PASS)
    expect(file.subarray(0, 5).toString('latin1')).toBe('PWRP2')
    expect(file[5]).toBe(17)
    expect(file.length).toBe(plain.length + 50)
  })

  it('still opens a PWRP1 file built with the old scrypt cost', () => {
    const plain = Buffer.from('old file')
    const file = build('PWRP1', null, 15, plain)
    expect(decryptRecoveryPoint(file, PASS).equals(plain)).toBe(true)
  })

  it('opens a PWRP2 file written at another allowed cost', () => {
    const plain = Buffer.from('cost 16')
    expect(decryptRecoveryPoint(build('PWRP2', 16, 16, plain), PASS).equals(plain)).toBe(true)
  })

  it('refuses a PWRP2 cost byte outside 15 to 20 with the generic error', () => {
    for (const logN of [0, 14, 21, 255]) {
      const file = build('PWRP2', 15, 15, Buffer.from('x'))
      file[5] = logN
      expect(() => decryptRecoveryPoint(file, PASS)).toThrow(OPEN_ERROR)
    }
  })

  it('refuses a PWRP2 cost byte that does not match the key used', () => {
    const file = build('PWRP2', 17, 16, Buffer.from('mismatch'))
    expect(() => decryptRecoveryPoint(file, PASS)).toThrow(OPEN_ERROR)
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
    for (const i of [6, 22, 34, file.length - 1]) {
      const damaged = Buffer.from(file)
      damaged[i] = (damaged[i] ?? 0) ^ 0x01
      expect(() => decryptRecoveryPoint(damaged, PASS)).toThrow(OPEN_ERROR)
    }
  })

  it('refuses a file shorter than its header and tag', () => {
    const v2 = encryptRecoveryPoint(Buffer.from('secret'), PASS)
    expect(() => decryptRecoveryPoint(v2.subarray(0, 49), PASS)).toThrow(OPEN_ERROR)
    const v1 = build('PWRP1', null, 15, Buffer.from('secret'))
    expect(() => decryptRecoveryPoint(v1.subarray(0, 48), PASS)).toThrow(OPEN_ERROR)
  })

  it('refuses a file with other magic', () => {
    const file = encryptRecoveryPoint(Buffer.from('secret'), PASS)
    file.write('PWRP3', 0, 'latin1')
    expect(() => decryptRecoveryPoint(file, PASS)).toThrow(OPEN_ERROR)
  })

  it('round trips a passphrase with spaces and non-ASCII letters', () => {
    const pass = '  pässwörd ñ 密碼  twelve'
    const plain = Buffer.from('unicode')
    expect(decryptRecoveryPoint(encryptRecoveryPoint(plain, pass), pass).equals(plain)).toBe(true)
  })

  it('treats composed and decomposed forms of a passphrase as the same', () => {
    const plain = Buffer.from('normalized')
    const file = encryptRecoveryPoint(plain, 'caf\u00e9 passphrase 1')
    expect(decryptRecoveryPoint(file, 'cafe\u0301 passphrase 1').equals(plain)).toBe(true)
  })

  it('opens the known-answer vectors of both versions', () => {
    for (const hex of [VECTOR_HEX, VECTOR_V2_HEX]) {
      const opened = decryptRecoveryPoint(Buffer.from(hex, 'hex'), VECTOR_PASSPHRASE)
      expect(opened.toString('utf8')).toBe(VECTOR_TEXT)
    }
  })
})
