// Opens an encrypted recovery point: node scripts/db/decrypt-recovery-point.mjs <file.pwrp> [output]
// The format is duplicated from apps/api/src/modules/backups/recovery-point-encryption.ts so this runs standalone.
import { createDecipheriv, scryptSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const MAGIC = Buffer.from('PWRP1', 'latin1')
const SALT_LENGTH = 16
const NONCE_LENGTH = 12
const TAG_LENGTH = 16
const OVERHEAD = MAGIC.length + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

export const decryptRecoveryPoint = (file, passphrase) => {
  if (file.length < OVERHEAD || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(OPEN_ERROR)
  }
  const salt = file.subarray(MAGIC.length, MAGIC.length + SALT_LENGTH)
  const nonce = file.subarray(MAGIC.length + SALT_LENGTH, MAGIC.length + SALT_LENGTH + NONCE_LENGTH)
  const body = file.subarray(MAGIC.length + SALT_LENGTH + NONCE_LENGTH, file.length - TAG_LENGTH)
  try {
    const key = scryptSync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    })
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(file.subarray(file.length - TAG_LENGTH))
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new Error(OPEN_ERROR)
  }
}

// Reads one line from the terminal without echoing it.
const askPassphrase = () =>
  new Promise((resolve) => {
    let muted = false
    const output = new Writable({
      write(chunk, _encoding, done) {
        if (!muted) process.stderr.write(chunk)
        done()
      },
    })
    const rl = createInterface({ input: process.stdin, output, terminal: true })
    rl.question('Passphrase: ', (answer) => {
      rl.close()
      process.stderr.write('\n')
      resolve(answer)
    })
    muted = true
  })

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const main = async () => {
  const [input, outputArg] = process.argv.slice(2)
  if (!input) fail('Usage: node scripts/db/decrypt-recovery-point.mjs <file.pwrp> [output]')
  const output = outputArg ?? input.replace(/\.pwrp$/, '')
  let passphrase = process.env.PATHWAYS_RECOVERY_PASSPHRASE
  if (passphrase === undefined) {
    if (!process.stdin.isTTY) {
      fail(
        'Set PATHWAYS_RECOVERY_PASSPHRASE or run this in a terminal to be asked for the passphrase.',
      )
    }
    passphrase = await askPassphrase()
  }
  let plain
  try {
    plain = decryptRecoveryPoint(readFileSync(input), passphrase)
  } catch (error) {
    fail(error.message === OPEN_ERROR ? OPEN_ERROR : `The input file could not be read: ${input}`)
  }
  try {
    writeFileSync(output, plain, { flag: 'wx' })
  } catch (error) {
    fail(
      error.code === 'EEXIST'
        ? `The output file already exists, nothing was written: ${output}`
        : `The output file could not be written: ${output}`,
    )
  }
  console.log(`Wrote ${output}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
