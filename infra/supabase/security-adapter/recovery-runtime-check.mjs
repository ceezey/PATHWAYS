// State-aware Phase 4 verification only. No dotenv loading, provisioning,
// persistent DDL/DML, migration commands, or credential output.
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const api = path.join(root, 'apps/api')
const require = createRequire(path.join(api, 'package.json'))
const recoveryTag = process.argv[2]
const localMode = process.argv[3] === '--local'
let stage = 'CONFIGURATION'
let client
let failureReported = false

function assertRecovery(condition) {
  if (!condition) throw new Error('Recovery runtime assertion failed.')
}

async function marker(value) {
  await new Promise((resolve, reject) => {
    process.stdout.write(`${value}\n`, (error) => (error ? reject(error) : resolve()))
  })
}

function sqlState(error) {
  const candidate = error?.meta?.code
  return typeof candidate === 'string' && /^[0-9A-Z]{5}$/.test(candidate) ? candidate : null
}

function failureMarker(error) {
  if (failureReported) return
  failureReported = true
  const prismaCode =
    typeof error?.code === 'string' && /^P[0-9]{4}$/.test(error.code) ? error.code : 'NONE'
  process.stdout.write(
    `RECOVERY_RUNTIME_CHECK=FAILED; STAGE=${stage}; PRISMA=${prismaCode}; SQLSTATE=${sqlState(error) ?? 'NONE'}\n`,
  )
  process.exitCode = 1
}

// Unexpected errors must not cause Node to print a raw stack, query or URL.
process.on('uncaughtException', failureMarker)
process.on('unhandledRejection', failureMarker)

async function run() {
  assertRecovery(/^p4r_[a-f0-9]{32}$/.test(recoveryTag ?? ''))
  assertRecovery(process.argv.length === (localMode ? 4 : 3))
  assertRecovery(typeof process.env.DATABASE_URL === 'string')
  const connection = new URL(process.env.DATABASE_URL)
  assertRecovery(connection.protocol === 'postgresql:')
  assertRecovery(!connection.hash)
  const username = decodeURIComponent(connection.username)
  const database = decodeURIComponent(connection.pathname.slice(1))
  const allowedParameters = new Set(['sslmode', 'connect_timeout', 'connection_limit'])
  assertRecovery([...connection.searchParams.keys()].every((key) => allowedParameters.has(key)))
  assertRecovery(connection.searchParams.getAll('connection_limit').length === 1)
  assertRecovery(connection.searchParams.get('connection_limit') === '1')
  assertRecovery(connection.searchParams.get('connect_timeout') === '15')
  if (localMode) {
    // The local-only escape hatch never accepts a hosted endpoint/database.
    assertRecovery(['127.0.0.1', '[::1]'].includes(connection.hostname))
    assertRecovery(/^[0-9]+$/.test(connection.port))
    assertRecovery(/^pathways_phase4_[a-z0-9_]+$/.test(database))
    assertRecovery(username === 'pathways_runtime')
    assertRecovery(['disable', 'require'].includes(connection.searchParams.get('sslmode')))
  } else {
    assertRecovery(connection.hostname === 'aws-1-ap-southeast-2.pooler.supabase.com')
    assertRecovery(connection.port === '5432' && database === 'postgres')
    assertRecovery(username === 'pathways_runtime.pdqwsknbzkdtiwjjibqt')
    assertRecovery(connection.password.length > 0)
    assertRecovery(connection.searchParams.get('sslmode') === 'require')
  }
  // Empty values intentionally block dotenv's override=false behavior inside
  // generated clients. This script never loads an ignored environment file.
  process.env.DIRECT_URL = ''
  process.env.SHADOW_DATABASE_URL = ''
  assertRecovery(require('@prisma/client/package.json').version === '6.19.2')
  require('reflect-metadata')
  const { PrismaService } = require(path.join(api, 'dist/apps/api/src/prisma/prisma.service.js'))
  client = new PrismaService()

  stage = 'CAPTURE_BACKEND'
  // This is the first application query, before startup/security probes. Keep
  // microsecond precision as SQL text; JavaScript Date would truncate it.
  // set_config(false) tags this Session Pooler backend beyond one transaction.
  const [backend] = await client.$queryRaw`
    SELECT pg_backend_pid() AS pid,
      (SELECT to_char(backend_start AT TIME ZONE 'UTC',
                     'YYYY-MM-DD HH24:MI:SS.US') || '+00'
       FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS backend_start,
      current_database() AS database, session_user::text AS role,
      session_user::text AS session_user, current_user::text AS current_user,
      set_config('application_name', ${recoveryTag}, false) AS application_name
  `
  assertRecovery(Number.isInteger(backend?.pid) && backend.pid > 0)
  assertRecovery(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(backend.backend_start ?? ''),
  )
  assertRecovery(backend.database === database && backend.role === 'pathways_runtime')
  assertRecovery(backend.session_user === 'pathways_runtime')
  assertRecovery(/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(backend.current_user ?? ''))
  assertRecovery(backend.application_name === recoveryTag)
  // Flush this exact tuple before any later failure can occur. A pooler may
  // retain the backend after the client closes; parent tracks this tuple.
  await marker(`RECOVERY_BACKEND=${JSON.stringify(backend)}`)
  assertRecovery(backend.current_user === 'pathways_runtime')

  stage = 'ROLE_SECURITY'
  const [security] = await client.$queryRaw`
    SELECT current_user='pathways_runtime' AND session_user='pathways_runtime'
      AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit
      AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
      AND NOT r.rolbypassrls AND r.rolconnlimit=-1 AND r.rolvaliduntil IS NULL
      AND r.rolconfig IS NULL
      AND NOT EXISTS (SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
      AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member=r.oid)
      AND NOT EXISTS (SELECT FROM pg_shdepend
        WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o')
      AND has_database_privilege(r.oid,current_database(),'CONNECT')
      AND NOT has_database_privilege(r.oid,current_database(),'CREATE')
      AND NOT has_database_privilege(r.oid,current_database(),'TEMPORARY')
      AND has_schema_privilege(r.oid,'pathways','USAGE')
      AND NOT has_schema_privilege(r.oid,'pathways','CREATE')
      AND NOT has_schema_privilege(r.oid,'public','CREATE') AS safe
    FROM pg_roles r WHERE r.rolname=current_user
  `
  assertRecovery(security?.safe === true)

  stage = 'PRISMA_STARTUP'
  // Reuse the already captured single-connection client, rather than silently
  // opening an untracked second PrismaService connection for the startup check.
  await client.onModuleInit()
  const [connectionCheck] = await client.$queryRaw`SELECT 1 AS connection_check`
  assertRecovery(connectionCheck?.connection_check === 1)
  await marker('RECOVERY_PRISMA_STARTUP=PASS')

  stage = 'CONTEXT_CHECK'
  await client.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
      SELECT set_config('app.organization_id','',true),
        set_config('app.user_id','',true),
        set_config('request.jwt.claim.sub','',true),
        set_config('request.jwt.claims','',true)
    `
      const [missing] = await transaction.$queryRaw`
      SELECT pathways.runtime_context_organization() IS NULL
        AND pathways.runtime_context_user() IS NULL
        AND NOT EXISTS (SELECT FROM pathways.organizations)
        AND NOT EXISTS (SELECT FROM pathways.system_users)
        AND NOT EXISTS (SELECT FROM pathways.projects) AS denied
    `
      assertRecovery(missing?.denied === true)
      await transaction.$queryRaw`
      SELECT set_config('app.organization_id','invalid-context',true),
        set_config('app.user_id','invalid-context',true)
    `
      const [malformed] = await transaction.$queryRaw`
      SELECT pathways.runtime_context_organization() IS NULL
        AND pathways.runtime_context_user() IS NULL AS denied
    `
      assertRecovery(malformed?.denied === true)
    },
    { maxWait: 5000, timeout: 15000 },
  )
  const [cleanup] = await client.$queryRaw`
    SELECT coalesce(current_setting('app.organization_id',true),'')=''
      AND coalesce(current_setting('app.user_id',true),'')=''
      AND coalesce(current_setting('request.jwt.claim.sub',true),'')=''
      AND coalesce(current_setting('request.jwt.claims',true),'')='' AS clean
  `
  assertRecovery(cleanup?.clean === true)
  await marker('RECOVERY_CONTEXT_CHECK=PASS')

  const probes = [
    ['TEMP_DDL', 'CREATE TEMP TABLE phase4_recovery_temp_denied (id integer) ON COMMIT DROP'],
    ['SCHEMA_DDL', 'CREATE SCHEMA phase4_recovery_schema_denied'],
    ['DOMAIN_DDL', 'CREATE TABLE pathways.phase4_recovery_table_denied (id integer)'],
    ['PUBLIC_DDL', 'CREATE TABLE public.phase4_recovery_public_denied (id integer)'],
    ['MIGRATION_ROLE', 'SET LOCAL ROLE prisma'],
    ['ADMIN_ROLE', 'SET LOCAL ROLE postgres'],
    ['AUTH_ACCESS', 'SELECT 1 FROM auth.users LIMIT 1'],
    ['STORAGE_ACCESS', 'SELECT 1 FROM storage.objects LIMIT 1'],
    ['LEDGER_ACCESS', 'SELECT 1 FROM public._prisma_migrations LIMIT 1'],
  ]
  for (const [label, sql] of probes) {
    stage = `NEGATIVE_${label}`
    let denied = false
    try {
      await client.$transaction(
        async (transaction) => {
          // Only fixed reviewed SQL above is accepted, never caller input.
          await transaction.$executeRawUnsafe(sql)
          // An unexpected success must roll back before it becomes a failure.
          throw new Error('Negative security probe unexpectedly succeeded.')
        },
        { maxWait: 5000, timeout: 15000 },
      )
    } catch (error) {
      if (sqlState(error) === '42501') denied = true
      else throw error
    }
    assertRecovery(denied)
  }
  await marker('RECOVERY_NEGATIVE_SECURITY_PROBES_9=PASS')
}

try {
  await run()
} catch (error) {
  failureMarker(error)
} finally {
  if (client) {
    try {
      if (!failureReported) stage = 'DISCONNECT'
      await client.onModuleDestroy()
    } catch (error) {
      failureMarker(error)
    }
  }
}
if (!failureReported) await marker('RECOVERY_RUNTIME_CHECK=PASS')
