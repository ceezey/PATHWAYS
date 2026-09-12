import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import {
  dataInventoryFingerprint,
  deployAuthorization,
  directory,
  migrations,
  parseWriterResult,
  privateEvidenceRecord,
  publicEvidenceRecord,
  readRecoveryEvidence,
  recoveryAuthorization,
  rollbackAuthorization,
  root,
  stageMigrations,
  validateArguments,
  validateEvidence,
  validateStaging,
  verifySources,
} from './deployment-config.mjs'
import { checkStartup } from './startup-check.mjs'

function syntheticData() {
  return Array.from({ length: 54 }, (_, index) => ({
    key: `public.synthetic_${String(index).padStart(2, '0')}`,
    rows: index,
    sha256: index.toString(16).padStart(64, '0'),
  }))
}

test('installed Prisma 6.19.2 needs classic engine to retain the datasource override', () => {
  const api = createRequire(path.join(root, 'apps/api/package.json'))
  assert.equal(api('prisma/package.json').version, '6.19.2')
  const { defineConfig } = api('prisma/config')
  const syntheticUrl = new URL('postgresql://127.0.0.1:1/synthetic').href
  const missingEngine = defineConfig({ datasource: { url: syntheticUrl } })
  assert.equal(missingEngine.datasource, undefined)
  const classic = defineConfig({ engine: 'classic', datasource: { url: syntheticUrl } })
  assert.equal(classic.engine, 'classic')
  assert.equal(classic.datasource.url, syntheticUrl)
})

test('the actual deployment config loads with the writer runtime and synthetic input only', () => {
  const result = checkStartup()
  assert.deepEqual(result, {
    status: 'PASS',
    failure: 'NONE',
    installedPrismaExact: true,
    configLoaded: true,
    engineClassic: true,
    datasourceOverrideExact: true,
    pathsExact: true,
    networkCalls: 0,
    childCalls: 0,
    localCleanup: true,
  })
})

for (const [variant, expected] of [
  ['missing-stage', 'CONFIG_ENV_MISSING'],
  ['missing-url', 'CONFIG_ENV_MISSING'],
  ['outside-stage', 'CONFIG_STAGE_REJECTED'],
]) {
  test(`offline startup rejects ${variant} and removes only its scratch directory`, () => {
    const result = checkStartup(variant)
    assert.equal(result.status, 'FAILED')
    assert.equal(result.failure, expected)
    assert.equal(result.networkCalls, 0)
    assert.equal(result.childCalls, 0)
    assert.equal(result.localCleanup, true)
    assert.doesNotMatch(
      JSON.stringify(result),
      /postgresql:|password|cookie|bearer|synthetic|C:\\/i,
    )
  })
}

test('startup fixtures reject unknown modes and do not run the Prisma CLI', () => {
  assert.throws(() => checkStartup('deploy'), /STARTUP_VARIANT_REFUSED/)
  const checker = fs.readFileSync(path.join(directory, 'startup-check.mjs'), 'utf8')
  assert.doesNotMatch(checker, /migrate deploy|Import-Clixml|dev-db-admin/)
  const runner = fs.readFileSync(path.join(directory, 'deployment-runner.mjs'), 'utf8')
  const mutation = runner.slice(runner.indexOf('function runMutation('))
  assert.ok(mutation.indexOf('checkStartup()') < mutation.indexOf('readHosted()'))
})

test('accepts only exact local, check, deploy, rollback and recovery arguments', () => {
  assert.deepEqual(validateArguments(['--local']), { mode: 'local' })
  assert.deepEqual(validateArguments(['--check-dev']), { mode: 'check-dev' })
  assert.deepEqual(
    validateArguments([
      '--apply-dev',
      `--authorization=${deployAuthorization}`,
      '--backup-restore-confirmed',
      '--maintenance-confirmed',
    ]),
    { mode: 'apply-dev' },
  )
  assert.deepEqual(
    validateArguments([
      '--rollback-dev',
      `--authorization=${rollbackAuthorization}`,
      '--recovery-authorized',
      '--maintenance-confirmed',
    ]),
    { mode: 'rollback-dev' },
  )
  assert.deepEqual(
    validateArguments([
      '--recover-dev',
      '--evidence=.tmp/pathways-session-liveness-Ab12',
      `--authorization=${recoveryAuthorization}`,
    ]),
    { mode: 'recover-dev', evidence: '.tmp/pathways-session-liveness-Ab12' },
  )
  for (const invalid of [
    [],
    ['--apply-dev'],
    [
      '--apply-dev',
      `--authorization=${deployAuthorization}`,
      '--maintenance-confirmed',
      '--backup-restore-confirmed',
    ],
    [
      '--rollback-dev',
      `--authorization=${deployAuthorization}`,
      '--recovery-authorized',
      '--maintenance-confirmed',
    ],
    ['--recover-dev', '--evidence=../outside', `--authorization=${recoveryAuthorization}`],
  ]) {
    assert.throws(() => validateArguments(invalid), /LIVENESS_ARGUMENTS/)
  }
})

test('source guard requires the exact six-migration history and reviewed fingerprints', () => {
  verifySources()
  assert.deepEqual(
    fs
      .readdirSync(path.join(root, 'apps/api/prisma/migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    migrations.map(([name]) => name),
  )
  assert.equal(
    fs.existsSync(
      path.join(root, 'apps/api/prisma/migrations/0006_retire_legacy_public_application_tables'),
    ),
    false,
  )
})

test('staging contains only immutable 0001-0006 and rejects additions or drift', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  try {
    const staged = stageMigrations(evidence)
    assert.equal(validateStaging(staged), fs.realpathSync(staged))
    fs.writeFileSync(path.join(staged, '0007_unreviewed'), 'blocked')
    assert.throws(() => validateStaging(staged), /LIVENESS_STAGING_CONTENTS/)
    fs.rmSync(path.join(staged, '0007_unreviewed'))
    fs.appendFileSync(path.join(staged, migrations[5][0], 'migration.sql'), '\n-- drift')
    assert.throws(() => validateStaging(staged), /LIVENESS_STAGING_CHECKSUM/)
  } finally {
    fs.rmSync(evidence, { recursive: true })
  }
})

test('recovery evidence accepts only a real task-owned directory', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  try {
    const relative = path.relative(root, evidence).replaceAll('\\', '/')
    assert.equal(validateEvidence(relative), fs.realpathSync(evidence))
    assert.throws(() => validateEvidence('../outside'), /LIVENESS_EVIDENCE_PATH/)
  } finally {
    fs.rmSync(evidence, { recursive: true })
  }
})

test('writer results are bounded and cannot carry secrets or identifiers', () => {
  assert.deepEqual(
    parseWriterResult('{"status":"PASS","action":"Deploy","outcome":"CHILD_EXIT_ZERO"}'),
    {
      status: 'PASS',
      action: 'Deploy',
      outcome: 'CHILD_EXIT_ZERO',
    },
  )
  assert.deepEqual(
    parseWriterResult(
      '{"status":"UNCERTAIN","action":"Rollback","outcome":"CHILD_TIMEOUT","processId":123}',
    ),
    { status: 'UNCERTAIN', action: 'Rollback', outcome: 'CHILD_TIMEOUT', processId: 123 },
  )
  assert.deepEqual(
    parseWriterResult(
      '{"status":"UNCERTAIN","action":"Deploy","outcome":"CHILD_NONZERO_EXIT","childExitCode":1}',
    ),
    {
      status: 'UNCERTAIN',
      action: 'Deploy',
      outcome: 'CHILD_NONZERO_EXIT',
      childExitCode: 1,
    },
  )
  assert.throws(
    () =>
      parseWriterResult(
        '{"status":"FAILED","action":"Deploy","outcome":"GUARD_REJECTED","url":"postgresql://hidden"}',
      ),
    /LIVENESS_WRITER_OUTPUT/,
  )
  assert.throws(
    () =>
      parseWriterResult(
        '{"status":"PASS","action":"Deploy","outcome":"CHILD_NONZERO_EXIT","childExitCode":1}',
      ),
    /LIVENESS_WRITER_OUTPUT/,
  )
})

test('data evidence is deterministic, domain-separated and private in public results', () => {
  const rows = syntheticData()
  const fingerprint = dataInventoryFingerprint(rows)
  assert.match(fingerprint, /^[0-9a-f]{64}$/)
  assert.equal(dataInventoryFingerprint([...rows].reverse()), fingerprint)
  assert.notEqual(
    dataInventoryFingerprint(rows.map((row, index) => (index === 0 ? { ...row, rows: 1 } : row))),
    fingerprint,
  )
  const record = privateEvidenceRecord(
    {
      status: 'UNCERTAIN',
      mode: 'apply-dev',
      stage: 'deploy',
      initialLedgerPrefix: 5,
      canonicalObjects: 1193,
      dataTablesVerified: 54,
      hostedConnections: 1,
      hostedWriteAttempts: 1,
      recoveryRequired: true,
      writerOutcome: 'CHILD_NONZERO_EXIT',
      childExitCode: 1,
    },
    fingerprint,
  )
  assert.equal(record.preflightDataFingerprint, fingerprint)
  const publicRecord = publicEvidenceRecord(record)
  assert.equal('preflightDataFingerprint' in publicRecord, false)
  assert.doesNotMatch(JSON.stringify(publicRecord), new RegExp(fingerprint))
  assert.throws(
    () => publicEvidenceRecord({ ...record, rawOutput: 'private' }),
    /LIVENESS_EVIDENCE_RECORD/,
  )
})

test('recovery evidence is versioned, exact and rejects drift', () => {
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
  const evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  const fingerprint = dataInventoryFingerprint(syntheticData())
  const record = privateEvidenceRecord(
    {
      status: 'UNCERTAIN',
      mode: 'apply-dev',
      stage: 'deploy',
      initialLedgerPrefix: 5,
      canonicalObjects: 1193,
      dataTablesVerified: 54,
      hostedConnections: 1,
      hostedWriteAttempts: 1,
      recoveryRequired: true,
      writerOutcome: 'CHILD_NONZERO_EXIT',
      childExitCode: 1,
    },
    fingerprint,
  )
  try {
    fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(record)}\n`)
    assert.deepEqual(readRecoveryEvidence(evidence), record)
    fs.writeFileSync(
      path.join(evidence, 'result.json'),
      `${JSON.stringify({ ...record, hostedWriteAttempts: 2 })}\n`,
    )
    assert.throws(() => readRecoveryEvidence(evidence), /LIVENESS_RECOVERY_EVIDENCE/)
    fs.writeFileSync(
      path.join(evidence, 'result.json'),
      `${JSON.stringify({ ...record, rawOutput: 'private' })}\n`,
    )
    assert.throws(() => readRecoveryEvidence(evidence), /LIVENESS_RECOVERY_EVIDENCE/)
  } finally {
    fs.rmSync(evidence, { recursive: true })
  }
})

test('writer and runner keep deploy, rollback and recovery boundaries separate', () => {
  const runner = fs.readFileSync(path.join(directory, 'deployment-runner.mjs'), 'utf8')
  const writer = fs.readFileSync(path.join(directory, 'Write-DevSessionLiveness.ps1'), 'utf8')
  const reader = fs.readFileSync(path.join(directory, 'Read-DevSessionLiveness.ps1'), 'utf8')
  assert.match(writer, /migrate deploy/)
  assert.match(writer, /PATHWAYS_DEV_SESSION_LIVENESS_0006_ONLY/)
  assert.match(writer, /PATHWAYS_DEV_SESSION_LIVENESS_0006_ROLLBACK_ONLY/)
  assert.match(writer, /CHILD_NONZERO_EXIT/)
  assert.match(writer, /CHILD_TIMEOUT/)
  assert.match(writer, /UNCERTAIN/)
  assert.match(reader, /REPEATABLE READ READ ONLY/)
  assert.match(runner, /preflightDataFingerprint/)
  assert.match(runner, /dataInventoryEqual/)
  assert.doesNotMatch(`${runner}\n${writer}`, /migrate (dev|reset|resolve)|db push|--rolled-back/)
  assert.doesNotMatch(runner, /correction-runner|baseline-runner|Backup-Dev/)
})
