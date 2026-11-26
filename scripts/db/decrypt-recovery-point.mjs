// Opens an encrypted recovery point, with the PWRP1 and PWRP2 formats copied from the API's recovery-point-encryption.ts to run standalone.
import { createDecipheriv, scryptSync } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const MAGIC_V1 = Buffer.from('PWRP1', 'latin1')
const MAGIC_V2 = Buffer.from('PWRP2', 'latin1')
const MAGIC_LENGTH = 5
const SALT_LENGTH = 16
const NONCE_LENGTH = 12
const TAG_LENGTH = 16
const MIN_LOG_N = 15
const MAX_LOG_N = 20
const OPEN_ERROR = 'The file could not be opened. Check the passphrase.'

export const decryptRecoveryPoint = (file, passphrase) => {
  const magic = file.subarray(0, MAGIC_LENGTH)
  const isV2 = magic.equals(MAGIC_V2)
  if (!isV2 && !magic.equals(MAGIC_V1)) throw new Error(OPEN_ERROR)
  const logN = isV2 ? (file[MAGIC_LENGTH] ?? 0) : MIN_LOG_N
  const start = MAGIC_LENGTH + (isV2 ? 1 : 0)
  if (file.length < start + SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH) throw new Error(OPEN_ERROR)
  if (logN < MIN_LOG_N || logN > MAX_LOG_N) throw new Error(OPEN_ERROR)
  const salt = file.subarray(start, start + SALT_LENGTH)
  const nonce = file.subarray(start + SALT_LENGTH, start + SALT_LENGTH + NONCE_LENGTH)
  const body = file.subarray(start + SALT_LENGTH + NONCE_LENGTH, file.length - TAG_LENGTH)
  try {
    // The default 32 MiB scrypt limit refuses these costs, so the limit is raised to 130 * N * r bytes.
    const N = 2 ** logN
    const key = scryptSync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), salt, 32, {
      N,
      r: 8,
      p: 1,
      maxmem: 130 * N * 8,
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
    let answered = false
    const output = new Writable({
      write(chunk, _encoding, done) {
        if (!muted) process.stderr.write(chunk)
        done()
      },
    })
    const rl = createInterface({ input: process.stdin, output, terminal: true })
    // Ctrl+C, Ctrl+D or a closed input closes the prompt without an answer.
    rl.on('close', () => {
      if (answered) return
      process.stderr.write('\n')
      fail('No passphrase was entered.')
    })
    rl.question('Passphrase: ', (answer) => {
      answered = true
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
  if (!outputArg && !input.endsWith('.pwrp')) {
    fail('Give an output file name: the input does not end in .pwrp.')
  }
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
