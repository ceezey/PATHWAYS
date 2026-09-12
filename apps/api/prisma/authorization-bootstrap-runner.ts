import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'
import { DEVELOPER_AUTH_UUID } from '../src/modules/auth/developer-access'
import { seedCanonicalReferenceData } from './canonical-seed'
import {
  bootstrapDeveloperAdministrator,
  bootstrapDeveloperOrganization,
  verifyDeveloperBootstrap,
} from './developer-bootstrap'

export const phase5Checksums = {
  '0001_init': '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab',
  '0002_pathways_foundation': 'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2',
  '0003_pathways_projects_collection':
    '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b',
  '0004_pathways_finance_evaluation_decisions':
    '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b',
  '0005_supabase_security_adapter':
    '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc',
} as const
const requiredMigrations = Object.entries(phase5Checksums)
export const sessionLivenessMigration = {
  name: '0006_auth_session_liveness',
  checksum: '8034f7910e09fae33c6f10d7bec434cf0bc65555e057aa2dd262d35a9b8ade00',
} as const
const legacy = [
  'AuditLog',
  'FormMetadata',
  'MetadataField',
  'Participant',
  'ParticipantCard',
  'ParticipantJourney',
  'Program',
  'Project',
  'Report',
  'Role',
  'UploadBatch',
  'UploadRow',
  'UploadRowError',
  'User',
  'UserRole',
]
const writable = ['roles', 'permissions', 'role_permissions', 'organizations', 'system_users']
let phase5Stage = 'configuration'

export type Phase5LedgerRow = {
  migration_name: string
  checksum: string
  finished_at: Date | null
  rolled_back_at: Date | null
  applied_steps_count: number
  expected_failure: boolean
  logs_absent: boolean
}

export function phase5LedgerState(ledger: Phase5LedgerRow[]) {
  for (const [name, checksum] of requiredMigrations) {
    const rows = ledger.filter((row) => row.migration_name === name)
    const completed = rows.find((row) => row.finished_at && !row.rolled_back_at)
    // 0001 was deployed normally. 0002-0005 were subsequently reconciled
    // with guarded `resolve --applied`, which records zero applied SQL steps.
    const expectedSteps = name === '0001_init' ? 1 : 0
    if (
      rows.filter((row) => row.finished_at && !row.rolled_back_at).length !== 1 ||
      rows.some((row) => row.checksum !== checksum || (!row.finished_at && !row.rolled_back_at)) ||
      completed?.applied_steps_count !== expectedSteps ||
      !completed.logs_absent
    ) {
      throw new Error('Completed migration history differs.')
    }
  }
  const approvedNames = new Set([...Object.keys(phase5Checksums), sessionLivenessMigration.name])
  const livenessRows = ledger.filter((row) => row.migration_name === sessionLivenessMigration.name)
  if (
    livenessRows.length > 1 ||
    livenessRows.some(
      (row) =>
        row.checksum !== sessionLivenessMigration.checksum ||
        !row.finished_at ||
        Boolean(row.rolled_back_at) ||
        row.expected_failure ||
        !row.logs_absent ||
        row.applied_steps_count !== 1,
    )
  ) {
    throw new Error('Session-liveness migration history differs.')
  }
  if (
    ![requiredMigrations.length, requiredMigrations.length + 1].includes(ledger.length) ||
    ledger.some(
      (row) =>
        !approvedNames.has(row.migration_name) ||
        Boolean(row.rolled_back_at) ||
        !row.finished_at ||
        row.expected_failure ||
        !row.logs_absent,
    )
  ) {
    throw new Error('Ledger shape differs.')
  }
  return 'FOUNDATION_READY' as const
}

export function phase5Failure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  return {
    status: 'FAILED',
    stage: phase5Stage,
    prismaCode: typeof code === 'string' && /^P[0-9]{4}$/.test(code) ? code : 'NONE',
  }
}

export function validatePhase5Url(value: string | undefined) {
  if (!value) throw new Error('Protected administrator connection missing.')
  const url = new URL(value)
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== 'aws-1-ap-southeast-2.pooler.supabase.com' ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    decodeURIComponent(url.username) !== 'postgres.pdqwsknbzkdtiwjjibqt' ||
    !url.password ||
    url.hash ||
    url.searchParams.get('sslmode') !== 'require' ||
    (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
  ) {
    throw new Error('Protected connection is outside the approved target.')
  }
  if (
    [...url.searchParams.keys()].some(
      (key) => !['sslmode', 'connect_timeout', 'connection_limit', 'schema'].includes(key),
    )
  ) {
    throw new Error('Unexpected connection setting.')
  }
  return value
}

async function preflight(tx: Prisma.TransactionClient) {
  phase5Stage = 'connection_security'
  const [connection] = await tx.$queryRaw<Array<{ safe: boolean }>>`
    SELECT current_database()='postgres' AND current_user='postgres' AND session_user='postgres'
      AND NOT has_database_privilege('prisma','postgres','CREATE')
      AND NOT has_database_privilege('pathways_runtime','postgres','CREATE')
      AND NOT has_database_privilege('pathways_runtime','postgres','TEMPORARY')
      AND NOT has_schema_privilege('pathways_runtime','pathways','CREATE')
      AND EXISTS (SELECT FROM pg_roles WHERE rolname='pathways_runtime' AND rolcanlogin
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
      AND NOT EXISTS (SELECT FROM pg_auth_members WHERE member='pathways_runtime'::regrole)
      AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relname='_prisma_migrations' AND c.relkind='r')=1
      AND to_regclass('public._prisma_migrations') IS NOT NULL AS safe
  `
  if (!connection?.safe) throw new Error('Connection or security baseline differs.')
  phase5Stage = 'ledger'
  const ledger = await tx.$queryRaw<Phase5LedgerRow[]>`
    SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count,
      coalesce(position('42501' IN logs)>0,false) AS expected_failure,
      coalesce(logs,'')='' AS logs_absent FROM public._prisma_migrations
  `
  phase5LedgerState(ledger)
  const tables = await tx.$queryRaw<Array<{ name: string; safe: boolean }>>`
    SELECT c.relname AS name,c.relowner='prisma'::regrole AND c.relrowsecurity AS safe
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='pathways' AND c.relkind='r'
  `
  if (tables.length !== 39 || tables.some((t) => !t.safe))
    throw new Error('Target catalog differs.')
  phase5Stage = 'table_allowlist'
  // Identifiers originate only in the reviewed migration files, not HTTP/user input.
  const approvedTargetNames = Object.keys(phase5Checksums).flatMap((migration) => {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', migration, 'migration.sql'),
      'utf8',
    )
    return [...sql.matchAll(/CREATE TABLE "pathways"\."([a-z_]+)"/g)].map((match) => match[1])
  })
  if (
    approvedTargetNames.length !== 39 ||
    tables.some((table) => !approvedTargetNames.includes(table.name))
  ) {
    throw new Error('Target table allowlist differs.')
  }
  phase5Stage = 'legacy_state'
  const publicTables = await tx.$queryRaw<Array<{ name: string }>>`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname
  `
  const expectedPublicTables = [...legacy, '_prisma_migrations'].sort()
  if (
    publicTables.length !== expectedPublicTables.length ||
    publicTables.some((table, index) => table.name !== expectedPublicTables[index])
  ) {
    throw new Error('Legacy retirement state differs from migration history.')
  }
  phase5Stage = 'business_counts'
  // One network round trip for all fixed allowlisted counts. Separate SELECTs
  // exhausted the bounded interactive transaction on the remote Session Pooler.
  // Legacy public data is preserved and is not an authorization-bootstrap
  // precondition. Only the reviewed, non-writable current tables must remain
  // empty before the one-account development bootstrap.
  const countQueries = approvedTargetNames
    .filter((table) => !writable.includes(table))
    .map((name) => Prisma.sql`SELECT count(*) AS count FROM ${Prisma.raw(`pathways."${name}"`)}`)
  const counts = await tx.$queryRaw<Array<{ count: bigint }>>(
    Prisma.join(countQueries, ' UNION ALL '),
  )
  if (counts.length !== countQueries.length || counts.some((row) => row.count !== 0n)) {
    throw new Error('Business or legacy counts differ.')
  }
  phase5Stage = 'provider_inventory'
  const [provider] = await tx.$queryRaw<Array<{ safe: boolean }>>`
    SELECT (SELECT count(*) FROM auth.users)=2 AND (SELECT count(*) FROM auth.identities)=2
      AND EXISTS (SELECT FROM auth.users WHERE id='55be171a-e6fd-496c-bcde-192dfbdc4223'::uuid)
      AND EXISTS (SELECT FROM auth.users WHERE id=${DEVELOPER_AUTH_UUID}::uuid
        AND email_confirmed_at IS NOT NULL AND NOT is_anonymous AND deleted_at IS NULL
        AND (banned_until IS NULL OR banned_until < now()))
      AND (SELECT count(*) FROM auth.mfa_factors WHERE user_id=${DEVELOPER_AUTH_UUID}::uuid
        AND factor_type='totp' AND status='verified')=1
      AND (SELECT count(*) FROM storage.buckets)=1
      AND EXISTS (SELECT FROM storage.buckets WHERE id='pathways-private' AND NOT public)
      AND (SELECT count(*) FROM storage.objects)=1
      AND EXISTS (SELECT FROM storage.objects WHERE id='535f3c5b-ca0f-41c2-a6e9-a997c1ee4dd0'::uuid
        AND bucket_id='pathways-private' AND md5(name)='8027b7e1fb6a6f8f1b16ae4733933a07') AS safe
  `
  phase5Stage = 'provider_inventory'
  if (!provider.safe) throw new Error('Preserved provider inventory or MFA differs.')
  return 'FOUNDATION_READY' as const
}

async function run() {
  const action = process.argv[2] ?? 'Check'
  if (!['Check', 'Seed', 'Organization', 'Administrator', 'Verify'].includes(action))
    throw new Error('Unknown Phase 5 operation.')
  const root = path.resolve(__dirname, '../../..')
  const todo = fs.readFileSync(path.join(root, 'docs/TODO.md'), 'utf8')
  if (!todo.includes('- [x] **Gate: Workspace context PASS**'))
    throw new Error('Workspace-context gate differs.')
  for (const [migration, expected] of [
    ...Object.entries(phase5Checksums),
    [sessionLivenessMigration.name, sessionLivenessMigration.checksum],
  ]) {
    if (
      createHash('sha256')
        .update(fs.readFileSync(path.join(__dirname, 'migrations', migration, 'migration.sql')))
        .digest('hex') !== expected
    ) {
      throw new Error('Immutable migration checksum differs.')
    }
  }
  const mutation = !['Check', 'Verify'].includes(action)
  if (
    mutation &&
    process.env.PATHWAYS_PHASE5_AUTHORIZATION !==
      'CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY'
  ) {
    throw new Error('Explicit Phase 5 runner authorization is required.')
  }
  const client = new PrismaClient({
    datasources: { db: { url: validatePhase5Url(process.env.PHASE5_ADMIN_URL) } },
    log: [],
  })
  try {
    phase5Stage = 'transaction_start'
    const result = await client.$transaction(
      async (tx) => {
        if (!mutation) await tx.$executeRaw`SET TRANSACTION READ ONLY`
        await preflight(tx)
        let result: unknown = { preflight: 'PASS' }
        if (action === 'Seed') {
          phase5Stage = 'canonical_seed'
          result = await seedCanonicalReferenceData(tx)
        }
        if (action === 'Organization') {
          phase5Stage = 'organization_bootstrap'
          result = await bootstrapDeveloperOrganization(tx)
        }
        if (action === 'Administrator') {
          phase5Stage = 'administrator_bootstrap'
          result = await bootstrapDeveloperAdministrator(
            tx,
            process.env.PATHWAYS_STRONG_UNIQUE_PASSWORD_CONFIRMED === 'YES',
          )
        }
        if (action === 'Verify') {
          phase5Stage = 'administrator_bootstrap'
          result = await verifyDeveloperBootstrap(tx)
        }
        await preflight(tx)
        return result
      },
      { isolationLevel: 'Serializable', timeout: 45_000, maxWait: 10_000 },
    )
    // Fixed non-secret result shapes only. Never log rows, SQL, errors or URLs.
    console.info(JSON.stringify({ action, result }))
  } finally {
    await client.$disconnect()
  }
}

if (require.main === module)
  void run().catch((error: unknown) => {
    console.error(JSON.stringify(phase5Failure(error)))
    process.exitCode = 1
  })
