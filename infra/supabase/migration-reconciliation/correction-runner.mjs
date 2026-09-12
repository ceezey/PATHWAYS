import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { cleanEnvironment, pgBin, requireCheck, root } from './config.mjs'
import {
  canonicalObjectCount,
  canonicalVectorSha256,
  classifyComparison,
  correctionLocalPort,
  directory,
  knownDifferences,
  parseComparison,
  targetDefinitionSha256,
  validateArguments,
  verifyCorrectionSources,
} from './correction-config.mjs'

const correctionSql = fs.readFileSync(path.join(directory, 'correction.sql'), 'utf8')
const rollbackSql = fs.readFileSync(path.join(directory, 'correction-rollback.sql'), 'utf8')
const verifySql = fs.readFileSync(path.join(directory, 'correction-verify.sql'), 'utf8')

function execute(file, args, env, input, allowedStatuses = [0], timeout = 60_000) {
  const starting = file.endsWith('pg_ctl.exe') && args.includes('start')
  const result = spawnSync(file, args, {
    env,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: starting ? 'ignore' : 'pipe',
    timeout,
    maxBuffer: 12 * 1024 * 1024,
  })
  requireCheck(!result.error && allowedStatuses.includes(result.status), 'CORRECTION_CHILD')
  return { status: result.status, stdout: result.stdout?.trim() ?? '' }
}

function runComparison(env) {
  const output = execute(
    process.execPath,
    [path.join(directory, 'runner.mjs'), '--compare-dev'],
    env,
    undefined,
    [0, 1],
    180_000,
  )
  return parseComparison(output.stdout)
}

function parseWriter(stdout) {
  try {
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '')
  } catch {
    throw new Error('WRITER_OUTPUT')
  }
}

async function runLocal() {
  const env = cleanEnvironment()
  let evidence
  let started = false
  let stage = 'local-preflight'
  let assertions = 0
  let failed = false
  /** @type {Record<string, unknown>} */
  let result = {}
  const command = (name, args, input, allowed = [0]) =>
    execute(path.join(pgBin, `${name}.exe`), args, env, input, allowed)
  const sql = (query, database = 'postgres', allowed = [0]) =>
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
        String(correctionLocalPort),
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
  const check = (condition, code) => {
    requireCheck(condition, code)
    assertions += 1
  }
  const verify = () =>
    JSON.parse(
      sql(
        `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=pg_catalog;
${verifySql}
ROLLBACK;`,
      ).stdout,
    )
  const expectRejected = (query, database = 'postgres') => {
    const rejected = sql(query, database, [3])
    check(rejected.status === 3, 'EXPECTED_REJECTION')
  }
  const restoreFixture = () => {
    sql('DROP FUNCTION IF EXISTS public.pathways_prevent_audit_mutation() RESTRICT;')
    sql(rollbackSql)
  }

  try {
    verifyCorrectionSources()
    const listener = net.createServer()
    await new Promise((resolve, reject) =>
      listener
        .once('error', reject)
        .listen(correctionLocalPort, '127.0.0.1', () => resolve(undefined)),
    )
    await new Promise((resolve) => listener.close(resolve))
    evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-correction-'))
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
    started = true
    command('pg_ctl', [
      '-D',
      data,
      '-l',
      path.join(evidence, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${correctionLocalPort}`,
      '-w',
      '-t',
      '15',
      'start',
    ])
    stage = 'fixture'
    sql(`
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE prisma NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE pathways_runtime NOLOGIN;
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
  (id, checksum, finished_at, migration_name, applied_steps_count)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab',
   now(), '0001_init', 1);
CREATE TABLE public.correction_unrelated (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO public.correction_unrelated VALUES (1, 'preserve-canary');
CREATE FUNCTION public.correction_unrelated_function() RETURNS integer
LANGUAGE sql IMMUTABLE AS 'SELECT 7';
`)
    const unrelatedBefore = sql(`SELECT jsonb_build_object(
      'rows',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.correction_unrelated x),
      'function',encode(extensions.digest(convert_to(pg_get_functiondef(
        'public.correction_unrelated_function()'::regprocedure),'UTF8'),'sha256'),'hex'),
      'ledger',(SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM public._prisma_migrations m)
    );`).stdout

    stage = 'restoration-success'
    sql(rollbackSql)
    let state = verify()
    check(state.sameNameCount === 1 && state.exactCount === 1, 'RESTORE_SIGNATURE')
    check(
      state.definitionMatches && state.ownerMatches && state.securityInvoker,
      'RESTORE_DEFINITION',
    )
    check(state.aclMatches && state.attachedTriggers === 0 && state.dependents === 0, 'RESTORE_ACL')

    stage = 'correction-success'
    sql(correctionSql)
    state = verify()
    check(state.sameNameCount === 0 && state.exactCount === 0, 'CORRECTION_ABSENT')
    expectRejected(correctionSql)

    stage = 'definition-drift'
    sql(rollbackSql)
    sql(`CREATE OR REPLACE FUNCTION public.pathways_prevent_audit_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'changed'; END;$$;`)
    expectRejected(correctionSql)
    restoreFixture()

    stage = 'owner-drift'
    sql('ALTER FUNCTION public.pathways_prevent_audit_mutation() OWNER TO postgres;')
    expectRejected(correctionSql)
    restoreFixture()

    stage = 'grant-drift'
    sql('GRANT EXECUTE ON FUNCTION public.pathways_prevent_audit_mutation() TO authenticated;')
    expectRejected(correctionSql)
    sql('REVOKE EXECUTE ON FUNCTION public.pathways_prevent_audit_mutation() FROM authenticated;')

    stage = 'dependency-drift'
    sql('CREATE TABLE public.correction_audit_probe(id integer);')
    sql(`CREATE TRIGGER correction_dependency
      BEFORE INSERT ON public.correction_audit_probe
      FOR EACH ROW EXECUTE FUNCTION public.pathways_prevent_audit_mutation();`)
    expectRejected(correctionSql)
    sql('DROP TRIGGER correction_dependency ON public.correction_audit_probe;')

    stage = 'post-drift-correction'
    sql(correctionSql)
    check(verify().sameNameCount === 0, 'POST_DRIFT_CORRECTION')

    stage = 'rollback-conflict'
    sql(`CREATE FUNCTION public.pathways_prevent_audit_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END;$$;`)
    expectRejected(rollbackSql)
    sql('DROP FUNCTION public.pathways_prevent_audit_mutation() RESTRICT;')
    sql(rollbackSql)

    stage = 'incorrect-target'
    command('createdb', [
      '-w',
      '-h',
      '127.0.0.1',
      '-p',
      String(correctionLocalPort),
      '-U',
      'postgres',
      'pathways_wrong_target',
    ])
    expectRejected(correctionSql, 'pathways_wrong_target')

    stage = 'preservation'
    state = verify()
    check(state.definitionMatches && state.ownerMatches && state.aclMatches, 'FINAL_RESTORATION')
    check(state.attachedTriggers === 0 && state.dependents === 0, 'FINAL_DEPENDENCIES')
    check(
      sql(`SELECT encode(extensions.digest(convert_to(pg_get_functiondef(
        'public.pathways_prevent_audit_mutation()'::regprocedure),'UTF8'),'sha256'),'hex');`)
        .stdout === targetDefinitionSha256,
      'FINAL_FINGERPRINT',
    )
    check(
      sql(`SELECT jsonb_build_object(
        'rows',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.correction_unrelated x),
        'function',encode(extensions.digest(convert_to(pg_get_functiondef(
          'public.correction_unrelated_function()'::regprocedure),'UTF8'),'sha256'),'hex'),
        'ledger',(SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM public._prisma_migrations m)
      );`).stdout === unrelatedBefore,
      'UNRELATED_PRESERVATION',
    )
    check(
      Number(sql('SELECT count(*) FROM public.correction_audit_probe;').stdout) === 0,
      'DEPENDENCY_TABLE_PRESERVED',
    )
    result = {
      status: 'PASS',
      mode: '--local',
      assertions,
      localPort: correctionLocalPort,
      hostedWrites: 0,
      localClusterStopped: false,
    }
  } catch {
    failed = true
    result = { status: 'FAILED', mode: '--local', stage, hostedWrites: 0 }
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
    if (evidence) {
      result.evidence = path.relative(root, evidence).replaceAll('\\', '/')
      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
    }
  }
  return { exitCode: failed || result.status !== 'PASS' ? 1 : 0, result }
}

function runHosted(mode, env) {
  const preflight = runComparison(env)
  const initialState = classifyComparison(preflight)
  if (mode === '--check-dev') {
    return {
      exitCode: initialState === 'BLOCKED' ? 1 : 0,
      result: {
        status: initialState === 'BLOCKED' ? 'BLOCKED' : 'PASS',
        mode,
        state: initialState,
        canonicalObjects: canonicalObjectCount,
        canonicalSha256: canonicalVectorSha256,
        hostedLedgerPrefix: 1,
        hostedWrites: 0,
      },
    }
  }
  const expected = mode === '--apply-dev' ? 'READY_TO_CORRECT' : 'READY_TO_ROLLBACK'
  requireCheck(initialState === expected, 'LIVE_PREFLIGHT')
  const action = mode === '--apply-dev' ? 'Correct' : 'Rollback'
  const writerArgs =
    action === 'Correct'
      ? [
          '-Action',
          action,
          '-Authorization',
          'PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY',
          '-BackupRestoreConfirmed',
          '-MaintenanceConfirmed',
        ]
      : [
          '-Action',
          action,
          '-Authorization',
          'PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY',
          '-RecoveryAuthorized',
          '-MaintenanceConfirmed',
        ]
  let writeResult
  try {
    const writer = execute(
      path.join(env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(directory, 'Write-DevCorrection.ps1'),
        ...writerArgs,
      ],
      env,
      undefined,
      [0, 1, 2],
      70_000,
    )
    writeResult = parseWriter(writer.stdout)
  } catch {
    return {
      exitCode: 2,
      result: {
        status: 'UNCERTAIN',
        mode,
        stage: 'write',
        hostedWriteAttempts: 1,
      },
    }
  }
  if (writeResult.status !== 'PASS') {
    return {
      exitCode: writeResult.status === 'UNCERTAIN' ? 2 : 1,
      result: {
        status: writeResult.status,
        mode,
        stage: 'write',
        hostedWriteAttempts: 1,
        processId: writeResult.processId,
      },
    }
  }
  let finalState
  try {
    finalState = classifyComparison(runComparison(env))
  } catch {
    return {
      exitCode: 2,
      result: {
        status: 'UNCERTAIN',
        mode,
        stage: 'postflight',
        hostedWriteAttempts: 1,
      },
    }
  }
  const expectedFinal = action === 'Correct' ? 'READY_TO_ROLLBACK' : 'READY_TO_CORRECT'
  if (finalState !== expectedFinal) {
    return {
      exitCode: 1,
      result: {
        status: 'BLOCKED',
        mode,
        stage: 'postflight',
        state: finalState,
        hostedWriteAttempts: 1,
      },
    }
  }
  return {
    exitCode: 0,
    result: {
      status: 'PASS',
      mode,
      action,
      state: finalState,
      canonicalObjects: canonicalObjectCount,
      canonicalSha256: canonicalVectorSha256,
      hostedLedgerPrefix: 1,
      hostedWriteAttempts: 1,
    },
  }
}

export async function run(args) {
  let mode
  try {
    mode = validateArguments(args)
    verifyCorrectionSources()
    if (mode === '--local') return await runLocal()
    return runHosted(mode, cleanEnvironment())
  } catch {
    return {
      exitCode: 1,
      result: { status: 'FAILED', mode: mode ?? 'rejected', hostedWrites: 0 },
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.join(directory, 'correction-runner.mjs')
) {
  const { exitCode, result } = await run(process.argv.slice(2))
  console.log(JSON.stringify(result))
  process.exitCode = exitCode
}

export const correctionReview = Object.freeze({
  canonicalObjectCount,
  canonicalVectorSha256,
  knownDifferences,
})
