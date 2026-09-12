import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertLedger,
  cleanEnvironment,
  compareObjects,
  localDatabase,
  localPort,
  migrations,
  root,
  validateLocalUrl,
  validateStaging,
  verifySources,
} from './config.mjs'
import { assertSnapshot, readOnlySql } from './runner.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const localUrl = `postgresql://prisma@127.0.0.1:${localPort}/${localDatabase}?sslmode=disable&connection_limit=1`
const ledger = (length) =>
  migrations.slice(0, length).map(([name, checksum]) => ({
    name,
    checksum,
    finished: true,
    rolledBack: false,
    failureLog: false,
    steps: 1,
  }))

test('exact immutable 0001-0005 sources and local target accepted', () => {
  verifySources()
  assert.equal(validateLocalUrl(localUrl), localUrl)
  assert.equal(migrations.length, 5)
})

for (const [name, value] of [
  ['remote', localUrl.replace('127.0.0.1', 'example.com')],
  ['alternate-loopback', localUrl.replace('127.0.0.1', 'localhost')],
  ['port', localUrl.replace(String(localPort), '5432')],
  ['database', localUrl.replace(localDatabase, 'postgres')],
  ['role', localUrl.replace('prisma@', 'other@')],
  ['password', localUrl.replace('prisma@', 'prisma:synthetic@')],
  ['schema', `${localUrl}&schema=pathways`],
  ['options', `${localUrl}&options=-csearch_path=public`],
  ['fragment', `${localUrl}#secret-canary`],
  ['malformed', 'not-a-url'],
])
  test(`rejects ${name} local target before a connection`, () => {
    assert.throws(() => validateLocalUrl(value), { message: 'LOCAL_TARGET' })
  })

test('child environment excludes credentials, services, preload and connection overrides', () => {
  assert.deepEqual(
    cleanEnvironment({
      Path: 'system-bin',
      SystemRoot: 'windows',
      DATABASE_URL: 'canary',
      DIRECT_URL: 'canary',
      SHADOW_DATABASE_URL: 'canary',
      PGPASSWORD: 'canary',
      PGSERVICEFILE: 'canary',
      PGOPTIONS: 'canary',
      NODE_OPTIONS: 'canary',
      PRISMA_SCHEMA_ENGINE_BINARY: 'canary',
      SUPABASE_SERVICE_ROLE_KEY: 'canary',
    }),
    { SystemRoot: 'windows', PATH: 'system-bin' },
  )
})

test('exact completed prefix only; unresolved, reordered, forged and extra rows denied', () => {
  assertLedger(ledger(1), 1)
  assertLedger(ledger(5), 5)
  for (const bad of [
    [],
    ledger(2),
    [...ledger(1), ...ledger(1)],
    [{ ...ledger(1)[0], checksum: 'forged' }],
    [{ ...ledger(1)[0], name: '0006_auth_session_liveness' }],
    [{ ...ledger(1)[0], finished: false }],
    [{ ...ledger(1)[0], rolledBack: true }],
    [{ ...ledger(1)[0], failureLog: true }],
    [{ ...ledger(1)[0], steps: -1 }],
  ]) {
    assert.throws(() => assertLedger(bad, 1), { message: 'LEDGER_PREFIX' })
  }
  assert.throws(() => assertLedger(ledger(5).reverse(), 5))
})

test('comparison detects missing/changed/extra definitions without leaking unknown names', () => {
  const expected = [{ key: 'table:known', fingerprint: 'a' }]
  assert.deepEqual(compareObjects(expected, expected), [])
  assert.equal(compareObjects(expected, [])[0].kind, 'missing')
  assert.equal(
    compareObjects(expected, [{ key: 'table:known', fingerprint: 'b' }])[0].kind,
    'different',
  )
  const extra = compareObjects(expected, [...expected, { key: 'PRIVATE_CANARY', fingerprint: 'x' }])
  assert.equal(extra[0].kind, 'extra')
  assert.equal(JSON.stringify(extra).includes('PRIVATE_CANARY'), false)
  assert.throws(() => compareObjects(expected, [...expected, ...expected]), {
    message: 'DUPLICATE_OBJECT',
  })
})

test('snapshot gate requires read-only administrator, exact shape and one public ledger', () => {
  const good = {
    version: 1,
    readOnly: true,
    user: 'postgres',
    sessionUser: 'postgres',
    database: 'postgres',
    serverVersion: 170006,
    ledgerLocations: ['public'],
    otherLedger: false,
    livenessAbsent: true,
    targetTables: 39,
    legacyTables: 15,
    pgcryptoPresent: true,
    ledger: ledger(1),
    objects: Array.from({ length: 1001 }, (_, i) => ({
      key: `test:${i}`,
      fingerprint: 'a'.repeat(64),
    })),
  }
  assertSnapshot(good, 1, 'postgres')
  for (const mutation of [
    { readOnly: false },
    { user: 'prisma' },
    { sessionUser: 'other' },
    { database: 'other' },
    { ledgerLocations: ['public', 'pathways'] },
    { otherLedger: true },
    { livenessAbsent: false },
    { targetTables: 38 },
    { legacyTables: 0 },
    { pgcryptoPresent: false },
    { objects: [] },
    { serverVersion: 160000 },
  ])
    assert.throws(() => assertSnapshot({ ...good, ...mutation }, 1, 'postgres'))
})

test('staging refuses the current migration directory including 0006', () => {
  assert.throws(() => validateStaging(path.join(root, 'apps/api/prisma/migrations')), {
    message: 'STAGING_PATH',
  })
})

test('staging accepts only exact copied prefixes and rejects extra migrations and changed bytes', () => {
  const parent = fs.mkdtempSync(path.join(root, '.tmp/pathways-reconcile-'))
  const staged = path.join(parent, 'migrations')
  fs.mkdirSync(staged)
  const source = path.join(root, 'apps/api/prisma/migrations')
  fs.copyFileSync(
    path.join(source, 'migration_lock.toml'),
    path.join(staged, 'migration_lock.toml'),
  )
  for (const [name] of migrations.slice(0, 4))
    fs.cpSync(path.join(source, name), path.join(staged, name), { recursive: true })
  assert.equal(validateStaging(staged), fs.realpathSync(staged))
  const [last] = migrations[4]
  fs.cpSync(path.join(source, last), path.join(staged, last), { recursive: true })
  assert.equal(validateStaging(staged), fs.realpathSync(staged))
  const original = path.join(staged, last, 'migration.sql')
  const changed = path.join(staged, last, 'migration.sql.changed')
  fs.renameSync(original, changed)
  fs.writeFileSync(original, 'SELECT 1;')
  assert.throws(() => validateStaging(staged), { message: 'STAGING_CHECKSUM' })
  fs.mkdirSync(path.join(staged, '0006_auth_session_liveness'))
  assert.throws(() => validateStaging(staged), { message: 'STAGING_CONTENTS' })
  // Only synthetic copied files were touched; retain them in ignored .tmp.
})

test('known extra public function is named for review but never exempted', () => {
  const differences = compareObjects(
    [],
    [{ key: 'function:public.pathways_prevent_audit_mutation()', fingerprint: 'x' }],
  )
  assert.deepEqual(differences, [
    { key: 'function:public.pathways_prevent_audit_mutation()', kind: 'extra' },
  ])
})

test('SQL has explicit read-only transaction, local timeouts and rollback; no row extraction', () => {
  assert.match(readOnlySql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/)
  assert.match(readOnlySql, /SET LOCAL statement_timeout='30s'/)
  assert.match(readOnlySql, /ROLLBACK;$/)
  assert.doesNotMatch(readOnlySql, /\bFROM\s+(auth|storage|pathways)\./i)
  assert.doesNotMatch(readOnlySql, /\b(logs|checksum)\s+AS\s+\w+/i)
})

test('CLI refuses write modes and extra arguments before starting a local cluster', () => {
  for (const args of [['--resolve'], ['--deploy'], ['--local', '--url=canary']]) {
    const result = spawnSync(process.execPath, [path.join(directory, 'runner.mjs'), ...args], {
      encoding: 'utf8',
      env: cleanEnvironment(),
      windowsHide: true,
    })
    assert.equal(result.status, 1)
    assert.equal(result.stdout.trim(), 'RECONCILIATION_MODE_REJECTED')
    assert.equal(result.stderr, '')
  }
})

test('hosted wrapper hardcodes the reviewed target, read-only transaction and sanitized failures', () => {
  const source = fs.readFileSync(path.join(directory, 'Read-Dev.ps1'), 'utf8')
  assert.match(source, /postgres\.pdqwsknbzkdtiwjjibqt/)
  assert.match(source, /-h aws-1-ap-southeast-2\.pooler\.supabase\.com -p 5432/)
  assert.match(source, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(source, /EnvironmentVariables\.Clear\(\)/)
  assert.doesNotMatch(source, /migrate|\.env|Write-Output.*Exception|Write-Output.*reconcileError/)
})
