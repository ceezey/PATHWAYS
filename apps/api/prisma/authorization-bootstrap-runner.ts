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
  '0006_retire_legacy_public_application_tables':
    '7af145cffa9f7b430bc3fb6d7d716a1f7966c595b7674fa0467c13db4a3f0e81',
} as const
const preRetirementMigrations = Object.entries(phase5Checksums).filter(
  ([name]) => name !== '0006_retire_legacy_public_application_tables',
)
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
  for (const [name, checksum] of preRetirementMigrations) {
    const rows = ledger.filter((row) => row.migration_name === name)
    const completed = rows.find((row) => row.finished_at && !row.rolled_back_at)
    const expectedSteps = name === '0001_init' ? 0 : 1
    if (
      rows.filter((row) => row.finished_at && !row.rolled_back_at).length !== 1 ||
      rows.some((row) => row.checksum !== checksum || (!row.finished_at && !row.rolled_back_at)) ||
      completed?.applied_steps_count !== expectedSteps ||
      !completed.logs_absent
    ) {
      throw new Error('Completed migration history differs.')
    }
  }
  const failedRows = ledger.filter((row) => row.rolled_back_at)
  const failed = failedRows[0]
  if (
    failedRows.length !== 1 ||
    failed?.migration_name !== '0002_pathways_foundation' ||
    failed.finished_at ||
    failed.applied_steps_count !== 0 ||
    !failed.expected_failure ||
    failed.logs_absent
  ) {
    throw new Error('Original failed attempt differs.')
  }
  const retirementRows = ledger.filter(
    (row) => row.migration_name === '0006_retire_legacy_public_application_tables',
  )
  const retirementState =
    retirementRows.length === 0
      ? 'PRE_0006'
      : retirementRows.length === 1 &&
          retirementRows[0].checksum ===
            phase5Checksums['0006_retire_legacy_public_application_tables'] &&
          retirementRows[0].finished_at &&
          !retirementRows[0].rolled_back_at &&
          retirementRows[0].applied_steps_count === 1 &&
          retirementRows[0].logs_absent
        ? 'POST_0006'
        : 'INVALID'
  const expectedLedgerLength = retirementState === 'POST_0006' ? 7 : 6
  const approvedNames = new Set(Object.keys(phase5Checksums))
  if (
    retirementState === 'INVALID' ||
    ledger.length !== expectedLedgerLength ||
    ledger.some((row) => !approvedNames.has(row.migration_name))
  ) {
    throw new Error('Ledger shape differs.')
  }
  return retirementState
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
  const retirementState = phase5LedgerState(ledger)
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
  const expectedPublicTables =
    retirementState === 'PRE_0006'
      ? [...legacy, '_prisma_migrations'].sort()
      : ['_prisma_migrations']
  if (
    publicTables.length !== expectedPublicTables.length ||
    publicTables.some((table, index) => table.name !== expectedPublicTables[index])
  ) {
    throw new Error('Legacy retirement state differs from migration history.')
  }
  phase5Stage = 'business_counts'
  // One network round trip for all fixed allowlisted counts. Separate SELECTs
  // exhausted the bounded interactive transaction on the remote Session Pooler.
  const countQueries = [
    ...approvedTargetNames
      .filter((table) => !writable.includes(table))
      .map((name) => Prisma.sql`SELECT count(*) AS count FROM ${Prisma.raw(`pathways."${name}"`)}`),
    ...(retirementState === 'PRE_0006'
      ? legacy.map(
          (name) => Prisma.sql`SELECT count(*) AS count FROM ${Prisma.raw(`public."${name}"`)}`,
        )
      : []),
  ]
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
  return retirementState
}

async function run() {
  const action = process.argv[2] ?? 'Check'
  if (!['Check', 'Seed', 'Organization', 'Administrator', 'Verify'].includes(action))
    throw new Error('Unknown Phase 5 operation.')
  const root = path.resolve(__dirname, '../../..')
  const todo = fs
    .readFileSync(path.join(root, 'docs/PHASE_TODO.md'), 'utf8')
    .split('## Phase 4')[1]
    ?.split('## Phase 5')[0]
  if (!todo?.includes('- [x] Phase result is `PASS`.') || todo.includes('- [ ]'))
    throw new Error('Phase 4 gate differs.')
  for (const [migration, expected] of Object.entries(phase5Checksums)) {
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
        const retirementState = await preflight(tx)
        if (mutation && retirementState !== 'PRE_0006') {
          throw new Error('Phase 5 writes are closed after legacy retirement.')
        }
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
