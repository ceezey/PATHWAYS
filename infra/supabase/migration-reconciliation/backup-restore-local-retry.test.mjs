import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import { backupRestoreDatabase, backupRestoreDirectory } from './backup-restore-config.mjs'
import { diagnosticAuthorization } from './backup-restore-local-evidence.mjs'
import {
  assertPriorLocalRetryEvidence,
  classifyLocalChildError,
  cleanupLocalRetry,
  localRetryReview,
  validateLocalRetryArguments,
  verifyLocalRetrySources,
} from './backup-restore-local-retry.mjs'
import { cleanEnvironment, pgBin, root } from './config.mjs'

const exactArgs = [
  '--restore-existing',
  `--backup-id=${localRetryReview.authorizedBackupId}`,
  `--authorization=${diagnosticAuthorization}`,
]
const read = (name) => fs.readFileSync(path.join(backupRestoreDirectory, name), 'utf8')

test('only the exact local retry authorization and preserved backup are accepted', () => {
  assert.equal(validateLocalRetryArguments(exactArgs), '--restore-existing')
  for (const args of [
    [],
    ['--restore-existing'],
    exactArgs.slice().reverse(),
    exactArgs.map((value) => value.replace('LOCAL_COMPARISON', 'WRONG')),
    [...exactArgs.slice(0, 2), '--authorization=PATHWAYS_DEV_LOCAL_RESTORE_RETRY_ONLY'],
    [...exactArgs.slice(0, 2), '--authorization=PATHWAYS_DEV_LOCAL_COMPARISON_DIAGNOSTIC_RETRY_V1'],
    exactArgs.map((value) => value.replace('20260908-205627', '20260908-000000')),
  ]) {
    assert.throws(() => validateLocalRetryArguments(args), {
      message: 'LOCAL_RETRY_MODE',
    })
  }
})

test('child error classifier emits only bounded non-sensitive categories', () => {
  assert.equal(
    classifyLocalChildError('role "private_name" does not exist'),
    'MISSING_SYNTHETIC_ROLE',
  )
  assert.equal(classifyLocalChildError('schema "private" already exists'), 'SCHEMA_CONFLICT')
  assert.equal(
    classifyLocalChildError('function "private" does not exist'),
    'MISSING_LOCAL_DEPENDENCY',
  )
  assert.equal(classifyLocalChildError('permission denied'), 'LOCAL_PERMISSION')
  assert.equal(classifyLocalChildError('unrecognized private detail'), 'LOCAL_CHILD_FAILED')
})

test('retry-only bootstrap creates exactly one least-privilege synthetic provider role', () => {
  assert.doesNotThrow(() => verifyLocalRetrySources())
  const sql = read('backup-restore-local-retry-bootstrap.sql')
  assert.match(sql, /current_database\(\) <> 'pathways_phase4_backup_restore'/)
  assert.match(sql, /inet_server_addr\(\) IS DISTINCT FROM '127\.0\.0\.1'/)
  assert.match(sql, /current_user <> 'postgres'/)
  assert.match(sql, /session_user <> 'postgres'/)
  assert.match(sql, /to_regrole\('supabase_admin'\) IS NOT NULL/)
  assert.match(
    sql,
    /CREATE ROLE supabase_admin\s+NOLOGIN\s+NOSUPERUSER\s+NOINHERIT\s+NOCREATEDB\s+NOCREATEROLE\s+NOREPLICATION\s+NOBYPASSRLS;/,
  )
  assert.equal((sql.match(/\bCREATE ROLE\b/g) ?? []).length, 1)
  assert.doesNotMatch(sql, /\b(?:PASSWORD|LOGIN|SUPERUSER|BYPASSRLS)\b(?!\s*=\s*false)/)
})

test('next retry accepts only the exact recorded prior failure evidence', () => {
  const expected = {
    localRetry: {
      status: 'FAILED',
      stage: 'local-verification',
      failureCode: 'RESTORE_COMPARISON',
      startedUtc: '2026-09-09T06:15:55.585Z',
      completedUtc: null,
      port: 55453,
      targetLoopbackOnly: true,
      hostedConnections: 0,
      hostedWrites: 0,
      localRestoreStopped: true,
      localRestoreRemoved: true,
    },
  }
  assert.doesNotThrow(() => assertPriorLocalRetryEvidence(expected))
  for (const changed of [
    { status: 'PASS' },
    { stage: 'local-restore-post-data' },
    { failureCode: 'LOCAL_CHILD_FAILED' },
    { hostedConnections: 1 },
    { hostedWrites: 1 },
    { localRestoreStopped: false },
    { localRestoreRemoved: false },
    { startedUtc: '2026-09-09T06:15:55.586Z' },
    { completedUtc: '2026-09-09T06:16:00.000Z' },
    { port: 55454 },
    { targetLoopbackOnly: false },
  ]) {
    assert.throws(
      () =>
        assertPriorLocalRetryEvidence({
          localRetry: { ...expected.localRetry, ...changed },
        }),
      { message: 'LOCAL_RETRY_PRIOR_STATE' },
    )
  }
})

test(
  'retry-only bootstrap is least-privilege and rejects conflicting local state',
  { timeout: 60_000 },
  async () => {
    const port = 55454
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener.once('error', reject).listen(port, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))

    const temporaryRoot = path.join(root, '.tmp')
    fs.mkdirSync(temporaryRoot, { recursive: true })
    const directory = fs.mkdtempSync(path.join(temporaryRoot, 'pathways-local-restore-retry-'))
    const dataDirectory = path.join(directory, 'data')
    const environment = cleanEnvironment()
    let started = false
    let stopped = false
    let removed = false
    const execute = (name, args, options = {}) =>
      spawnSync(path.join(pgBin, `${name}.exe`), args, {
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        ...options,
      })
    const commonPsql = [
      '-X',
      '-w',
      '-q',
      '-h',
      '127.0.0.1',
      '-p',
      String(port),
      '-U',
      'postgres',
      '-d',
      backupRestoreDatabase,
      '-v',
      'ON_ERROR_STOP=1',
    ]

    try {
      assert.equal(
        execute('initdb', [
          '-D',
          dataDirectory,
          '-U',
          'postgres',
          '-A',
          'trust',
          '--encoding=UTF8',
          '--locale=C',
        ]).status,
        0,
      )
      // Treat an uncertain start as potentially running; cleanup must stop it first.
      started = true
      assert.equal(
        execute(
          'pg_ctl',
          [
            '-D',
            dataDirectory,
            '-l',
            path.join(directory, 'postgres.log'),
            '-o',
            `-h 127.0.0.1 -p ${port}`,
            '-w',
            '-t',
            '15',
            'start',
          ],
          { stdio: 'ignore' },
        ).status,
        0,
      )
      assert.equal(
        execute('createdb', [
          '-w',
          '-h',
          '127.0.0.1',
          '-p',
          String(port),
          '-U',
          'postgres',
          backupRestoreDatabase,
        ]).status,
        0,
      )
      assert.equal(
        execute('psql', [
          ...commonPsql,
          '-f',
          path.join(backupRestoreDirectory, 'backup-restore-local-bootstrap.sql'),
        ]).status,
        0,
      )
      assert.equal(
        execute('psql', [
          ...commonPsql,
          '-f',
          path.join(backupRestoreDirectory, 'backup-restore-local-retry-bootstrap.sql'),
        ]).status,
        0,
      )

      const query = `SELECT json_build_object(
        'login', rolcanlogin,
        'superuser', rolsuper,
        'inherit', rolinherit,
        'createDb', rolcreatedb,
        'createRole', rolcreaterole,
        'replication', rolreplication,
        'bypassRls', rolbypassrls,
        'memberships', (
          SELECT count(*)
          FROM pg_auth_members membership
          WHERE membership.member = pg_roles.oid
             OR membership.roleid = pg_roles.oid
        )
      )
      FROM pg_roles
      WHERE rolname = 'supabase_admin';`
      const verification = execute('psql', [...commonPsql, '-A', '-t', '-c', query])
      assert.equal(verification.status, 0)
      assert.deepEqual(JSON.parse(verification.stdout.trim()), {
        login: false,
        superuser: false,
        inherit: false,
        createDb: false,
        createRole: false,
        replication: false,
        bypassRls: false,
        memberships: 0,
      })

      const conflictingState = execute('psql', [
        ...commonPsql,
        '-f',
        path.join(backupRestoreDirectory, 'backup-restore-local-retry-bootstrap.sql'),
      ])
      assert.notEqual(conflictingState.status, 0)
    } finally {
      const cleanup = cleanupLocalRetry(directory, started, () => {
        assert.equal(
          execute('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', '-t', '15', 'stop'], {
            stdio: 'ignore',
          }).status,
          0,
        )
      })
      stopped = cleanup.stopped
      removed = cleanup.removed
    }
    assert.equal(stopped, true)
    assert.equal(removed, true)
  },
)

test('runner is local-only and persists sanitized stages before cleanup', () => {
  const source = fs.readFileSync(
    path.join(backupRestoreDirectory, 'backup-restore-local-retry.mjs'),
    'utf8',
  )
  assert.match(source, /hostedConnections: 0/)
  assert.match(source, /hostedWrites: 0/)
  assert.match(source, /setStage\('local-restore-pre-data'\)/)
  assert.match(source, /setStage\('local-restore-data'\)/)
  assert.match(source, /setStage\('local-retry-role-bootstrap'\)/)
  assert.match(source, /setStage\('local-restore-post-data'\)/)
  assert.match(source, /backup-restore-local-retry-bootstrap\.sql/)
  assert.match(source, /claimDiagnosticAttempt/)
  assert.match(source, /metadata\.archiveSha256/)
  assert.doesNotMatch(source, /fs\.writeFileSync\(evidencePath/)
  assert.match(source, /fs\.rmSync/)
  assert.doesNotMatch(source, /supabase\.com|pooler|Backup-Dev|Read-Dev|correction-runner/)
  assert.doesNotMatch(
    source,
    /--apply-dev|--rollback-dev|Write-DevCorrection|migrate\s+(deploy|dev|reset|resolve)|db push|\.env/i,
  )
})

test('CLI rejects incomplete authorization before reading protected evidence or opening a port', () => {
  for (const args of [[], ['--restore-existing'], ['--apply-dev']]) {
    const execution = spawnSync(
      process.execPath,
      [path.join(backupRestoreDirectory, 'backup-restore-local-retry.mjs'), ...args],
      { encoding: 'utf8', env: cleanEnvironment(), windowsHide: true },
    )
    assert.equal(execution.status, 1)
    const result = JSON.parse(execution.stdout)
    assert.equal(result.status, 'FAILED')
    assert.equal(result.stage, 'authorization')
    assert.equal(result.hostedConnections, 0)
    assert.equal(result.hostedWrites, 0)
    assert.equal(execution.stderr, '')
  }
})
