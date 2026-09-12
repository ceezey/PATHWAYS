// Disposable PostgreSQL contract tests. Never reads .env/DPAPI or accepts a URL.
// Only this process's new loopback cluster and synthetic provider rows are changed.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const pgBin = 'C:/Program Files/PostgreSQL/18/bin'
const port = 55449
const database = 'pathways_liveness_review'
const migration = path.join(
  root,
  'apps/api/prisma/migrations/0006_auth_session_liveness/migration.sql',
)
const rollback = path.join(root, 'infra/supabase/session-liveness/rollback.sql')
const env = {
  ...process.env,
  PGHOST: '127.0.0.1',
  PGPORT: String(port),
  PGUSER: 'postgres',
  PGDATABASE: database,
  PGSSLMODE: 'disable',
  PGCONNECT_TIMEOUT: '5',
}
for (const name of [
  'PGPASSWORD',
  'PGPASSFILE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'DATABASE_URL',
  'DIRECT_URL',
  'SHADOW_DATABASE_URL',
])
  delete env[name]
let stage = 'preflight'
let evidence
let data
let started = false
let stopped = false
let assertions = 0

function run(executable, args, input, expectedFailure = false) {
  const result = spawnSync(executable, args, {
    input,
    // postgres can inherit pg_ctl's stdout handles on Windows and keep a pipe
    // open after pg_ctl exits. Startup diagnostics already go to postgres.log.
    stdio: args.includes('start') && executable.endsWith('pg_ctl.exe') ? 'ignore' : 'pipe',
    encoding: 'utf8',
    windowsHide: true,
    env,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || (expectedFailure ? result.status !== 3 : result.status !== 0)) {
    if (stage === 'start disposable cluster') {
      console.error(`LOCAL_START_STATUS=${result.status}; CODE=${result.error?.code ?? 'NONE'}`)
      process.stderr.write(result.stderr ?? '')
    }
    throw new Error(`Local test failed at ${stage}`)
  }
  return result.stdout?.replace(/\r\n/g, '\n').trim() ?? ''
}
function sql(text, role = 'postgres', expectedFailure = false) {
  return run(
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
      role,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    text,
    expectedFailure,
  )
}
function apply(file, expectedFailure = false, role = 'postgres') {
  return sql(fs.readFileSync(file, 'utf8'), role, expectedFailure)
}
function check(text, expected = 't', role = 'postgres') {
  if (sql(text, role) !== expected) throw new Error(`Local assertion failed at ${stage}`)
  assertions++
}
const userA = '10000000-0000-4000-8000-000000000001'
const userB = '10000000-0000-4000-8000-000000000002'
const sessionA = '20000000-0000-4000-8000-000000000001'
const absent = '20000000-0000-4000-8000-000000000099'
function call(subject, session, claim = subject) {
  return `BEGIN; SET LOCAL request.jwt.claim.sub = '${claim}'; SELECT pathways.runtime_auth_session_live(${subject ? `'${subject}'::uuid` : 'NULL'}, ${session ? `'${session}'::uuid` : 'NULL'}); COMMIT;`
}

try {
  const listener = net.createServer()
  await new Promise((resolve, reject) =>
    listener.once('error', reject).listen(port, '127.0.0.1', resolve),
  )
  await new Promise((resolve) => listener.close(resolve))
  evidence = fs.mkdtempSync(path.join(root, '.tmp/pathways-liveness-'))
  data = path.join(evidence, 'data')
  stage = 'initdb'
  run(path.join(pgBin, 'initdb.exe'), [
    '-D',
    data,
    '-U',
    'postgres',
    '-A',
    'trust',
    '--encoding=UTF8',
    '--locale=C',
  ])
  stage = 'start disposable cluster'
  run(path.join(pgBin, 'pg_ctl.exe'), [
    '-D',
    data,
    '-l',
    path.join(evidence, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    '-t',
    '15',
    'start',
  ])
  started = true
  run(path.join(pgBin, 'createdb.exe'), [
    '-w',
    '-h',
    '127.0.0.1',
    '-p',
    String(port),
    '-U',
    'postgres',
    database,
  ])
  stage = 'synthetic provider and ledger bootstrap'
  sql(`
    CREATE ROLE prisma LOGIN;
    CREATE ROLE pathways_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
    GRANT pathways_runtime TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
    CREATE ROLE supabase_auth_admin NOLOGIN;
    CREATE ROLE anon LOGIN;
    CREATE ROLE authenticated LOGIN;
    CREATE ROLE service_role LOGIN;
    CREATE ROLE unrelated_role LOGIN;
    REVOKE CREATE, TEMPORARY ON DATABASE pathways_liveness_review FROM PUBLIC;
    CREATE SCHEMA pathways AUTHORIZATION prisma;
    REVOKE ALL ON SCHEMA pathways FROM PUBLIC;
    GRANT USAGE ON SCHEMA pathways TO pathways_runtime;
    CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, not_after timestamptz);
    ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
    ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
    $$;
    ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
    CREATE TABLE public._prisma_migrations(migration_name text, checksum text, finished_at timestamptz, rolled_back_at timestamptz);
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO anon, service_role, unrelated_role;
    INSERT INTO auth.sessions(id,user_id) VALUES ('${sessionA}','${userA}');
    CREATE SCHEMA preserved AUTHORIZATION prisma;
    CREATE TABLE preserved.unrelated_canary(id integer PRIMARY KEY, value text NOT NULL);
    ALTER TABLE preserved.unrelated_canary OWNER TO prisma;
    INSERT INTO preserved.unrelated_canary VALUES (1,'preserved');
    ALTER TABLE preserved.unrelated_canary ENABLE ROW LEVEL SECURITY;
    CREATE POLICY preserved_canary_read ON preserved.unrelated_canary
      FOR SELECT TO unrelated_role USING (value = 'preserved');
    GRANT USAGE ON SCHEMA preserved TO unrelated_role;
    GRANT SELECT ON preserved.unrelated_canary TO unrelated_role;
    DO $legacy$
    DECLARE legacy_name text;
    BEGIN
      FOREACH legacy_name IN ARRAY ARRAY[
        'AuditLog','FormMetadata','MetadataField','Participant','ParticipantCard',
        'ParticipantJourney','Program','Project','Report','Role','UploadBatch',
        'UploadRow','UploadRowError','User','UserRole'
      ] LOOP
        EXECUTE format('CREATE TABLE public.%I(id integer PRIMARY KEY, value text NOT NULL)', legacy_name);
        EXECUTE format('ALTER TABLE public.%I OWNER TO prisma', legacy_name);
        EXECUTE format('INSERT INTO public.%I VALUES (1,%L)', legacy_name, 'preserved');
      END LOOP;
    END
    $legacy$;
  `)
  const migrations = path.join(root, 'apps/api/prisma/migrations')
  for (const name of fs.readdirSync(migrations).filter((name) => /^000[1-5]_/.test(name))) {
    const checksum = createHash('sha256')
      .update(fs.readFileSync(path.join(migrations, name, 'migration.sql')))
      .digest('hex')
    sql(`INSERT INTO public._prisma_migrations VALUES ('${name}','${checksum}',now(),NULL);`)
  }
  const ledgerBefore = sql(
    "SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY migration_name)) FROM public._prisma_migrations m;",
  )
  const preservedBefore = sql(`SELECT md5(jsonb_build_object(
    'legacyTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'),
    'legacyRows',(SELECT sum(row_count) FROM (
      SELECT 1::bigint AS row_count FROM public."AuditLog" UNION ALL
      SELECT 1 FROM public."FormMetadata" UNION ALL SELECT 1 FROM public."MetadataField" UNION ALL
      SELECT 1 FROM public."Participant" UNION ALL SELECT 1 FROM public."ParticipantCard" UNION ALL
      SELECT 1 FROM public."ParticipantJourney" UNION ALL SELECT 1 FROM public."Program" UNION ALL
      SELECT 1 FROM public."Project" UNION ALL SELECT 1 FROM public."Report" UNION ALL
      SELECT 1 FROM public."Role" UNION ALL SELECT 1 FROM public."UploadBatch" UNION ALL
      SELECT 1 FROM public."UploadRow" UNION ALL SELECT 1 FROM public."UploadRowError" UNION ALL
      SELECT 1 FROM public."User" UNION ALL SELECT 1 FROM public."UserRole"
    ) counts),
    'canary',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM preserved.unrelated_canary c),
    'owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
    'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity)
      FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
    'policy',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,
      pg_get_expr(polqual,polrelid)) ORDER BY polname)
      FROM pg_policy WHERE polrelid='preserved.unrelated_canary'::regclass),
    'acl',(SELECT relacl FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass)
  )::text);`)
  stage = 'wrong administrator refused'
  apply(migration, true, 'prisma')
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  stage = 'unexpected runtime role membership refused'
  sql('GRANT pathways_runtime TO unrelated_role;')
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  sql('REVOKE pathways_runtime FROM unrelated_role;')
  stage = 'administrator runtime assumption refused'
  sql('GRANT pathways_runtime TO postgres WITH SET TRUE;')
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  sql('GRANT pathways_runtime TO postgres WITH SET FALSE;')
  stage = 'prior migration checksum drift refused'
  const priorChecksum = sql(
    "SELECT checksum FROM public._prisma_migrations WHERE migration_name='0001_init';",
  )
  sql(
    "UPDATE public._prisma_migrations SET checksum='unreviewed' WHERE migration_name='0001_init';",
  )
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  sql(
    `UPDATE public._prisma_migrations SET checksum='${priorChecksum}' WHERE migration_name='0001_init';`,
  )
  stage = 'managed schema drift refused'
  sql('ALTER TABLE auth.sessions RENAME COLUMN not_after TO drifted;')
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  sql('ALTER TABLE auth.sessions RENAME COLUMN drifted TO not_after;')
  stage = 'unexpected existing overload refused'
  sql(
    'CREATE FUNCTION pathways.runtime_auth_session_live() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;',
  )
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live()') IS NOT NULL;")
  sql('DROP FUNCTION pathways.runtime_auth_session_live() RESTRICT;')
  stage = 'migration and ACL'
  apply(migration)
  const evidenceRow = apply(path.join(root, 'infra/supabase/session-liveness/verify.sql'))
  if (evidenceRow !== Array(11).fill('t').join('|'))
    throw new Error('Local catalog postflight failed')
  assertions += 11
  check(
    `SELECT md5(jsonb_build_object(
      'legacyTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'),
      'legacyRows',(SELECT sum(row_count) FROM (
        SELECT count(*)::bigint AS row_count FROM public."AuditLog" UNION ALL
        SELECT count(*) FROM public."FormMetadata" UNION ALL SELECT count(*) FROM public."MetadataField" UNION ALL
        SELECT count(*) FROM public."Participant" UNION ALL SELECT count(*) FROM public."ParticipantCard" UNION ALL
        SELECT count(*) FROM public."ParticipantJourney" UNION ALL SELECT count(*) FROM public."Program" UNION ALL
        SELECT count(*) FROM public."Project" UNION ALL SELECT count(*) FROM public."Report" UNION ALL
        SELECT count(*) FROM public."Role" UNION ALL SELECT count(*) FROM public."UploadBatch" UNION ALL
        SELECT count(*) FROM public."UploadRow" UNION ALL SELECT count(*) FROM public."UploadRowError" UNION ALL
        SELECT count(*) FROM public."User" UNION ALL SELECT count(*) FROM public."UserRole"
      ) counts),
      'canary',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM preserved.unrelated_canary c),
      'owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
      'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity)
        FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
      'policy',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,
        pg_get_expr(polqual,polrelid)) ORDER BY polname)
        FROM pg_policy WHERE polrelid='preserved.unrelated_canary'::regclass),
      'acl',(SELECT relacl FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass)
    )::text);`,
    preservedBefore,
  )
  for (const role of ['anon', 'authenticated', 'service_role', 'unrelated_role', 'prisma']) {
    check(
      `SELECT NOT has_function_privilege('${role}','pathways.runtime_auth_session_live(uuid,uuid)','EXECUTE');`,
    )
    sql(`SELECT pathways.runtime_auth_session_live('${userA}','${sessionA}');`, role, true)
    assertions++
  }
  sql('SELECT id FROM auth.sessions;', 'pathways_runtime', true)
  assertions++
  sql('CREATE TEMP TABLE forbidden_temp(id int);', 'pathways_runtime', true)
  sql('SET ROLE postgres;', 'pathways_runtime', true)
  assertions += 2
  stage = 'identity and lifetime checks'
  check(call(userA, sessionA), 't', 'pathways_runtime')
  check(call(userB, sessionA), 'f', 'pathways_runtime')
  check(call(userA, sessionA, userB), 'f', 'pathways_runtime')
  check(call(userA, absent), 'f', 'pathways_runtime')
  check(call(userA, sessionA, ''), 'f', 'pathways_runtime')
  check(call(userA, sessionA, 'malformed'), 'f', 'pathways_runtime')
  check(call('', sessionA), 'f', 'pathways_runtime')
  check(call(userA, ''), 'f', 'pathways_runtime')
  check(
    `${call(userA, sessionA)} SELECT pathways.runtime_auth_session_live('${userA}','${sessionA}');`,
    't\nf',
    'pathways_runtime',
  )
  sql(`UPDATE auth.sessions SET not_after = statement_timestamp() - interval '1 second';`)
  check(call(userA, sessionA), 'f', 'pathways_runtime')
  sql(`UPDATE auth.sessions SET not_after = statement_timestamp() + interval '1 hour';`)
  check(call(userA, sessionA), 't', 'pathways_runtime')
  sql('UPDATE auth.sessions SET not_after = NULL;')
  stage = 'committed revocation'
  sql('DELETE FROM auth.sessions;')
  check(call(userA, sessionA), 'f', 'pathways_runtime')
  stage = 'API integration'
  // The gated suite uses these fixed local coordinates, never a supplied URL.
  env.PATHWAYS_SESSION_LIVENESS_LOCAL_TESTS = '1'
  const tests = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      'src/modules/auth/session-liveness.local.test.ts',
    ],
    {
      cwd: path.join(root, 'apps/api'),
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    },
  )
  process.stdout.write(tests.stdout ?? '')
  if (tests.status !== 0) throw new Error('Local API integration failed')
  stage = 'repeat migration refused'
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NOT NULL;")
  stage = 'rollback dependency protection'
  sql(
    'CREATE VIEW pathways.liveness_dependency AS SELECT pathways.runtime_auth_session_live(NULL,NULL);',
  )
  apply(rollback, true)
  check(
    "SELECT has_function_privilege('pathways_runtime','pathways.runtime_auth_session_live(uuid,uuid)','EXECUTE');",
  )
  sql('DROP VIEW pathways.liveness_dependency RESTRICT;')
  stage = 'rollback target drift protection'
  sql("COMMENT ON FUNCTION pathways.runtime_auth_session_live(uuid,uuid) IS 'unreviewed';")
  apply(rollback, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NOT NULL;")
  sql(
    "COMMENT ON FUNCTION pathways.runtime_auth_session_live(uuid,uuid) IS 'PATHWAYS AAD Stage 4 / 0006: runtime-only verified subject/session liveness v1';",
  )
  // SQL tests do not run Prisma. Simulate its completed 0006 ledger row solely
  // to prove emergency rollback preserves that row and refuses manual reapply.
  const newChecksum = createHash('sha256').update(fs.readFileSync(migration)).digest('hex')
  sql(
    `INSERT INTO public._prisma_migrations VALUES ('0006_auth_session_liveness','${newChecksum}',now(),NULL);`,
  )
  const completedLedger = sql(
    "SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY migration_name)) FROM public._prisma_migrations m;",
  )
  stage = 'rollback and ledger preservation'
  apply(rollback)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  check(
    "SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY migration_name)) FROM public._prisma_migrations m;",
    completedLedger,
  )
  check(
    "SELECT md5(string_agg(row_to_json(m)::text,'' ORDER BY migration_name)) FROM public._prisma_migrations m WHERE migration_name <> '0006_auth_session_liveness';",
    ledgerBefore,
  )
  check(
    "SELECT NOT has_schema_privilege('pathways_runtime','auth','USAGE') AND NOT has_table_privilege('pathways_runtime','auth.sessions','SELECT');",
  )
  check(
    `SELECT md5(jsonb_build_object(
      'legacyTables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations'),
      'legacyRows',(SELECT sum(row_count) FROM (
        SELECT count(*)::bigint AS row_count FROM public."AuditLog" UNION ALL
        SELECT count(*) FROM public."FormMetadata" UNION ALL SELECT count(*) FROM public."MetadataField" UNION ALL
        SELECT count(*) FROM public."Participant" UNION ALL SELECT count(*) FROM public."ParticipantCard" UNION ALL
        SELECT count(*) FROM public."ParticipantJourney" UNION ALL SELECT count(*) FROM public."Program" UNION ALL
        SELECT count(*) FROM public."Project" UNION ALL SELECT count(*) FROM public."Report" UNION ALL
        SELECT count(*) FROM public."Role" UNION ALL SELECT count(*) FROM public."UploadBatch" UNION ALL
        SELECT count(*) FROM public."UploadRow" UNION ALL SELECT count(*) FROM public."UploadRowError" UNION ALL
        SELECT count(*) FROM public."User" UNION ALL SELECT count(*) FROM public."UserRole"
      ) counts),
      'canary',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM preserved.unrelated_canary c),
      'owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
      'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity)
        FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass),
      'policy',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,
        pg_get_expr(polqual,polrelid)) ORDER BY polname)
        FROM pg_policy WHERE polrelid='preserved.unrelated_canary'::regclass),
      'acl',(SELECT relacl FROM pg_class WHERE oid='preserved.unrelated_canary'::regclass)
    )::text);`,
    preservedBefore,
  )
  apply(rollback, true)
  assertions++
  apply(migration, true)
  check("SELECT to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NULL;")
  console.log(`SESSION_LIVENESS_LOCAL=PASS; ASSERTIONS=${assertions}`)
} catch {
  console.error(`SESSION_LIVENESS_LOCAL=FAILED; STAGE=${stage}; ASSERTIONS_COMPLETED=${assertions}`)
  process.exitCode = 1
} finally {
  if (started || (data && fs.existsSync(path.join(data, 'postmaster.pid')))) {
    try {
      stage = 'stop own disposable cluster'
      run(path.join(pgBin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', '-t', '15', 'stop'])
      stopped = true
    } catch {
      console.error('DISPOSABLE_CLUSTER_STOP=FAILED')
      process.exitCode = 1
    }
  }
  if (!started) stopped = true
  if (evidence && stopped) {
    const resolved = path.resolve(evidence)
    const temporaryRoot = path.resolve(root, '.tmp')
    if (
      path.dirname(resolved) !== temporaryRoot ||
      !path.basename(resolved).startsWith('pathways-liveness-')
    ) {
      console.error('DISPOSABLE_LOCAL_CLEANUP=REFUSED')
      process.exitCode = 1
    } else {
      try {
        fs.rmSync(resolved, { recursive: true })
        console.log('DISPOSABLE_LOCAL_CLEANUP=PASS')
      } catch {
        console.error('DISPOSABLE_LOCAL_CLEANUP=FAILED')
        process.exitCode = 1
      }
    }
  } else if (evidence) {
    console.error('DISPOSABLE_LOCAL_CLEANUP=UNCERTAIN')
  }
}
