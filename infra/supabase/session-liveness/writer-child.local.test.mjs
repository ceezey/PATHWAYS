// No hosted reader/writer wrapper, protected credentials, env files or archives.
// Real fingerprinted writer child statements -> installed Prisma CLI -> own PG.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import test from 'node:test'
import {
  directory,
  migrations,
  root,
  sha256,
  sourceHashes,
  verifySources,
} from './deployment-config.mjs'

const pgBin = 'C:/Program Files/PostgreSQL/18/bin'
const port = 55457
const database = 'pathways_phase4_phase6_replay'
const shell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const adapter = path.join(directory, 'Invoke-LocalLivenessChild.ps1')
const childEnv = {
  SystemRoot: process.env.SystemRoot,
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  PATH: 'C:\\Windows\\System32',
  TEMP: path.join(root, '.tmp'),
  TMP: path.join(root, '.tmp'),
  PGSSLMODE: 'disable',
  PGPASSFILE: 'NUL',
  PGCONNECT_TIMEOUT: '5',
}

function requireLocal(condition, code) {
  // Avoid assert diffs that could print inventory keys, SQL or private hashes.
  if (!condition) throw new Error(code)
}
function run(executable, args, input, ignore = false) {
  return spawnSync(executable, args, {
    cwd: root,
    env: childEnv,
    windowsHide: true,
    encoding: 'utf8',
    input,
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ignore ? 'ignore' : 'pipe',
  })
}
function command(executable, args, stage, input, ignore) {
  const result = run(executable, args, input, ignore)
  requireLocal(!result.error && result.status === 0, stage)
  return result.stdout?.trim() ?? ''
}
function sql(input) {
  return command(
    path.join(pgBin, 'psql.exe'),
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
    'LOCAL_SQL_FAILED',
    input,
  )
}
async function requireFreePort() {
  const listener = net.createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', () => reject(new Error('LOCAL_PORT_NOT_FREE')))
    listener.listen(port, '127.0.0.1', resolve)
  })
  await new Promise((resolve) => listener.close(resolve))
}
function checkLedger(catalog, prefix) {
  requireLocal(catalog.ledger.length === prefix, 'LOCAL_LEDGER_PREFIX')
  for (let index = 0; index < prefix; index++) {
    const row = catalog.ledger[index]
    requireLocal(
      row.name === migrations[index][0] &&
        row.checksum === migrations[index][1] &&
        row.finished &&
        !row.rolledBack &&
        !row.failureLog,
      'LOCAL_LEDGER_STATE',
    )
  }
}
function inventory() {
  const catalogSql = fs.readFileSync(
    path.join(directory, '../migration-reconciliation/inventory.sql'),
    'utf8',
  )
  const dataSql = fs.readFileSync(
    path.join(directory, '../migration-reconciliation/baseline-data-inventory.sql'),
    'utf8',
  )
  const statusSql = fs.readFileSync(path.join(directory, 'read-status.sql'), 'utf8')
  const output = sql(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SET LOCAL search_path=pg_catalog; SET LOCAL TIME ZONE 'UTC';
    SET LOCAL statement_timeout='30s';
    ${catalogSql}\n${dataSql}\n${statusSql}\nCOMMIT;`)
  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return { catalog: rows[0], data: rows.filter((r) => r.kind === 'data'), liveness: rows.at(-1) }
}
function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
function invoke(staged, variant, role) {
  const invocation = run(shell, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    adapter,
    '-StagePath',
    staged,
    '-Variant',
    variant,
    '-Role',
    role,
  ])
  const output = invocation.stdout?.trim() ?? ''
  if (invocation.status !== 0) {
    let failure
    try {
      failure = JSON.parse(output)
    } catch {
      throw new Error('LOCAL_ADAPTER_INVALID_OUTPUT')
    }
    const allowed = [
      'path-guard',
      'staging-guard',
      'target-probe',
      'extract-child',
      'launch-child',
      'wait-child',
    ]
    throw new Error(
      allowed.includes(failure.stage) ? `LOCAL_ADAPTER_${failure.stage}` : 'LOCAL_ADAPTER_FAILED',
    )
  }
  requireLocal(output.length <= 2048, 'LOCAL_DIAGNOSTIC_BOUND')
  const result = JSON.parse(output)
  const keys = [
    'status',
    'childExitCode',
    'schemaEnvironmentFailure',
    'missingDirectUrl',
    'missingDatabaseUrl',
    'migrationsApplied',
    'envFilesSkipped',
    'secretCopiesCleared',
    'outputBounded',
  ]
  requireLocal(
    same(Object.keys(result), keys) &&
      result.status === 'COMPLETE' &&
      Number.isInteger(result.childExitCode) &&
      result.childExitCode >= 0 &&
      result.childExitCode <= 255 &&
      keys.slice(2).every((key) => typeof result[key] === 'boolean'),
    'LOCAL_DIAGNOSTIC_SHAPE',
  )
  requireLocal(
    !/postgresql:|bearer|cookie|[0-9a-f]{32}|C:\\/i.test(output),
    'LOCAL_DIAGNOSTIC_SANITIZATION',
  )
  requireLocal(
    result.secretCopiesCleared && result.envFilesSkipped && result.outputBounded,
    'LOCAL_CHILD_ISOLATION',
  )
  return result
}

test('child fix binds both schema variables to the validated URL and erases launch copies', () => {
  const writer = fs.readFileSync(path.join(directory, 'Write-DevSessionLiveness.ps1'), 'utf8')
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    assert.ok(
      writer.includes(`$livenessWriteInfo.EnvironmentVariables['${name}'] = $livenessWriteUrl`),
    )
    assert.doesNotMatch(writer, new RegExp(`\\$env:${name}\\s*=`))
  }
  const launch = writer.indexOf('$livenessWriteProcess = [Diagnostics.Process]::Start')
  const cleanup = writer.indexOf(
    "@('PATHWAYS_SESSION_LIVENESS_URL','DATABASE_URL','DIRECT_URL','PGPASSWORD')",
  )
  assert.ok(cleanup > launch)
  assert.match(
    writer.slice(cleanup),
    /\$livenessWriteProcess\.StartInfo\.EnvironmentVariables\.Remove/,
  )
  assert.match(writer, /EnvironmentVariables\.Clear\(\)/)
  assert.equal(
    sha256(fs.readFileSync(path.join(directory, 'Write-DevSessionLiveness.ps1'))),
    sourceHashes['Write-DevSessionLiveness.ps1'],
  )
})

test('local adapter rejects missing/unowned staging before any database call', () => {
  const result = run(shell, [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    adapter,
    '-StagePath',
    root,
    '-Variant',
    'Corrected',
    '-Role',
    'postgres',
  ])
  assert.equal(result.status, 1)
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 'FAILED',
    failure: 'LOCAL_CHILD_GUARD_OR_EXECUTION',
    stage: 'path-guard',
  })
})

test('local adapter rejects altered staged SQL without launching Prisma', () => {
  const scratch = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  try {
    fs.writeFileSync(path.join(scratch, 'synthetic-child-test'), 'LOCAL_ONLY\n')
    const staged = path.join(scratch, 'migrations')
    fs.mkdirSync(staged)
    fs.copyFileSync(
      path.join(root, 'apps/api/prisma/migrations/migration_lock.toml'),
      path.join(staged, 'migration_lock.toml'),
    )
    for (const [name] of migrations.slice(0, 4)) {
      fs.cpSync(path.join(root, 'apps/api/prisma/migrations', name), path.join(staged, name), {
        recursive: true,
      })
    }
    fs.appendFileSync(path.join(staged, migrations[0][0], 'migration.sql'), '\n-- synthetic drift')
    const result = run(shell, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      adapter,
      '-StagePath',
      staged,
      '-Variant',
      'Corrected',
      '-Role',
      'postgres',
    ])
    assert.equal(result.status, 1)
    assert.deepEqual(JSON.parse(result.stdout), {
      status: 'FAILED',
      failure: 'LOCAL_CHILD_GUARD_OR_EXECUTION',
      stage: 'staging-guard',
    })
  } finally {
    requireLocal(
      fs.realpathSync(scratch) === scratch &&
        path.dirname(scratch) === fs.realpathSync(path.join(root, '.tmp')),
      'LOCAL_CLEANUP_TARGET',
    )
    fs.rmSync(scratch, { recursive: true })
  }
})

test('original full CLI failure, corrected canonical deployment and cleanup', async (t) => {
  verifySources()
  await requireFreePort()
  const parentEnv = { ...process.env }
  const preserved = [
    ...migrations.map(([name]) =>
      path.join(root, 'apps/api/prisma/migrations', name, 'migration.sql'),
    ),
    path.join(root, 'apps/api/prisma/schema.prisma'),
    path.join(root, 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql'),
    ...['g2W7LB', 'GsEuS9', 'YzrXdm'].map((suffix) =>
      path.join(root, `.tmp/pathways-session-liveness-${suffix}/result.json`),
    ),
  ].map((file) => [file, sha256(fs.readFileSync(file))])
  const scratch = fs.mkdtempSync(path.join(root, '.tmp/pathways-session-liveness-'))
  const data = path.join(scratch, 'data')
  const staged = path.join(scratch, 'migrations')
  let startAttempted = false
  let stopped = false
  let stage = 'initdb'
  const pg = (exe, args, input, ignore) =>
    command(path.join(pgBin, `${exe}.exe`), args, stage, input, ignore)
  const summary = {
    status: 'FAILED',
    originalFailureReproduced: false,
    partialFixRejected: false,
    correctedDeployment: false,
    catalogPreserved: false,
    dataPreserved: false,
    helperValid: false,
    hostedConnections: 0,
    hostedWrites: 0,
    localStopped: false,
    localRemoved: false,
    failureStage: 'NONE',
  }
  try {
    fs.writeFileSync(path.join(scratch, 'synthetic-child-test'), 'LOCAL_ONLY\n', { flag: 'wx' })
    fs.mkdirSync(staged)
    fs.copyFileSync(
      path.join(root, 'apps/api/prisma/migrations/migration_lock.toml'),
      path.join(staged, 'migration_lock.toml'),
    )
    const addMigration = (index) =>
      fs.cpSync(
        path.join(root, 'apps/api/prisma/migrations', migrations[index][0]),
        path.join(staged, migrations[index][0]),
        { recursive: true, errorOnExist: true, force: false },
      )
    pg('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'])
    stage = 'start'
    startAttempted = true
    pg(
      'pg_ctl',
      [
        '-D',
        data,
        '-l',
        path.join(scratch, 'postgres.log'),
        '-o',
        `-h 127.0.0.1 -p ${port}`,
        '-w',
        '-t',
        '15',
        'start',
      ],
      undefined,
      true,
    )
    stage = 'bootstrap'
    pg('createdb', ['-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', database])
    requireLocal(
      sql("SELECT current_setting('data_directory');").replaceAll('/', '\\') === data,
      'LOCAL_TARGET',
    )
    sql(
      fs.readFileSync(
        path.join(root, 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql'),
        'utf8',
      ),
    )
    // Only a provider-shaped catalog role needed by the unchanged inventory SQL.
    sql(
      'CREATE ROLE supabase_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;',
    )
    // Fresh PostgreSQL grants TEMP to PUBLIC; mirror the reviewed runtime
    // hardening prerequisite in this disposable database, before snapshots.
    sql(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC;`)
    stage = 'canonical-prefix-four'
    for (let index = 0; index < 4; index++) addMigration(index)
    const first = invoke(staged, 'Corrected', 'prisma')
    requireLocal(first.childExitCode === 0 && first.migrationsApplied, 'LOCAL_PREFIX_FOUR_FAILED')
    stage = 'canonical-prefix-five'
    addMigration(4)
    const fifth = invoke(staged, 'Corrected', 'postgres')
    requireLocal(fifth.childExitCode === 0 && fifth.migrationsApplied, 'LOCAL_PREFIX_FIVE_FAILED')
    sql(
      `INSERT INTO public."Program" ("code", "name") VALUES ('SYNTHETIC-CHILD', 'Synthetic preservation fixture');`,
    )
    const before = inventory()
    checkLedger(before.catalog, 5)
    summary.preflight = {
      objects: before.catalog.objects.length,
      tables: before.data.length,
      legacyTables: before.catalog.legacyTables,
      runtimeSafe: before.catalog.runtimeSafe,
      providerCompatible: before.liveness.providerCompatible,
      helperAbsent: !before.liveness.present,
    }
    requireLocal(
      before.catalog.objects.length === 1193 &&
        before.data.length === 54 &&
        before.catalog.legacyTables === 15 &&
        before.catalog.runtimeSafe &&
        before.liveness.providerCompatible &&
        !before.liveness.present,
      'LOCAL_CANONICAL_PREFLIGHT',
    )
    const ancillary = () =>
      sql(`SELECT jsonb_build_object(
      'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl) ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'),
      'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r),
      'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]') FROM pg_auth_members m),
      'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY extname) FROM pg_extension e))::text;`)
    const ancillaryBefore = ancillary()
    addMigration(5)
    await t.test('red: original child fails P1012 before any 0006 ledger or catalog change', () => {
      stage = 'original-child'
      const original = invoke(staged, 'Original', 'postgres')
      requireLocal(
        original.childExitCode === 1 &&
          original.schemaEnvironmentFailure &&
          original.missingDirectUrl &&
          !original.migrationsApplied,
        'LOCAL_ORIGINAL_NOT_REPRODUCED',
      )
      const after = inventory()
      checkLedger(after.catalog, 5)
      requireLocal(
        same(before, after) && ancillary() === ancillaryBefore,
        'LOCAL_ORIGINAL_MUTATED_STATE',
      )
      summary.originalFailureReproduced = true
    })
    requireLocal(summary.originalFailureReproduced, 'LOCAL_RED_REQUIRED')
    await t.test(
      'partial fix: DIRECT_URL alone still fails on missing DATABASE_URL without mutation',
      () => {
        stage = 'partial-fix-child'
        const partial = invoke(staged, 'DirectOnly', 'postgres')
        requireLocal(
          partial.childExitCode === 1 &&
            partial.schemaEnvironmentFailure &&
            partial.missingDatabaseUrl &&
            !partial.migrationsApplied,
          'LOCAL_BOTH_VARIABLES_REQUIRED',
        )
        requireLocal(
          same(before, inventory()) && ancillary() === ancillaryBefore,
          'LOCAL_PARTIAL_MUTATED_STATE',
        )
        summary.partialFixRejected = true
      },
    )
    requireLocal(summary.partialFixRejected, 'LOCAL_PARTIAL_PROOF_REQUIRED')
    await t.test(
      'green: identical writer/CLI path deploys only 0006 with both child env variables',
      () => {
        stage = 'corrected-child'
        const corrected = invoke(staged, 'Corrected', 'postgres')
        requireLocal(
          corrected.childExitCode === 0 &&
            corrected.migrationsApplied &&
            !corrected.schemaEnvironmentFailure,
          'LOCAL_CORRECTED_DEPLOYMENT_FAILED',
        )
        summary.correctedDeployment = true
      },
    )
    requireLocal(summary.correctedDeployment, 'LOCAL_GREEN_REQUIRED')
    await t.test(
      'postflight: exact ledger/helper, all existing catalog/data/security preserved',
      () => {
        stage = 'postflight'
        const after = inventory()
        checkLedger(after.catalog, 6)
        const newKeys = [
          'function:pathways.runtime_auth_session_live(p_subject uuid, p_session uuid)',
          'function-acl:pathways.runtime_auth_session_live(p_subject uuid, p_session uuid)',
        ]
        summary.catalogPreserved =
          after.catalog.objects.length === 1195 &&
          same(
            after.catalog.objects.filter((o) => !newKeys.includes(o.key)),
            before.catalog.objects,
          ) &&
          ancillary() === ancillaryBefore
        summary.dataPreserved =
          same(before.data, after.data) &&
          after.data.length === 54 &&
          after.catalog.legacyTables === 15 &&
          after.catalog.targetTables === 39
        summary.helperValid =
          after.liveness.valid &&
          after.liveness.providerCompatible &&
          after.liveness.sameNameCount === 1 &&
          !after.liveness.runtimeDirectSessionSelect &&
          !after.liveness.runtimeAuthUsage &&
          after.catalog.runtimeSafe
        requireLocal(
          summary.catalogPreserved && summary.dataPreserved && summary.helperValid,
          'LOCAL_POSTFLIGHT_FAILED',
        )
        requireLocal(same(process.env, parentEnv), 'LOCAL_PARENT_ENV_CHANGED')
        requireLocal(
          preserved.every(([file, hash]) => sha256(fs.readFileSync(file)) === hash),
          'LOCAL_IMMUTABLE_CHANGED',
        )
        summary.status = 'PASS'
      },
    )
  } catch (error) {
    summary.failureStage = stage
    summary.failureCode = /^LOCAL_[A-Za-z0-9_-]+$/.test(error.message)
      ? error.message
      : 'LOCAL_ASSERTION_FAILED'
    // No raw child diagnostics, SQL, identifiers or inventory hashes in TAP.
    throw new Error(`LOCAL_REPLAY_FAILED_AT_${stage}`)
  } finally {
    const resolved = fs.realpathSync(scratch)
    requireLocal(
      resolved === scratch &&
        path.dirname(resolved) === fs.realpathSync(path.join(root, '.tmp')) &&
        /^pathways-session-liveness-[A-Za-z0-9]+$/.test(path.basename(resolved)) &&
        (!fs.existsSync(data) || !fs.lstatSync(data).isSymbolicLink()),
      'LOCAL_CLEANUP_TARGET',
    )
    if (startAttempted) {
      const stop = run(path.join(pgBin, 'pg_ctl.exe'), [
        '-D',
        data,
        '-m',
        'fast',
        '-w',
        '-t',
        '15',
        'stop',
      ])
      const status = run(path.join(pgBin, 'pg_ctl.exe'), ['-D', data, 'status'])
      stopped =
        !status.error &&
        status.status === 3 &&
        !fs.existsSync(path.join(data, 'postmaster.pid')) &&
        !stop.error &&
        (stop.status === 0 || stop.status === 1)
    } else {
      stopped = !fs.existsSync(path.join(data, 'postmaster.pid'))
    }
    summary.localStopped = stopped
    if (stopped) {
      fs.rmSync(resolved, { recursive: true })
      summary.localRemoved = !fs.existsSync(resolved)
    }
    t.diagnostic(JSON.stringify(summary))
    requireLocal(stopped && summary.localRemoved, 'LOCAL_CLEANUP_UNCERTAIN_DIRECTORY_PRESERVED')
  }
  await requireFreePort()
})
