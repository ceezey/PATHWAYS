import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const pgBin = 'C:/Program Files/PostgreSQL/18/bin'
export const localPort = 55450
export const localDatabase = 'pathways_phase4_reconciliation'
export const hosted = Object.freeze({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: '5432',
  user: 'postgres.pdqwsknbzkdtiwjjibqt',
  database: 'postgres',
})
export const migrations = Object.freeze(
  [
    ['0001_init', '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab'],
    [
      '0002_pathways_foundation',
      'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2',
    ],
    [
      '0003_pathways_projects_collection',
      '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b',
    ],
    [
      '0004_pathways_finance_evaluation_decisions',
      '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b',
    ],
    [
      '0005_supabase_security_adapter',
      '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc',
    ],
  ].map((entry) => Object.freeze(entry)),
)

export function requireCheck(condition, code) {
  if (!condition) throw new Error(code)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function verifySources() {
  for (const [name, expected] of migrations) {
    const source = fs.readFileSync(
      path.join(root, 'apps/api/prisma/migrations', name, 'migration.sql'),
    )
    requireCheck(sha256(source) === expected, 'SOURCE_CHECKSUM')
  }
}

// No inherited .env, database options, credentials, Node preload or Prisma
// override is admitted to a local child. This does not change the parent env.
export function cleanEnvironment(input = process.env) {
  /** @type {NodeJS.ProcessEnv} */
  const result = {}
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    const actual = Object.keys(input).find(
      (candidate) => candidate.toLowerCase() === key.toLowerCase(),
    )
    if (actual) result[key] = input[actual]
  }
  return result
}

export function validateLocalUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('LOCAL_TARGET')
  }
  requireCheck(
    url.protocol === 'postgresql:' &&
      url.hostname === '127.0.0.1' &&
      url.port === String(localPort) &&
      url.pathname === `/${localDatabase}` &&
      ['prisma', 'postgres'].includes(url.username) &&
      url.password === '' &&
      url.hash === '' &&
      url.search === '?sslmode=disable&connection_limit=1',
    'LOCAL_TARGET',
  )
  return value
}

export function validateStaging(directory) {
  const resolved = fs.realpathSync(directory)
  const parent = fs.realpathSync(path.dirname(resolved))
  requireCheck(
    path.dirname(parent) === fs.realpathSync(path.join(root, '.tmp')) &&
      /^pathways-reconcile-[A-Za-z0-9]+$/.test(path.basename(parent)) &&
      path.basename(resolved) === 'migrations' &&
      !fs.lstatSync(directory).isSymbolicLink(),
    'STAGING_PATH',
  )
  const names = fs.readdirSync(resolved).sort()
  const expected = migrations.slice(0, names.length - 1).map(([name]) => name)
  requireCheck(
    [5, 6].includes(names.length) &&
      JSON.stringify(names) === JSON.stringify([...expected, 'migration_lock.toml']),
    'STAGING_CONTENTS',
  )
  for (const [name, hash] of migrations.slice(0, expected.length)) {
    const folder = path.join(resolved, name)
    const file = path.join(folder, 'migration.sql')
    requireCheck(
      !fs.lstatSync(folder).isSymbolicLink() &&
        !fs.lstatSync(file).isSymbolicLink() &&
        JSON.stringify(fs.readdirSync(folder)) === '["migration.sql"]' &&
        sha256(fs.readFileSync(file)) === hash,
      'STAGING_CHECKSUM',
    )
  }
  requireCheck(
    sha256(fs.readFileSync(path.join(resolved, 'migration_lock.toml'))) ===
      '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48',
    'STAGING_LOCK',
  )
  return resolved
}

export function assertLedger(rows, length) {
  requireCheck(Array.isArray(rows) && rows.length === length, 'LEDGER_PREFIX')
  for (let i = 0; i < length; i++) {
    const row = rows[i]
    requireCheck(
      row.name === migrations[i][0] &&
        row.checksum === migrations[i][1] &&
        row.finished === true &&
        row.rolledBack === false &&
        row.failureLog === false &&
        Number.isInteger(row.steps) &&
        row.steps >= 0,
      'LEDGER_PREFIX',
    )
  }
}

export function compareObjects(canonical, observed) {
  const expected = new Map(canonical.map((row) => [row.key, row.fingerprint]))
  const actual = new Map(observed.map((row) => [row.key, row.fingerprint]))
  requireCheck(
    expected.size === canonical.length && actual.size === observed.length,
    'DUPLICATE_OBJECT',
  )
  const differences = []
  for (const [key, fingerprint] of expected) {
    if (!actual.has(key)) differences.push({ key, kind: 'missing' })
    else if (actual.get(key) !== fingerprint) differences.push({ key, kind: 'different' })
  }
  // Unknown live names may themselves contain sensitive text. Report their
  // fingerprint only, never raw object definitions or arbitrary identifiers.
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      const knownExtra = [
        'function:public.pathways_prevent_audit_mutation()',
        'function-acl:public.pathways_prevent_audit_mutation()',
      ].includes(key)
      differences.push({ key: knownExtra ? key : `unknown:${sha256(key)}`, kind: 'extra' })
    }
  }
  return differences
}
