import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// File layout: PWRP1, 16-byte salt, 12-byte nonce, ciphertext, 16-byte tag.
const MAGIC = Buffer.from('PWRP1', 'latin1')
const SALT_LENGTH = 16
const NONCE_LENGTH = 12
const TAG_LENGTH = 16
const OVERHEAD = MAGIC.length + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

// The default 32 MiB scrypt limit refuses N 32768 with r 8, so the limit is raised to 64 MiB.
const deriveKey = (passphrase: string, salt: Buffer): Buffer =>
  scryptSync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, 32, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })

// shortcut: the whole file is held in memory, stream it when recovery points near the 50 MiB bucket limit.
export const encryptRecoveryPoint = (plain: Buffer, passphrase: string): Buffer => {
  const salt = randomBytes(SALT_LENGTH)
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), nonce)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, salt, nonce, body, cipher.getAuthTag()])
}

export const decryptRecoveryPoint = (file: Buffer, passphrase: string): Buffer => {
  if (file.length < OVERHEAD || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(OPEN_ERROR)
  }
  const salt = file.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH)
  const nonce = file.subarray(MAGIC.length + SALT_LENGTH, MAGIC.length + SALT_LENGTH + NONCE_LENGTH)
  const body = file.subarray(MAGIC.length + SALT_LENGTH + NONCE_LENGTH, file.length - TAG_LENGTH)
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), nonce)
    decipher.setAuthTag(file.subarray(file.length - TAG_LENGTH))
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new Error(OPEN_ERROR)
  }
}
