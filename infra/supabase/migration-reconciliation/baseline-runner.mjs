import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDataInventory,
  baselineAuthorization,
  baselineDirectory,
  baselineLocalDatabase,
  baselineLocalPort,
  baselineVectorHash,
  canonicalObjectCount,
  canonicalVectorSha256,
  compareDataInventory,
  expectedHostedDataTables,
  parseWriterResult,
  validateBaselineArguments,
  validateBaselineEvidence,
  validateBaselineSelection,
  validateBaselineStaging,
  validateBaselineUrl,
  verifyBaselineSources,
} from './baseline-config.mjs'
import {
  assertLedger,
  cleanEnvironment,
  compareObjects,
  migrations,
  pgBin,
  localDatabase as reconciliationLocalDatabase,
  requireCheck,
  root,
} from './config.mjs'
import { assertSnapshot } from './runner.mjs'

const prismaEntry = path.join(root, 'apps/api/node_modules/prisma/build/index.js')
const prismaConfig = path.join(baselineDirectory, 'prisma.baseline.config.ts')

function execute(file, args, env, options = {}) {
  const starting = file.endsWith('pg_ctl.exe') && args.includes('start')
  const result = spawnSync(file, args, {
    env,
    input: options.input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: starting ? 'ignore' : 'pipe',
    timeout: options.timeout ?? 60_000,
    maxBuffer: 24 * 1024 * 1024,
  })
  requireCheck(!result.error, 'BASELINE_CHILD')
  const allowed = options.allowedStatuses ?? [0]
  requireCheck(allowed.includes(result.status), 'BASELINE_CHILD')
  return { status: result.status, stdout: result.stdout?.trim() ?? '' }
}

async function assertPortFree(port) {
  const listener = net.createServer()
  await new Promise((resolve, reject) =>
    listener.once('error', reject).listen(port, '127.0.0.1', () => resolve(undefined)),
  )
  await new Promise((resolve) => listener.close(resolve))
}

function stageMigrations(evidence) {
  const staged = path.join(evidence, 'migrations')
  fs.mkdirSync(staged)
  const source = path.join(root, 'apps/api/prisma/migrations')
  for (const [name] of migrations) {
    fs.cpSync(path.join(source, name), path.join(staged, name), {
      recursive: true,
      errorOnExist: true,
    })
  }
  fs.copyFileSync(
    path.join(source, 'migration_lock.toml'),
    path.join(staged, 'migration_lock.toml'),
  )
  return validateBaselineStaging(staged)
}

function parseJson(value, code) {
  try {
    return JSON.parse(value.trim().split(/\r?\n/).at(-1) ?? '')
  } catch {
    throw new Error(code)
  }
}

function readHosted(env) {
  const output = execute(
    path.join(env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(baselineDirectory, 'Read-DevBaseline.ps1'),
    ],
    env,
    { timeout: 180_000 },
  ).stdout
  const result = parseJson(output, 'BASELINE_HOSTED_READ')
  requireCheck(result?.catalog && result?.data && result?.maintenance, 'BASELINE_HOSTED_READ')
  return result
}

function loadCanonical(env) {
  const output = execute(
    process.execPath,
    [path.join(baselineDirectory, 'runner.mjs'), '--local'],
    env,
    { timeout: 180_000 },
  ).stdout
  const result = parseJson(output, 'BASELINE_CANONICAL_RESULT')
  requireCheck(
    result.status === 'PASS' &&
      result.canonicalObjects === canonicalObjectCount &&
      result.canonicalSha256 === canonicalVectorSha256 &&
      result.hostedWrites === 0 &&
      result.localClusterStopped === true,
    'BASELINE_CANONICAL_RESULT',
  )
  const evidence = path.resolve(root, result.evidence)
  const expectedParent = fs.realpathSync(path.join(root, '.tmp'))
  requireCheck(
    path.dirname(evidence) === expectedParent &&
      /^pathways-reconcile-[A-Za-z0-9]+$/.test(path.basename(evidence)),
    'BASELINE_CANONICAL_PATH',
  )
  const canonical = JSON.parse(fs.readFileSync(path.join(evidence, 'canonical.json'), 'utf8'))
  assertSnapshot(canonical, 5, reconciliationLocalDatabase)
  requireCheck(
    canonical.objects.length === canonicalObjectCount &&
      baselineVectorHash(canonical.objects) === canonicalVectorSha256,
    'BASELINE_CANONICAL_FINGERPRINT',
  )
  return canonical
}

function verifyHostedState(state, prefix, canonical, expectedData) {
  assertSnapshot(state.catalog, prefix, 'postgres')
  requireCheck(state.catalog.runtimeSafe === true, 'BASELINE_RUNTIME_BOUNDARY')
  requireCheck(
    state.catalog.objects.length === canonicalObjectCount &&
      baselineVectorHash(state.catalog.objects) === canonicalVectorSha256 &&
      compareObjects(canonical.objects, state.catalog.objects).length === 0,
    'BASELINE_CATALOG_CHANGED',
  )
  assertDataInventory(state.data, expectedHostedDataTables)
  if (expectedData) compareDataInventory(expectedData, state.data)
  requireCheck(
    Number(state.maintenance.matchingSessions) === 0 &&
      Number(state.maintenance.activeOrTransactional) === 0,
    'BASELINE_MAINTENANCE_REQUIRED',
  )
}

function runPrismaResolve(name, staged, url, env, allowedStatuses = [0]) {
  const childEnv = {
    ...env,
    PATHWAYS_BASELINE_MODE: 'local',
    PATHWAYS_BASELINE_STAGE: staged,
    PATHWAYS_BASELINE_URL: url,
    DATABASE_URL: url,
    DIRECT_URL: url,
  }
  return execute(
    process.execPath,
    [prismaEntry, 'migrate', 'resolve', '--applied', name, '--config', prismaConfig],
    childEnv,
    { timeout: 90_000, allowedStatuses },
  )
}

async function runLocal(env, evidence) {
  let started = false
  let stage = 'local-port'
  const dataDirectory = path.join(evidence, 'data')
  const command = (name, args, input, allowedStatuses = [0]) =>
    execute(path.join(pgBin, `${name}.exe`), args, env, { input, allowedStatuses })
  const sql = (query) =>
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
        String(baselineLocalPort),
        '-U',
        'postgres',
        '-d',
        baselineLocalDatabase,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      query,
    ).stdout
  let result
  try {
    await assertPortFree(baselineLocalPort)
    stage = 'local-init'
    command('initdb', [
      '-D',
      dataDirectory,
      '-U',
      'postgres',
      '-A',
      'trust',
      '--encoding=UTF8',
      '--locale=C',
    ])
    stage = 'local-start'
    command('pg_ctl', [
      '-D',
      dataDirectory,
      '-l',
      path.join(evidence, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${baselineLocalPort}`,
      '-w',
      '-t',
      '15',
      'start',
    ])
    started = true
    command('createdb', [
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      String(baselineLocalPort),
      '-U',
      'postgres',
      baselineLocalDatabase,
    ])
    stage = 'local-fixture'
    sql(`
CREATE TABLE public._prisma_migrations (
  id varchar(36) PRIMARY KEY,
  checksum varchar(64) NOT NULL,
  finished_at timestamptz,
  migration_name varchar(255) NOT NULL,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0
);
INSERT INTO public._prisma_migrations
  (id,checksum,finished_at,migration_name,applied_steps_count)
VALUES ('00000000-0000-0000-0000-000000000001',
  '${migrations[0][1]}',now(),'${migrations[0][0]}',1);
CREATE TABLE public.baseline_preservation_canary (
  id integer PRIMARY KEY,
  value text NOT NULL DEFAULT 'preserved'
);
INSERT INTO public.baseline_preservation_canary(id) VALUES (1);
ALTER TABLE public.baseline_preservation_canary ENABLE ROW LEVEL SECURITY;
CREATE POLICY baseline_preservation_policy ON public.baseline_preservation_canary
  FOR SELECT TO PUBLIC USING (value = 'preserved');
`)
    const staged = stageMigrations(evidence)
    const url = validateBaselineUrl(
      `postgresql://postgres@127.0.0.1:${baselineLocalPort}/${baselineLocalDatabase}?sslmode=disable&connection_limit=1`,
      'local',
    )
    const ledger = () =>
      JSON.parse(
        sql(`SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,
          'rolledBack',rolled_back_at IS NOT NULL,
          'failureLog',coalesce(length(logs)>0,false),'steps',applied_steps_count)
          ORDER BY migration_name COLLATE "C"),'[]'::jsonb)
          FROM public._prisma_migrations;`),
      )
    const canary = () =>
      sql(`SELECT encode(sha256(convert_to(jsonb_build_object(
        'rows',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.baseline_preservation_canary c),
        'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
          pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid='public.baseline_preservation_canary'::regclass AND a.attnum>0 AND NOT a.attisdropped),
        'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity)
          FROM pg_class WHERE oid='public.baseline_preservation_canary'::regclass),
        'policy',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,pg_get_expr(polqual,polrelid)) ORDER BY polname)
          FROM pg_policy WHERE polrelid='public.baseline_preservation_canary'::regclass)
      )::text,'UTF8')),'hex');`)
    const originalCanary = canary()
    assertLedger(ledger(), 1)

    const verifiedPrefixes = []
    for (let prefix = 1; prefix <= 4; prefix++) {
      const [name] = validateBaselineSelection(migrations[prefix][0], prefix)
      stage = `local-${name}`
      runPrismaResolve(name, staged, url, env)
      assertLedger(ledger(), prefix + 1)
      requireCheck(canary() === originalCanary, 'BASELINE_LOCAL_PHYSICAL_CHANGE')
      verifiedPrefixes.push(prefix + 1)
    }
    stage = 'local-duplicate-rejection'
    const duplicate = runPrismaResolve(migrations[4][0], staged, url, env, [1])
    requireCheck(duplicate.status === 1, 'BASELINE_DUPLICATE_NOT_REJECTED')
    assertLedger(ledger(), 5)
    requireCheck(canary() === originalCanary, 'BASELINE_LOCAL_REJECTION_CHANGED_STATE')
    result = {
      status: 'PASS',
      mode: 'local',
      stage: 'complete',
      resolvedMigrations: 4,
      verifiedPrefixes,
      localAssertions: 14,
      hostedConnections: 0,
      hostedWriteAttempts: 0,
      localClusterStopped: false,
    }
  } catch {
    result = {
      status: 'FAILED',
      mode: 'local',
      stage,
      hostedConnections: 0,
      hostedWriteAttempts: 0,
      localClusterStopped: false,
    }
  } finally {
    if (started) {
      try {
        command('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', '-t', '15', 'stop'])
        result.localClusterStopped = true
      } catch {
        result = { ...result, status: 'FAILED', cleanupUncertain: true }
      }
    }
  }
  return result
}

function invokeWriter(name, prefix, staged, env) {
  const output = execute(
    path.join(env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(baselineDirectory, 'Write-DevBaseline.ps1'),
      '-Migration',
      name,
      '-ExpectedPrefix',
      String(prefix),
      '-StagePath',
      staged,
      '-Authorization',
      baselineAuthorization,
      '-BackupRestoreConfirmed',
      '-MaintenanceConfirmed',
    ],
    env,
    { timeout: 150_000, allowedStatuses: [0, 1, 2] },
  )
  return { status: output.status, result: parseWriterResult(output.stdout) }
}

async function runHosted(mode, env, evidence) {
  let stage = 'canonical-replay'
  let hostedConnections = 0
  let hostedWriteAttempts = 0
  try {
    const canonical = loadCanonical(env)
    stage = 'hosted-preflight'
    const initial = readHosted(env)
    hostedConnections += 1
    verifyHostedState(initial, 1, canonical)
    const initialData = initial.data
    if (mode === 'check-dev') {
      return {
        status: 'PASS',
        mode,
        stage: 'ready-to-baseline',
        canonicalObjects: canonicalObjectCount,
        hostedLedgerPrefix: 1,
        dataTablesVerified: expectedHostedDataTables,
        maintenanceReady: true,
        hostedConnections,
        hostedWriteAttempts,
      }
    }

    fs.writeFileSync(
      path.join(evidence, 'preflight.json'),
      JSON.stringify(
        {
          version: 1,
          initialLedgerPrefix: 1,
          canonicalObjects: canonicalObjectCount,
          canonicalSha256: canonicalVectorSha256,
          data: initialData,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    )

    const staged = stageMigrations(evidence)
    const verifiedPrefixes = []
    for (let prefix = 1; prefix <= 4; prefix++) {
      const [name] = validateBaselineSelection(migrations[prefix][0], prefix)
      stage = `write-${name}`
      const writer = invokeWriter(name, prefix, staged, env)
      if (writer.result.status !== 'FAILED') hostedWriteAttempts += 1
      if (writer.status !== 0 || writer.result.status !== 'PASS') {
        return {
          status: writer.result.status === 'FAILED' ? 'FAILED' : 'UNCERTAIN',
          mode,
          stage,
          hostedConnections,
          hostedWriteAttempts,
          lastConfirmedLedgerPrefix: prefix,
          recoveryRequired: true,
        }
      }
      stage = `verify-${name}`
      const observed = readHosted(env)
      hostedConnections += 1
      try {
        verifyHostedState(observed, prefix + 1, canonical, initialData)
      } catch {
        return {
          status: 'UNCERTAIN',
          mode,
          stage,
          hostedConnections,
          hostedWriteAttempts,
          lastConfirmedLedgerPrefix: prefix,
          recoveryRequired: true,
        }
      }
      verifiedPrefixes.push(prefix + 1)
    }
    return {
      status: 'PASS',
      mode,
      stage: 'complete',
      resolvedMigrations: 4,
      verifiedPrefixes,
      canonicalObjects: canonicalObjectCount,
      dataTablesVerified: expectedHostedDataTables,
      hostedLedgerPrefix: 5,
      hostedConnections,
      hostedWriteAttempts,
      nextState: 'READY_FOR_0006_REVIEW',
    }
  } catch {
    return {
      status: hostedWriteAttempts > 0 ? 'UNCERTAIN' : 'FAILED',
      mode,
      stage,
      hostedConnections,
      hostedWriteAttempts,
      recoveryRequired: hostedWriteAttempts > 0,
    }
  }
}

async function runRecovery(env, evidenceRelative) {
  let stage = 'recovery-evidence'
  let hostedConnections = 0
  try {
    const evidence = validateBaselineEvidence(evidenceRelative)
    const preflightPath = path.join(evidence, 'preflight.json')
    requireCheck(
      fs.existsSync(preflightPath) && !fs.lstatSync(preflightPath).isSymbolicLink(),
      'BASELINE_RECOVERY_EVIDENCE',
    )
    const preflight = JSON.parse(fs.readFileSync(preflightPath, 'utf8'))
    requireCheck(
      preflight.version === 1 &&
        preflight.initialLedgerPrefix === 1 &&
        preflight.canonicalObjects === canonicalObjectCount &&
        preflight.canonicalSha256 === canonicalVectorSha256,
      'BASELINE_RECOVERY_EVIDENCE',
    )
    assertDataInventory(preflight.data, expectedHostedDataTables)
    stage = 'recovery-canonical'
    const canonical = loadCanonical(env)
    stage = 'recovery-readonly'
    const observed = readHosted(env)
    hostedConnections += 1
    const prefix = observed.catalog?.ledger?.length
    requireCheck(Number.isInteger(prefix) && prefix >= 1 && prefix <= 5, 'BASELINE_RECOVERY_PREFIX')
    verifyHostedState(observed, prefix, canonical, preflight.data)
    return {
      status: 'PASS',
      mode: 'recover-dev',
      stage: 'reconciled-read-only',
      hostedLedgerPrefix: prefix,
      catalogUnchanged: true,
      dataUnchanged: true,
      maintenanceReady: true,
      hostedConnections,
      hostedWriteAttempts: 0,
      evidence: evidenceRelative,
    }
  } catch {
    return {
      status: 'FAILED',
      mode: 'recover-dev',
      stage,
      hostedConnections,
      hostedWriteAttempts: 0,
      recoveryRequired: true,
    }
  }
}

export async function run(argv = process.argv.slice(2)) {
  let result = {
    status: 'FAILED',
    mode: 'guard',
    stage: 'arguments',
    hostedConnections: 0,
    hostedWriteAttempts: 0,
  }
  let evidence
  try {
    const { mode, evidence: recoveryEvidence } = validateBaselineArguments(argv)
    verifyBaselineSources()
    if (mode === 'recover-dev') {
      result = await runRecovery(cleanEnvironment(), recoveryEvidence)
    } else {
      fs.mkdirSync(path.join(root, '.tmp'), { recursive: true })
      evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-baseline-'))
      result =
        mode === 'local'
          ? await runLocal(cleanEnvironment(), evidence)
          : await runHosted(mode, cleanEnvironment(), evidence)
    }
  } catch {
    // All provider, Prisma and filesystem detail remains suppressed.
  } finally {
    if (evidence) {
      result.evidence = path.relative(root, evidence).replaceAll('\\', '/')
      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
    }
  }
  console.log(JSON.stringify(result))
  return result.status === 'PASS' ? 0 : result.status === 'UNCERTAIN' ? 2 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run()
}
