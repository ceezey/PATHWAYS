import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// PWRP2 layout: PWRP2, 1 byte log2(N), 16-byte salt, 12-byte nonce, ciphertext, 16-byte tag; PWRP1 has no cost byte and fixed N 2^15.
const MAGIC_V1 = Buffer.from('PWRP1', 'latin1')
const MAGIC_V2 = Buffer.from('PWRP2', 'latin1')
const MAGIC_LENGTH = 5
const SALT_LENGTH = 16
const NONCE_LENGTH = 12
const TAG_LENGTH = 16
const WRITE_LOG_N = 17
const MIN_LOG_N = 15
const MAX_LOG_N = 20
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

// The default 32 MiB scrypt limit refuses these costs, so the limit is raised to 130 * N * r bytes.
const deriveKey = (passphrase: string, salt: Buffer, logN: number): Buffer => {
  const N = 2 ** logN
  return scryptSync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, 32, {
    N,
    r: 8,
    p: 1,
    maxmem: 130 * N * 8,
  })
}

// shortcut: the whole file is held in memory, stream it when recovery points near the 50 MiB bucket limit.
export const encryptRecoveryPoint = (plain: Buffer, passphrase: string): Buffer => {
  const salt = randomBytes(SALT_LENGTH)
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt, WRITE_LOG_N), nonce)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([
    MAGIC_V2,
    Buffer.from([WRITE_LOG_N]),
    salt,
    nonce,
    body,
    cipher.getAuthTag(),
  ])
}

export const decryptRecoveryPoint = (file: Buffer, passphrase: string): Buffer => {
  const magic = file.subarray(0, MAGIC_LENGTH)
  const isV2 = magic.equals(MAGIC_V2)
  if (!isV2 && !magic.equals(MAGIC_V1)) throw new Error(OPEN_ERROR)
  const logNLength = isV2 ? 1 : 0
  const logN = isV2 ? (file[MAGIC_LENGTH] ?? 0) : MIN_LOG_N
  const start = MAGIC_LENGTH + logNLength
  if (file.length < start + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH) throw new Error(OPEN_ERROR)
  if (logN < MIN_LOG_N || logN > MAX_LOG_N) throw new Error(OPEN_ERROR)
  const salt = file.subarray(start, start + SALT_LENGTH)
  const nonce = file.subarray(start + SALT_LENGTH, start + SALT_LENGTH + NONCE_LENGTH)
  const body = file.subarray(start + SALT_LENGTH + NONCE_LENGTH, file.length - TAG_LENGTH)
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt, logN), nonce)
    decipher.setAuthTag(file.subarray(file.length - TAG_LENGTH))
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new Error(OPEN_ERROR)
  }
}
