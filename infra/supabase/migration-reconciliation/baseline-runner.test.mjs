import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  assertDataInventory,
  baselineAuthorization,
  baselineDirectory,
  baselineLocalDatabase,
  baselineLocalPort,
  baselineRecoveryAuthorization,
  compareDataInventory,
  parseWriterResult,
  validateBaselineArguments,
  validateBaselineEvidence,
  validateBaselineSelection,
  validateBaselineStaging,
  validateBaselineUrl,
  verifyBaselineSources,
} from './baseline-config.mjs'
import { migrations, root } from './config.mjs'

test('accepts only the exact local, check and separately authorized apply forms', () => {
  assert.deepEqual(validateBaselineArguments(['--local']), { mode: 'local' })
  assert.deepEqual(validateBaselineArguments(['--check-dev']), { mode: 'check-dev' })
  assert.deepEqual(
    validateBaselineArguments([
      '--apply-dev',
      `--authorization=${baselineAuthorization}`,
      '--backup-restore-confirmed',
      '--maintenance-confirmed',
    ]),
    { mode: 'apply-dev' },
  )
  assert.throws(() => validateBaselineArguments(['--apply-dev']), /BASELINE_ARGUMENTS/)
  assert.throws(
    () =>
      validateBaselineArguments([
        '--apply-dev',
        `--authorization=${baselineAuthorization}`,
        '--maintenance-confirmed',
        '--backup-restore-confirmed',
      ]),
    /BASELINE_ARGUMENTS/,
  )
  assert.deepEqual(
    validateBaselineArguments([
      '--recover-dev',
      '--evidence=.tmp/pathways-baseline-Ab12',
      `--authorization=${baselineRecoveryAuthorization}`,
    ]),
    { mode: 'recover-dev', evidence: '.tmp/pathways-baseline-Ab12' },
  )
  assert.throws(() =>
    validateBaselineArguments([
      '--recover-dev',
      '--evidence=../outside',
      `--authorization=${baselineRecoveryAuthorization}`,
    ]),
  )
})

test('permits only the exact 0002-0005 order and refuses later migrations', () => {
  for (let prefix = 1; prefix <= 4; prefix++) {
    assert.deepEqual(validateBaselineSelection(migrations[prefix][0], prefix), migrations[prefix])
  }
  assert.throws(
    () => validateBaselineSelection('0003_pathways_projects_collection', 1),
    /BASELINE_SEQUENCE/,
  )
  assert.throws(
    () => validateBaselineSelection('0006_auth_session_liveness', 4),
    /BASELINE_SEQUENCE/,
  )
  assert.throws(() => validateBaselineSelection(migrations[4][0], 5), /BASELINE_LEDGER_PREFIX/)
})

test('admits only the exact isolated local and protected hosted targets', () => {
  const local = `postgresql://postgres@127.0.0.1:${baselineLocalPort}/${baselineLocalDatabase}?sslmode=disable&connection_limit=1`
  assert.equal(validateBaselineUrl(local, 'local'), local)
  assert.throws(() => validateBaselineUrl(local.replace('127.0.0.1', 'localhost'), 'local'))
  const hosted =
    'postgresql://postgres.pdqwsknbzkdtiwjjibqt:synthetic@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=1'
  assert.equal(validateBaselineUrl(hosted, 'hosted'), hosted)
  assert.throws(() =>
    validateBaselineUrl(hosted.replace('connection_limit=1', 'connection_limit=2'), 'hosted'),
  )
})

test('staging requires immutable 0001-0005 only and refuses 0006', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-baseline-'))
  const staged = path.join(evidence, 'migrations')
  fs.mkdirSync(staged)
  try {
    const source = path.join(root, 'apps/api/prisma/migrations')
    for (const [name] of migrations) {
      fs.cpSync(path.join(source, name), path.join(staged, name), { recursive: true })
    }
    fs.copyFileSync(
      path.join(source, 'migration_lock.toml'),
      path.join(staged, 'migration_lock.toml'),
    )
    assert.equal(validateBaselineStaging(staged), fs.realpathSync(staged))
    fs.cpSync(
      path.join(source, '0006_auth_session_liveness'),
      path.join(staged, '0006_auth_session_liveness'),
      { recursive: true },
    )
    assert.throws(() => validateBaselineStaging(staged), /BASELINE_STAGING_CONTENTS/)
  } finally {
    const resolved = path.resolve(evidence)
    assert.equal(path.dirname(resolved), fs.realpathSync(path.join(root, '.tmp')))
    assert.match(path.basename(resolved), /^pathways-baseline-[A-Za-z0-9]+$/)
    fs.rmSync(resolved, { recursive: true })
  }
})

test('recovery evidence accepts only a real non-symlink baseline directory', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-baseline-'))
  try {
    const relative = path.relative(root, evidence).replaceAll('\\', '/')
    assert.equal(validateBaselineEvidence(relative), fs.realpathSync(evidence))
    assert.throws(() => validateBaselineEvidence('../outside'), /BASELINE_EVIDENCE_PATH/)
  } finally {
    fs.rmSync(evidence, { recursive: true })
  }
})

test('data comparison is exact and excludes the Prisma ledger', () => {
  const rows = [{ key: 'pathways.synthetic', rows: 1, sha256: 'a'.repeat(64) }]
  assert.equal(assertDataInventory(rows, 1), rows)
  compareDataInventory(rows, structuredClone(rows))
  assert.throws(
    () => compareDataInventory(rows, [{ ...rows[0], rows: 2 }]),
    /BASELINE_DATA_CHANGED/,
  )
  assert.throws(
    () => assertDataInventory([{ ...rows[0], key: 'public._prisma_migrations' }], 1),
    /BASELINE_DATA_SHAPE/,
  )
})

test('writer result accepts only bounded sanitized outcomes', () => {
  assert.deepEqual(parseWriterResult('{"status":"PASS","migration":"0002_pathways_foundation"}'), {
    status: 'PASS',
    migration: '0002_pathways_foundation',
  })
  assert.throws(
    () =>
      parseWriterResult(
        '{"status":"FAILED","migration":"0002_pathways_foundation","url":"postgresql://hidden"}',
      ),
    /BASELINE_WRITER_OUTPUT/,
  )
})

test('reviewed sources are pinned and commands remain narrowly scoped', () => {
  verifyBaselineSources()
  const runner = fs.readFileSync(path.join(baselineDirectory, 'baseline-runner.mjs'), 'utf8')
  const writer = fs.readFileSync(path.join(baselineDirectory, 'Write-DevBaseline.ps1'), 'utf8')
  const reader = fs.readFileSync(path.join(baselineDirectory, 'Read-DevBaseline.ps1'), 'utf8')
  assert.match(runner, /migrate', 'resolve', '--applied'/)
  assert.doesNotMatch(`${runner}\n${writer}`, /migrate (deploy|dev|reset)|db push|--rolled-back/)
  assert.match(writer, /PATHWAYS_DEV_BASELINE_0002_0005_ONLY/)
  assert.match(writer, /UNCERTAIN/)
  assert.match(reader, /default_transaction_read_only=on/)
  assert.doesNotMatch(reader, /param\([^)]*string/i)
})
