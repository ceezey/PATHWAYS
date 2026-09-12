import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertLedger,
  cleanEnvironment,
  compareObjects,
  localDatabase,
  localPort,
  migrations,
  pgBin,
  requireCheck,
  root,
  sha256,
  validateLocalUrl,
  validateStaging,
  verifySources,
} from './config.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const inventory = fs.readFileSync(path.join(directory, 'inventory.sql'), 'utf8')
export const readOnlySql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;
${inventory}
ROLLBACK;`

export function assertSnapshot(snapshot, ledgerLength, database) {
  requireCheck(
    snapshot.version === 1 &&
      snapshot.readOnly === true &&
      snapshot.user === 'postgres' &&
      snapshot.sessionUser === 'postgres' &&
      snapshot.database === database &&
      snapshot.serverVersion >= 170000 &&
      snapshot.serverVersion < 190000,
    'SNAPSHOT_CONNECTION',
  )
  requireCheck(
    JSON.stringify(snapshot.ledgerLocations) === '["public"]' &&
      snapshot.otherLedger === false &&
      snapshot.livenessAbsent === true &&
      snapshot.targetTables === 39 &&
      snapshot.legacyTables === 15 &&
      snapshot.pgcryptoPresent === true,
    'SNAPSHOT_BASELINE',
  )
  assertLedger(snapshot.ledger, ledgerLength)
  requireCheck(
    Array.isArray(snapshot.objects) &&
      snapshot.objects.length > 1000 &&
      snapshot.objects.length < 10000 &&
      snapshot.objects.every(
        (row) =>
          typeof row.key === 'string' &&
          row.key.length < 1000 &&
          /^[a-f0-9]{64}$/.test(row.fingerprint),
      ),
    'SNAPSHOT_FORMAT',
  )
}

function execute(file, args, env, input, expectedStatus = 0) {
  const starting = file.endsWith('pg_ctl.exe') && args.includes('start')
  const result = spawnSync(file, args, {
    env,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: starting ? 'ignore' : 'pipe',
    timeout: 60_000,
    maxBuffer: 12 * 1024 * 1024,
  })
  // Never serialize an exception, argv, provider stdout/stderr, or env values.
  requireCheck(!result.error && result.status === expectedStatus, 'CHILD_FAILED')
  return result.stdout?.trim() ?? ''
}

export async function run(mode) {
  requireCheck(['--local', '--compare-dev'].includes(mode), 'MODE')
  verifySources()
  let stage = 'local-preflight'
  let evidence
  let started = false
  let failed = false
  /** @type {{status: string, hostedWrites: number, mode?: string, stage?: string,
   * localAssertions?: number, canonicalObjects?: number, localServerVersion?: number,
   * canonicalSha256?: string, localClusterStopped?: boolean, cleanupFailed?: boolean,
   * hostedServerVersion?: number, differences?: {key: string, kind: string}[],
   * hostedLedgerPrefix?: number, baseliningAuthorized?: boolean, evidence?: string}} */
  let result
  const env = cleanEnvironment()
  const command = (name, args, input, expected = 0) =>
    execute(path.join(pgBin, `${name}.exe`), args, env, input, expected)
  const sql = (query, expected = 0) =>
    command(
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
        String(localPort),
        '-U',
        'postgres',
        '-d',
        localDatabase,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      query,
      expected,
    )
  const snapshot = () => JSON.parse(sql(readOnlySql))
  try {
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener.once('error', reject).listen(localPort, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))
    evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-reconcile-'))
    const data = path.join(evidence, 'data')
    stage = 'initdb'
    command('initdb', [
      '-D',
      data,
      '-U',
      'postgres',
      '-A',
      'trust',
      '--encoding=UTF8',
      '--locale=C',
    ])
    stage = 'start-local'
    // Cleanup checks the private data directory even if startup times out.
    started = true
    command('pg_ctl', [
      '-D',
      data,
      '-l',
      path.join(evidence, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${localPort}`,
      '-w',
      '-t',
      '15',
      'start',
    ])
    command('createdb', [
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      String(localPort),
      '-U',
      'postgres',
      localDatabase,
    ])
    stage = 'synthetic-bootstrap'
    sql(
      fs.readFileSync(
        path.join(root, 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql'),
        'utf8',
      ),
    )
    const staged = path.join(evidence, 'migrations')
    fs.mkdirSync(staged)
    const sources = path.join(root, 'apps/api/prisma/migrations')
    fs.copyFileSync(
      path.join(sources, 'migration_lock.toml'),
      path.join(staged, 'migration_lock.toml'),
    )
    for (const [name] of migrations.slice(0, 4)) {
      fs.cpSync(path.join(sources, name), path.join(staged, name), {
        recursive: true,
        errorOnExist: true,
      })
    }
    const deploy = (role) => {
      verifySources()
      validateStaging(staged)
      const url = validateLocalUrl(
        `postgresql://${role}@127.0.0.1:${localPort}/${localDatabase}?sslmode=disable&connection_limit=1`,
      )
      return execute(
        process.execPath,
        [
          path.join(root, 'apps/api/node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--config',
          path.join(directory, 'prisma.replay.config.ts'),
        ],
        {
          ...env,
          PATHWAYS_RECONCILE_STAGE: staged,
          PATHWAYS_RECONCILE_LOCAL_URL: url,
          DIRECT_URL: url,
          DATABASE_URL: url,
        },
      )
    }
    stage = 'replay-0001-0004'
    deploy('prisma')
    const [fifth] = migrations[4]
    fs.cpSync(path.join(sources, fifth), path.join(staged, fifth), {
      recursive: true,
      errorOnExist: true,
    })
    stage = 'replay-0005'
    deploy('postgres')
    stage = 'canonical-inventory'
    const canonical = snapshot()
    assertSnapshot(canonical, 5, localDatabase)
    fs.writeFileSync(path.join(evidence, 'canonical.json'), JSON.stringify(canonical, null, 2))
    fs.writeFileSync(
      path.join(evidence, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          migrations,
          files: Object.fromEntries(
            [
              'config.mjs',
              'inventory.sql',
              'runner.mjs',
              'Read-Dev.ps1',
              'prisma.replay.config.ts',
              'runner.test.mjs',
            ].map((name) => [name, sha256(fs.readFileSync(path.join(directory, name)))]),
          ),
        },
        null,
        2,
      ),
    )

    stage = 'negative-tests'
    const cases = [
      ['nullability', 'ALTER TABLE pathways.organizations ALTER COLUMN name DROP NOT NULL;'],
      ['default', "ALTER TABLE pathways.organizations ALTER COLUMN name SET DEFAULT 'synthetic';"],
      [
        'constraint',
        'ALTER TABLE pathways.organizations ADD CONSTRAINT reconciliation_probe CHECK(length(name)>2);',
      ],
      ['index', 'CREATE INDEX reconciliation_probe ON pathways.organizations(name);'],
      ['trigger', 'ALTER TABLE pathways.system_users DISABLE TRIGGER USER;'],
      ['function', 'ALTER FUNCTION pathways.runtime_context_user() SET search_path=public;'],
      ['policy', 'ALTER POLICY p4_runtime_select ON pathways.organizations USING (true);'],
      ['rls', 'ALTER TABLE pathways.organizations DISABLE ROW LEVEL SECURITY;'],
      ['table-acl', 'GRANT SELECT ON pathways.organizations TO anon;'],
      ['column-acl', 'GRANT UPDATE(name) ON pathways.organizations TO anon;'],
      ['function-acl', 'GRANT EXECUTE ON FUNCTION pathways.runtime_context_user() TO anon;'],
      ['enum-acl', 'GRANT USAGE ON TYPE pathways.organization_status TO anon;'],
      ['schema-acl', 'GRANT USAGE ON SCHEMA pathways TO anon;'],
      [
        'default-acl',
        'ALTER DEFAULT PRIVILEGES FOR ROLE prisma GRANT EXECUTE ON FUNCTIONS TO anon;',
      ],
      ['extra-object', 'CREATE TABLE pathways.reconciliation_probe(id integer);'],
      ['missing-table', 'ALTER TABLE pathways.organizations RENAME TO reconciliation_probe;'],
    ]
    for (const [name, mutation] of cases) {
      stage = `negative-${name}`
      const changed = JSON.parse(
        sql(`BEGIN; SET LOCAL search_path=pg_catalog; ${mutation}\n${inventory}\nROLLBACK;`),
      )
      requireCheck(
        compareObjects(canonical.objects, changed.objects).length > 0,
        'DRIFT_NOT_DETECTED',
      )
    }
    stage = 'readonly-rejections'
    sql('BEGIN READ ONLY; CREATE TABLE public.reconciliation_probe(id integer);', 3)
    sql("BEGIN READ ONLY; UPDATE public._prisma_migrations SET checksum='synthetic';", 3)
    sql('BEGIN READ ONLY; GRANT SELECT ON pathways.organizations TO anon;', 3)
    const after = snapshot()
    assertSnapshot(after, 5, localDatabase)
    requireCheck(
      compareObjects(canonical.objects, after.objects).length === 0 &&
        JSON.stringify(canonical.ledger) === JSON.stringify(after.ledger),
      'LOCAL_PRESERVATION',
    )
    verifySources()
    result = {
      status: 'PASS',
      mode,
      localAssertions: cases.length + 3 + 2,
      canonicalObjects: canonical.objects.length,
      localServerVersion: canonical.serverVersion,
      canonicalSha256: sha256(JSON.stringify(canonical.objects)),
      hostedWrites: 0,
      localClusterStopped: false,
    }
    if (mode === '--compare-dev') {
      stage = 'hosted-readonly'
      // No user SQL, URL, credentials, migration commands or env overrides are
      // accepted by this read-only wrapper. Its output is consumed in memory.
      const observed = JSON.parse(
        execute(
          path.join(env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
          ['-NoProfile', '-NonInteractive', '-File', path.join(directory, 'Read-Dev.ps1')],
          env,
        ),
      )
      assertSnapshot(observed, 1, 'postgres')
      requireCheck(observed.runtimeSafe === true, 'HOSTED_RUNTIME_BOUNDARY')
      const differences = compareObjects(canonical.objects, observed.objects)
      result.hostedServerVersion = observed.serverVersion
      result.differences = differences
      result.status = differences.length === 0 ? 'PASS' : 'BLOCKED'
      result.hostedLedgerPrefix = 1
      result.baseliningAuthorized = false
    }
  } catch {
    failed = true
    result = { status: 'FAILED', stage, hostedWrites: 0 }
  } finally {
    if (started && evidence) {
      try {
        command('pg_ctl', [
          '-D',
          path.join(evidence, 'data'),
          '-m',
          'fast',
          '-w',
          '-t',
          '15',
          'stop',
        ])
        result.localClusterStopped = true
      } catch {
        failed = true
        result = { ...result, status: 'FAILED', cleanupFailed: true }
      }
    }
    if (evidence) result.evidence = path.relative(root, evidence).replaceAll('\\', '/')
    if (evidence)
      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  }
  console.log(JSON.stringify(result))
  return failed || result.status !== 'PASS' ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['--local', '--compare-dev'].includes(process.argv[2])) {
    console.log('RECONCILIATION_MODE_REJECTED')
    process.exitCode = 1
  } else {
    process.exitCode = await run(process.argv[2])
  }
}
