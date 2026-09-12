import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hosted, migrations, requireCheck, root, sha256, verifySources } from './config.mjs'

export const baselineAuthorization = 'PATHWAYS_DEV_BASELINE_0002_0005_ONLY'
export const baselineRecoveryAuthorization = 'PATHWAYS_DEV_BASELINE_RECOVERY_READ_ONLY'
export const baselineLocalPort = 55456
export const baselineLocalDatabase = 'pathways_baseline_local'
export const baselineMigrations = Object.freeze(migrations.slice(1, 5))
export const canonicalObjectCount = 1193
export const canonicalVectorSha256 =
  '36d404835e94e8fd4bf94afd4688d15b5292eba451ef237ae6229309cf989777'
export const expectedHostedDataTables = 54
export const baselineDirectory = path.join(root, 'infra/supabase/migration-reconciliation')

// Filled only with reviewed, non-secret source fingerprints. This object is
// deliberately outside the files it fingerprints so there is no hash cycle.
export const baselineSourceHashes = Object.freeze({
  'baseline-data-inventory.sql': '962507c1907ed6ab0786d6efed8b4b0ecfa6b678ed830ec96e307d01af868fcb',
  'prisma.baseline.config.ts': '0d092aa934c0031688fde628cf8591073b2a415ca2669251cf05c99dbbef0336',
  'Read-DevBaseline.ps1': 'cd72f26e4317190aa7ca7b6cfd3bbda236f4386c49fb093182620dde955492d7',
  'Write-DevBaseline.ps1': '2ba91d8738123c315e8dd0711162a80e6e898139c4b6b7b43f800454debeaad3',
})

export function baselineVectorHash(objects) {
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex')
}

export function verifyBaselineSources() {
  verifySources()
  for (const [name, expected] of Object.entries(baselineSourceHashes)) {
    requireCheck(/^[0-9a-f]{64}$/.test(expected), 'BASELINE_SOURCE_UNPINNED')
    requireCheck(
      sha256(fs.readFileSync(path.join(baselineDirectory, name))) === expected,
      'BASELINE_SOURCE_CHECKSUM',
    )
  }
}

export function expectedBaselineMigration(prefixLength) {
  requireCheck(
    Number.isInteger(prefixLength) && prefixLength >= 1 && prefixLength <= 4,
    'BASELINE_LEDGER_PREFIX',
  )
  return migrations[prefixLength]
}

export function validateBaselineSelection(name, prefixLength) {
  const expected = expectedBaselineMigration(prefixLength)
  requireCheck(
    baselineMigrations.some(([candidate]) => candidate === name) && name === expected[0],
    'BASELINE_SEQUENCE',
  )
  return expected
}

export function validateBaselineArguments(argv) {
  if (argv.length === 1 && ['--local', '--check-dev'].includes(argv[0])) {
    return { mode: argv[0].slice(2) }
  }
  if (
    argv.length === 3 &&
    argv[0] === '--recover-dev' &&
    /^--evidence=\.tmp\/pathways-baseline-[A-Za-z0-9]+$/.test(argv[1]) &&
    argv[2] === `--authorization=${baselineRecoveryAuthorization}`
  ) {
    return { mode: 'recover-dev', evidence: argv[1].slice('--evidence='.length) }
  }
  const exact = [
    '--apply-dev',
    `--authorization=${baselineAuthorization}`,
    '--backup-restore-confirmed',
    '--maintenance-confirmed',
  ]
  requireCheck(JSON.stringify(argv) === JSON.stringify(exact), 'BASELINE_ARGUMENTS')
  return { mode: 'apply-dev' }
}

export function validateBaselineEvidence(relativePath) {
  requireCheck(
    /^\.tmp\/pathways-baseline-[A-Za-z0-9]+$/.test(relativePath),
    'BASELINE_EVIDENCE_PATH',
  )
  const resolved = fs.realpathSync(path.join(root, relativePath))
  requireCheck(
    path.dirname(resolved) === fs.realpathSync(path.join(root, '.tmp')) &&
      /^pathways-baseline-[A-Za-z0-9]+$/.test(path.basename(resolved)) &&
      !fs.lstatSync(resolved).isSymbolicLink(),
    'BASELINE_EVIDENCE_PATH',
  )
  return resolved
}

export function validateBaselineUrl(value, mode) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('BASELINE_TARGET')
  }
  const common =
    url.protocol === 'postgresql:' &&
    url.hash === '' &&
    url.search === '?sslmode=require&connection_limit=1'
  if (mode === 'local') {
    requireCheck(
      url.protocol === 'postgresql:' &&
        url.hostname === '127.0.0.1' &&
        url.port === String(baselineLocalPort) &&
        url.pathname === `/${baselineLocalDatabase}` &&
        url.username === 'postgres' &&
        url.password === '' &&
        url.hash === '' &&
        url.search === '?sslmode=disable&connection_limit=1',
      'BASELINE_TARGET',
    )
  } else {
    requireCheck(
      mode === 'hosted' &&
        common &&
        url.hostname === hosted.host &&
        url.port === hosted.port &&
        url.pathname === `/${hosted.database}` &&
        decodeURIComponent(url.username) === hosted.user &&
        url.password.length > 0,
      'BASELINE_TARGET',
    )
  }
  return value
}

export function validateBaselineStaging(directory) {
  const resolved = fs.realpathSync(directory)
  const parent = fs.realpathSync(path.dirname(resolved))
  requireCheck(
    path.dirname(parent) === fs.realpathSync(path.join(root, '.tmp')) &&
      /^pathways-baseline-[A-Za-z0-9]+$/.test(path.basename(parent)) &&
      path.basename(resolved) === 'migrations' &&
      !fs.lstatSync(directory).isSymbolicLink(),
    'BASELINE_STAGING_PATH',
  )
  const names = fs.readdirSync(resolved).sort()
  requireCheck(
    JSON.stringify(names) ===
      JSON.stringify([...migrations.map(([name]) => name), 'migration_lock.toml']),
    'BASELINE_STAGING_CONTENTS',
  )
  for (const [name, expected] of migrations) {
    const folder = path.join(resolved, name)
    const file = path.join(folder, 'migration.sql')
    requireCheck(
      !fs.lstatSync(folder).isSymbolicLink() &&
        !fs.lstatSync(file).isSymbolicLink() &&
        JSON.stringify(fs.readdirSync(folder)) === '["migration.sql"]' &&
        sha256(fs.readFileSync(file)) === expected,
      'BASELINE_STAGING_CHECKSUM',
    )
  }
  requireCheck(
    sha256(fs.readFileSync(path.join(resolved, 'migration_lock.toml'))) ===
      '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48',
    'BASELINE_STAGING_LOCK',
  )
  return resolved
}

export function assertDataInventory(rows, expectedCount = expectedHostedDataTables) {
  requireCheck(Array.isArray(rows) && rows.length === expectedCount, 'BASELINE_DATA_COUNT')
  const keys = new Set()
  for (const row of rows) {
    requireCheck(
      typeof row.key === 'string' &&
        /^(public|pathways)\..{1,63}$/u.test(row.key) &&
        !/\p{Cc}/u.test(row.key) &&
        row.key !== 'public._prisma_migrations' &&
        Number.isSafeInteger(Number(row.rows)) &&
        Number(row.rows) >= 0 &&
        /^[0-9a-f]{64}$/.test(row.sha256),
      'BASELINE_DATA_SHAPE',
    )
    requireCheck(!keys.has(row.key), 'BASELINE_DATA_DUPLICATE')
    keys.add(row.key)
  }
  return rows
}

export function compareDataInventory(expected, observed) {
  assertDataInventory(observed, expected.length)
  requireCheck(JSON.stringify(expected) === JSON.stringify(observed), 'BASELINE_DATA_CHANGED')
}

export function parseWriterResult(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '')
  } catch {
    throw new Error('BASELINE_WRITER_OUTPUT')
  }
  requireCheck(
    ['PASS', 'FAILED', 'UNCERTAIN'].includes(parsed.status) &&
      baselineMigrations.some(([name]) => name === parsed.migration) &&
      !JSON.stringify(parsed).match(/postgresql:|password|token|cookie|uuid/i),
    'BASELINE_WRITER_OUTPUT',
  )
  return parsed
}
