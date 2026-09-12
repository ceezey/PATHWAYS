import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import { backupRestoreDirectory } from './backup-restore-config.mjs'
import { createIdentifierFingerprinter } from './backup-restore-local-diagnostics.mjs'
import {
  claimRootCauseAttempt,
  sanitizeRootCauseDiagnostics,
} from './backup-restore-root-cause-evidence.mjs'
import {
  baselineReproduced,
  buildRootCauseDiagnostics,
  cleanupRootCauseRetry,
  validateRootCauseRetryArguments,
  verifyRootCauseRetrySources,
} from './backup-restore-root-cause-retry.mjs'
import { classifyRootCause } from './backup-restore-root-cause.mjs'
import { cleanEnvironment, pgBin, root } from './config.mjs'

function fixture() {
  const archiveSha256 = 'a'.repeat(64)
  const fingerprint = createIdentifierFingerprinter(archiveSha256)
  const populated = [
    'public._prisma_migrations',
    'pathways.synthetic_1',
    'pathways.synthetic_2',
    'pathways.synthetic_3',
    'pathways.synthetic_4',
    'pathways.synthetic_5',
  ]
  const data = populated
    .map((key) => ({ key, rows: 1, sha256: 'b'.repeat(64) }))
    .concat(
      Array.from({ length: 49 }, (_, index) => ({
        key: `public.empty_${index}`,
        rows: 0,
        sha256: 'c'.repeat(64),
      })),
    )
  const objects = [
    { key: 'default-acl:synthetic-owner:global:f', fingerprint: 'd'.repeat(64) },
    { key: 'default-acl:synthetic-owner:global:T', fingerprint: 'e'.repeat(64) },
  ]
  const catalog = {
    objects,
    ledger: [],
    serverVersion: 170_006,
  }
  const metadata = {
    version: 1,
    target: 'PATHWAYS-dev',
    projectRef: 'pdqwsknbzkdtiwjjibqt',
    hostedWrites: 0,
    backupCompletedUtc: '2026-09-09T00:00:00.000Z',
    archiveSha256,
    archiveBytes: 1,
    archiveListSha256: 'f'.repeat(64),
    tableDataEntries: 55,
    catalogBefore: catalog,
    catalogAfter: structuredClone(catalog),
    dataBefore: data,
    dataAfter: structuredClone(data),
  }
  const checks = {
    schema: {
      fingerprints: { missing: objects.map((row) => fingerprint('catalog', row.key)) },
    },
    rowCount: { pass: true },
    rowHash: {
      fingerprints: { changed: populated.map((key) => fingerprint('data', key)) },
    },
  }
  const journal = { diagnostics: { checks } }
  const source = Array.from(
    { length: 5 },
    (_, index) =>
      `CREATE TABLE "pathways"."synthetic_${index + 1}" (\n  "id" UUID,\n  "at" TIMESTAMPTZ(3)\n);`,
  ).join('\n')
  return { metadata, journal, source }
}

test('classifies the two omissions and six hashes without returning identifiers', () => {
  const { metadata, journal, source } = fixture()
  const report = classifyRootCause(metadata, journal, '; synthetic archive metadata', source)
  assert.equal(report.defaultAcl.schemaFilterOmissionConfirmed, true)
  assert.equal(report.defaultAcl.syntheticProviderRoleCauseRejected, true)
  assert.equal(report.rowHashes.changedTables, 6)
  assert.equal(report.rowHashes.unchangedNonEmptyTables, 0)
  assert.equal(report.rowHashes.allApplicationTablesHaveTimestamptz, true)
  assert.equal(report.rowHashes.classification, 'DETERMINISTIC_HASH_CONTRACT_UNDERDETERMINED')
  const serialized = JSON.stringify(report)
  assert.doesNotMatch(serialized, /synthetic_[1-5]|_prisma_migrations|[a-f0-9]{64}/)
})

test('refuses a missing catalog entry outside the recorded global defaults', () => {
  const { metadata, journal, source } = fixture()
  metadata.catalogBefore.objects[0].key = 'relation:synthetic:unexpected'
  metadata.catalogAfter = structuredClone(metadata.catalogBefore)
  assert.throws(
    () => classifyRootCause(metadata, journal, '; synthetic archive metadata', source),
    /ROOT_CAUSE_TOKEN_RESOLUTION/,
  )
})

test('refuses an archive that claims to carry the application-owner defaults', () => {
  const { metadata, journal, source } = fixture()
  assert.throws(
    () => classifyRootCause(metadata, journal, '; DEFAULT ACL synthetic prisma', source),
    /ROOT_CAUSE_DEFAULT_ACL_UNCERTAIN/,
  )
})

test('refuses a changed zero-row table', () => {
  const { metadata, journal, source } = fixture()
  metadata.dataBefore[0].rows = 0
  metadata.dataAfter = structuredClone(metadata.dataBefore)
  assert.throws(
    () => classifyRootCause(metadata, journal, '; synthetic archive metadata', source),
    /ROOT_CAUSE_DATA_SHAPE_UNCERTAIN/,
  )
})

test('legacy inventory is timezone-unpinned and diagnostic inventory pins UTC', () => {
  const legacy = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-data-inventory.sql'),
    'utf8',
  )
  const diagnostic = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-data-inventory-utc.sql'),
    'utf8',
  )
  assert.doesNotMatch(legacy, /SET LOCAL timezone/i)
  assert.match(diagnostic, /SET LOCAL timezone = 'UTC'/)
  assert.equal(
    legacy.replace(
      'SET LOCAL search_path = pg_catalog;',
      "SET LOCAL search_path = pg_catalog;\nSET LOCAL timezone = 'UTC';",
    ),
    diagnostic.replace(
      /-- Diagnostic companion[\s\S]*?\n\\set ON_ERROR_STOP on/,
      '-- Read-only row-count and deterministic row-fingerprint inventory for every\n-- application table in public/pathways. The protected wrappers capture this\n-- output privately; no row value is returned or written to repository files.\n\\set ON_ERROR_STOP on',
    ),
  )
})

function passingOutcome() {
  return {
    evaluated: true,
    pass: true,
    missing: 0,
    extra: 0,
    changed: 0,
  }
}

function baselineDiagnostics() {
  const checks = Object.fromEntries(
    [
      'schema',
      'rowCount',
      'rowHash',
      'migrationLedger',
      'ownership',
      'acl',
      'rls',
      'policies',
      'triggers',
      'requiredExtensions',
      'catalogSafety',
    ].map((name) => [name, passingOutcome()]),
  )
  checks.schema = { ...passingOutcome(), pass: false, missing: 2 }
  checks.acl = { ...passingOutcome(), pass: false, missing: 2 }
  checks.rowHash = { ...passingOutcome(), pass: false, changed: 6 }
  return { version: 2, allPassed: false, checks }
}

function controlledDiagnostics() {
  const baseline = baselineDiagnostics()
  return {
    version: 2,
    allPassed: true,
    checks: Object.fromEntries(
      Object.keys(baseline.checks).map((name) => [name, passingOutcome()]),
    ),
  }
}

test('V3 retry arguments are exact and old authorizations are rejected', () => {
  assert.equal(
    validateRootCauseRetryArguments([
      '--restore-existing',
      '--backup-id=PATHWAYS-dev-pre-correction-20260908-205627',
      '--authorization=PATHWAYS_DEV_LOCAL_ROOT_CAUSE_RETRY_V3',
    ]),
    '--restore-existing',
  )
  assert.throws(
    () =>
      validateRootCauseRetryArguments([
        '--restore-existing',
        '--backup-id=PATHWAYS-dev-pre-correction-20260908-205627',
        '--authorization=PATHWAYS_DEV_LOCAL_COMPARISON_DIAGNOSTIC_RETRY_V2',
      ]),
    /ROOT_CAUSE_RETRY_MODE/,
  )
})

test('V3 retry dependencies retain their reviewed fingerprints', () => {
  assert.doesNotThrow(() => verifyRootCauseRetrySources())
})

test('V3 runner has no hosted, correction, migration or secret-loader path', () => {
  const source = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-restore-root-cause-retry.mjs'),
    'utf8',
  )
  assert.doesNotMatch(
    source,
    /pooler|supabase\.co|Backup-Dev|Read-Dev|Write-Dev|correction-runner|migrate\s+(deploy|dev|reset|resolve)|db\s+push|credential\.xml|apps[\\/]api[\\/]\.env/i,
  )
  assert.match(source, /127\.0\.0\.1/)
  assert.match(source, /rootCauseRetryAuthorization/)
})

test('V3 confirmation requires the exact old failure and full controlled PASS', () => {
  const baseline = baselineDiagnostics()
  const controlled = controlledDiagnostics()
  assert.equal(baselineReproduced(baseline), true)
  assert.equal(baselineReproduced(baseline, structuredClone(baseline)), true)
  const driftedBaseline = structuredClone(baseline)
  driftedBaseline.checks.schema.syntheticFingerprint = 'changed'
  assert.equal(baselineReproduced(baseline, driftedBaseline), false)
  const report = buildRootCauseDiagnostics({
    baseline,
    controlled,
    sourceServerMajor: 17,
    targetServerMajor: 18,
    targetDefaultTimezoneUtc: false,
    supplementApplied: true,
    exactBaseline: baseline,
  })
  assert.equal(report.timezoneCauseConfirmed, true)
  assert.equal(report.crossMajorSerializationExcluded, true)
  controlled.checks.rowHash = { ...passingOutcome(), pass: false, changed: 1 }
  controlled.allPassed = false
  const rejected = buildRootCauseDiagnostics({
    baseline,
    controlled,
    sourceServerMajor: 17,
    targetServerMajor: 18,
    targetDefaultTimezoneUtc: false,
    supplementApplied: true,
    exactBaseline: baseline,
  })
  assert.equal(rejected.timezoneCauseConfirmed, false)
  assert.equal(rejected.controlledHashChanged, 1)
})

test('V3 diagnostics strip unrecognized sensitive fields and reject false confirmation', () => {
  const value = {
    version: 3,
    baselineReproduced: true,
    sourceMajor17: true,
    targetMajor18: true,
    targetDefaultTimezoneUtc: false,
    supplementApplied: true,
    supplementRollbackPrepared: true,
    catalogPassAfterSupplement: true,
    rowCountsPass: true,
    utcHashesPass: true,
    timezoneCauseConfirmed: true,
    crossMajorSerializationExcluded: true,
    baselineCatalogMissing: 2,
    baselineAclMissing: 2,
    baselineHashChanged: 6,
    controlledCatalogMissing: 0,
    controlledHashChanged: 0,
    rawSql: 'forbidden',
    token: 'forbidden',
  }
  const sanitized = sanitizeRootCauseDiagnostics(value)
  assert.equal('rawSql' in sanitized, false)
  assert.equal('token' in sanitized, false)
  assert.throws(
    () => sanitizeRootCauseDiagnostics({ ...value, controlledHashChanged: 1 }),
    /ROOT_CAUSE_EVIDENCE_OUTPUT/,
  )
})

test('V3 claim is permanent and terminal evidence is sanitized', () => {
  const directory = fs.mkdtempSync(path.join(root, '.tmp/pathways-root-cause-evidence-'))
  try {
    const evidencePath = path.join(directory, 'evidence.json')
    fs.writeFileSync(evidencePath, '{}')
    const original = fs.readFileSync(evidencePath)
    const validators = { original() {}, v2() {} }
    const journal = claimRootCauseAttempt(evidencePath, original, validators)
    journal.record({
      status: 'RUNNING',
      stage: 'local-initdb',
      failureCode: null,
      diagnostics: null,
      localRestoreStopped: false,
      localRestoreRemoved: false,
    })
    journal.record({
      status: 'FAILED',
      stage: 'local-controlled-verification',
      failureCode: 'ROOT_CAUSE_COMPARISON',
      diagnostics: {
        version: 3,
        baselineReproduced: true,
        sourceMajor17: true,
        targetMajor18: true,
        targetDefaultTimezoneUtc: false,
        supplementApplied: true,
        supplementRollbackPrepared: true,
        catalogPassAfterSupplement: true,
        rowCountsPass: true,
        utcHashesPass: false,
        timezoneCauseConfirmed: false,
        crossMajorSerializationExcluded: false,
        baselineCatalogMissing: 2,
        baselineAclMissing: 2,
        baselineHashChanged: 6,
        controlledCatalogMissing: 0,
        controlledHashChanged: 1,
      },
      localRestoreStopped: true,
      localRestoreRemoved: true,
    })
    const output = fs.readFileSync(path.join(directory, 'local-retry-root-cause-v3.json'), 'utf8')
    assert.doesNotMatch(output, /rawSql|token|connection|archiveSha256/)
    assert.throws(
      () => claimRootCauseAttempt(evidencePath, original, validators),
      /ROOT_CAUSE_RETRY_CONSUMED/,
    )
  } finally {
    const actual = fs.realpathSync(directory)
    assert.equal(
      path.dirname(actual).toLowerCase(),
      fs.realpathSync(path.join(root, '.tmp')).toLowerCase(),
    )
    assert.match(path.basename(actual), /^pathways-root-cause-evidence-[A-Za-z0-9]+$/)
    fs.rmSync(actual, { recursive: true, force: false })
  }
})

test('cleanup preserves an uncertain local stop target', () => {
  const directory = fs.mkdtempSync(path.join(root, '.tmp/pathways-root-cause-retry-'))
  const result = cleanupRootCauseRetry(directory, true, () => {
    throw new Error('synthetic stop uncertainty')
  })
  assert.deepEqual(result, {
    stopped: false,
    removed: false,
    failureCode: 'LOCAL_STOP_FAILED',
  })
  assert.equal(fs.existsSync(directory), true)
  const actual = fs.realpathSync(directory)
  assert.equal(
    path.dirname(actual).toLowerCase(),
    fs.realpathSync(path.join(root, '.tmp')).toLowerCase(),
  )
  assert.match(path.basename(actual), /^pathways-root-cause-retry-[A-Za-z0-9]+$/)
  fs.rmSync(actual, { recursive: true, force: false })
})

test(
  'schema-filtered dumps omit global defaults and timezone changes only aware serialization',
  { timeout: 120_000 },
  async () => {
    const port = 55455
    const environment = cleanEnvironment()
    let directory
    let started = false
    const execute = (name, args, input, allowed = [0]) => {
      const starting = name === 'pg_ctl' && args.includes('start')
      const result = spawnSync(path.join(pgBin, `${name}.exe`), args, {
        env: environment,
        input,
        encoding: 'utf8',
        windowsHide: true,
        stdio: starting ? 'ignore' : 'pipe',
        timeout: 120_000,
      })
      assert.equal(result.error, undefined)
      assert.ok(allowed.includes(result.status), 'synthetic local child failed')
      return result.stdout?.trim() ?? ''
    }
    const sql = (database, query, allowed = [0]) =>
      execute(
        'psql',
        [
          '-X',
          '-w',
          '-q',
          '-A',
          '-t',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'postgres',
          '-d',
          database,
          '-v',
          'ON_ERROR_STOP=1',
        ],
        query,
        allowed,
      )
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener.once('error', reject).listen(port, '127.0.0.1', () => resolve()),
    )
    await new Promise((resolve) => listener.close(resolve))
    try {
      directory = fs.mkdtempSync(path.join(root, '.tmp/pathways-root-cause-test-'))
      const data = path.join(directory, 'data')
      const archive = path.join(directory, 'synthetic.dump')
      execute('initdb', [
        '-D',
        data,
        '-U',
        'postgres',
        '-A',
        'trust',
        '--encoding=UTF8',
        '--locale=C',
      ])
      execute('pg_ctl', [
        '-D',
        data,
        '-l',
        path.join(directory, 'postgres.log'),
        '-o',
        `-h 127.0.0.1 -p ${port}`,
        '-w',
        '-t',
        '15',
        'start',
      ])
      started = true
      sql('postgres', 'CREATE ROLE prisma NOLOGIN; CREATE ROLE synthetic_provider NOLOGIN;')
      sql('postgres', 'CREATE DATABASE synthetic_source;')
      sql('postgres', 'CREATE DATABASE pathways_phase4_backup_restore;')
      sql(
        'synthetic_source',
        `CREATE EXTENSION pgcrypto;
CREATE SCHEMA synthetic_scope AUTHORIZATION prisma;
SET ROLE prisma;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE USAGE ON TYPES FROM PUBLIC;
CREATE TABLE synthetic_scope.aware_sample(id integer, recorded_at timestamptz);
CREATE TABLE synthetic_scope.naive_sample(id integer, recorded_at timestamp);
INSERT INTO synthetic_scope.aware_sample VALUES (1, '2026-09-09 00:00:00+00');
INSERT INTO synthetic_scope.naive_sample VALUES (1, '2026-09-09 00:00:00');
RESET ROLE;
ALTER DEFAULT PRIVILEGES FOR ROLE synthetic_provider IN SCHEMA synthetic_scope
  GRANT SELECT ON TABLES TO prisma;`,
      )
      const sourceDefaultAcl = Number(
        sql(
          'synthetic_source',
          "SELECT count(*) FROM pg_default_acl WHERE defaclrole='prisma'::regrole AND defaclnamespace=0;",
        ),
      )
      assert.equal(sourceDefaultAcl, 2)
      execute('pg_dump', [
        '-Fc',
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-U',
        'postgres',
        '-d',
        'synthetic_source',
        '--schema=synthetic_scope',
        `--file=${archive}`,
      ])
      const toc = execute('pg_restore', ['--list', archive])
      assert.equal(
        toc
          .split(/\r?\n/)
          .filter((line) => line.includes(' DEFAULT ACL ') && /\bprisma\b/.test(line)).length,
        0,
      )
      execute('pg_restore', [
        '--exit-on-error',
        '--single-transaction',
        '-h',
        '127.0.0.1',
        '-p',
        String(port),
        '-U',
        'postgres',
        '-d',
        'pathways_phase4_backup_restore',
        archive,
      ])
      assert.equal(
        Number(
          sql(
            'pathways_phase4_backup_restore',
            "SELECT count(*) FROM pg_default_acl WHERE defaclrole='prisma'::regrole;",
          ),
        ),
        0,
      )
      sql(
        'pathways_phase4_backup_restore',
        fs.readFileSync(
          path.join(backupRestoreDirectory, 'backup-restore-default-acl-supplement.sql'),
          'utf8',
        ),
      )
      assert.equal(
        Number(
          sql(
            'pathways_phase4_backup_restore',
            "SELECT count(*) FROM pg_default_acl WHERE defaclrole='prisma'::regrole;",
          ),
        ),
        2,
      )
      sql(
        'pathways_phase4_backup_restore',
        fs.readFileSync(
          path.join(backupRestoreDirectory, 'backup-restore-default-acl-supplement-rollback.sql'),
          'utf8',
        ),
      )
      assert.equal(
        Number(
          sql(
            'pathways_phase4_backup_restore',
            "SELECT count(*) FROM pg_default_acl WHERE defaclrole='prisma'::regrole;",
          ),
        ),
        0,
      )

      const rowHash = (table, timezone) =>
        sql(
          'synthetic_source',
          `BEGIN READ ONLY; SET LOCAL timezone='${timezone}';
SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n'
ORDER BY (to_jsonb(r)::text) COLLATE "C"),''),'UTF8')),'hex')
FROM synthetic_scope.${table} r; ROLLBACK;`,
        )
          .split(/\r?\n/)
          .find((line) => /^[a-f0-9]{64}$/.test(line))
      assert.notEqual(rowHash('aware_sample', 'UTC'), rowHash('aware_sample', 'Asia/Singapore'))
      assert.equal(rowHash('naive_sample', 'UTC'), rowHash('naive_sample', 'Asia/Singapore'))

      sql(
        'pathways_phase4_backup_restore',
        fs.readFileSync(
          path.join(backupRestoreDirectory, 'backup-restore-default-acl-supplement.sql'),
          'utf8',
        ),
      )
      sql(
        'pathways_phase4_backup_restore',
        'ALTER DEFAULT PRIVILEGES FOR ROLE prisma IN SCHEMA synthetic_scope GRANT SELECT ON TABLES TO synthetic_provider;',
      )
      sql(
        'pathways_phase4_backup_restore',
        fs.readFileSync(
          path.join(backupRestoreDirectory, 'backup-restore-default-acl-supplement-rollback.sql'),
          'utf8',
        ),
        [3],
      )
      assert.equal(
        Number(
          sql(
            'pathways_phase4_backup_restore',
            "SELECT count(*) FROM pg_default_acl WHERE defaclrole='prisma'::regrole;",
          ),
        ),
        3,
      )
    } finally {
      if (started && directory) {
        execute('pg_ctl', [
          '-D',
          path.join(directory, 'data'),
          '-m',
          'fast',
          '-w',
          '-t',
          '15',
          'stop',
        ])
      }
      if (directory) {
        const actual = fs.realpathSync(directory)
        const expectedParent = fs.realpathSync(path.join(root, '.tmp'))
        assert.equal(path.dirname(actual).toLowerCase(), expectedParent.toLowerCase())
        assert.match(path.basename(actual), /^pathways-root-cause-test-[A-Za-z0-9]+$/)
        fs.rmSync(actual, { recursive: true, force: false })
        assert.equal(fs.existsSync(actual), false)
      }
    }
  },
)
