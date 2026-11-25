// Copies stored files that are not yet offsite to R2, each encrypted with age; never deletes.
// shortcut: a file replaced in place under the same name is not copied again, upgrade to an eTag compare if uploads ever reuse names.
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const LIST_LIMIT = 256 * 1024 * 1024

// A failed command's own message repeats its arguments, which can hold the database URL, so it is replaced.
async function run(what, command, args) {
  try {
    return await execFileAsync(command, args, { maxBuffer: LIST_LIMIT })
  } catch (error) {
    throw new Error(`${what} failed (exit ${error.code ?? 'unknown'}).`)
  }
}

export function assertRecipient(recipient) {
  if (typeof recipient !== 'string' || !/^age1[0-9a-z]+$/.test(recipient))
    throw new Error('The backup recipient must be one age public key (age1...).')
}

export const offsiteKey = ({ bucket, name }) => `files/${bucket}/${name}.age`

export const objectUrl = (supabaseUrl, { bucket, name }) =>
  `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split('/').map(encodeURIComponent).join('/')}`

export async function copyNewFiles({ recipient, listStored, listOffsite, copyOne }) {
  // Checked first, so nothing is read when it could not be encrypted.
  assertRecipient(recipient)
  const [stored, offsite] = [await listStored(), await listOffsite()]
  const result = { copied: 0, skipped: 0, failed: 0 }
  for (const object of stored) {
    const key = offsiteKey(object)
    if (offsite.has(key)) {
      result.skipped += 1
      continue
    }
    try {
      await copyOne(object, key)
      result.copied += 1
    } catch (error) {
      result.failed += 1
      // Workflow logs are public, so the object name is never printed.
      console.error(`A file in bucket ${object.bucket} was not copied: ${error.message}`)
    }
  }
  return result
}

// The age and aws commands can be replaced so a test runs this without the real tools.
export function makeCopyOne({
  supabaseUrl,
  serviceKey,
  recipient,
  bucket,
  endpoint,
  fetchFile = fetch,
  age = ['age'],
  aws = ['aws'],
}) {
  return async (object, key) => {
    const response = await fetchFile(objectUrl(supabaseUrl, object), {
      headers: { authorization: `Bearer ${serviceKey}` },
    })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`download answered ${response.status}`)
    }
    // Encrypted to a local file first, so a broken download never leaves a cut-off object offsite.
    const encrypted = path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'offsite-file.age')
    try {
      const child = spawn(age[0], [...age.slice(1), '-r', recipient, '-o', encrypted], {
        stdio: ['pipe', 'inherit', 'inherit'],
      })
      const [, [code]] = await Promise.all([
        pipeline(Readable.fromWeb(response.body), child.stdin),
        once(child, 'close'),
      ])
      if (code !== 0) throw new Error(`age exited with ${code}`)
      const target = [encrypted, `s3://${bucket}/${key}`, '--endpoint-url', endpoint]
      await run('The upload', aws[0], [
        ...aws.slice(1),
        's3',
        'cp',
        ...target,
        '--only-show-errors',
      ])
    } finally {
      await rm(encrypted, { force: true })
    }
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

async function main() {
  const recipient = process.env.BACKUP_AGE_RECIPIENT
  const databaseUrl = required('BACKUP_DATABASE_URL')
  const supabaseUrl = required('SUPABASE_URL')
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
  const endpoint = required('R2_ENDPOINT')
  const bucket = required('R2_BUCKET')

  const listStored = async () => {
    const sql = `select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name) order by bucket_id, name), '[]') from storage.objects`
    const { stdout } = await run('Listing stored files', 'psql', [
      databaseUrl,
      '-X',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ])
    return JSON.parse(stdout)
  }

  const listOffsite = async () => {
    const { stdout } = await run('Listing offsite files', 'aws', [
      's3api',
      'list-objects-v2',
      '--bucket',
      bucket,
      '--prefix',
      'files/',
      '--endpoint-url',
      endpoint,
      '--query',
      'Contents[].Key',
      '--output',
      'json',
    ])
    return new Set(JSON.parse(stdout) ?? [])
  }

  const copyOne = makeCopyOne({ supabaseUrl, serviceKey, recipient, bucket, endpoint })

  const result = await copyNewFiles({ recipient, listStored, listOffsite, copyOne })
  console.log(
    `Stored files: ${result.copied} copied, ${result.skipped} already offsite, ${result.failed} failed.`,
  )
  if (result.failed > 0) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
