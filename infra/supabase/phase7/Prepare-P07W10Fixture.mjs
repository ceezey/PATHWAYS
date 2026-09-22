import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const requireApi = createRequire(path.join(root, 'apps/api/package.json'))
const { PrismaClient } = requireApi('@prisma/client')
const { createClient } = requireApi('@supabase/supabase-js')
const { parse } = requireApi('dotenv')

export const fixture = Object.freeze({
  organizationId: '4c9fbd57-f74b-4193-8bd2-251b459d6142',
  organizationCode: 'P07_W10_ORG_B',
  projectId: '29964679-b84c-4f94-9c14-77e3cea3d636',
  projectCode: 'P07-W10-ISOLATION-001',
  profileId: '910042ae-5870-47a9-a0c0-f25ef396acc7',
  activityId: '4793b182-27bc-4a8c-9dcc-3d8bed5880c9',
  activityCode: 'P07-W10-CROSS-001',
  authEmail: 'p07-w10-org-b-admin@example.invalid',
  approvedOrganizationId: '7541cfc6-541d-4057-9229-03d89d361d34',
  approvedOrganizationCode: 'PLAN_PH',
  migrationName: '0020_fixed_sensitive_release_policy',
  migrationSha256: 'd9c301f26d42fa9b52a5591c43584a900f1b7d0293726616a4bed9a74745f10c',
})

function values() {
  const result = { ...process.env }
  for (const relative of ['apps/api/.env.local', 'apps/api/.env', '.env.local', '.env']) {
    const filename = path.join(root, relative)
    if (!fs.existsSync(filename)) continue
    for (const [key, value] of Object.entries(parse(fs.readFileSync(filename)))) {
      if (result[key] === undefined) result[key] = value
    }
  }
  return result
}

export function verifyTarget(env) {
  if (env.NODE_ENV !== 'development') throw new Error('Only development execution is allowed.')
  if (env.SUPABASE_URL !== 'https://pdqwsknbzkdtiwjjibqt.supabase.co') {
    throw new Error('Unexpected Auth target.')
  }
  const url = new URL(env.DIRECT_URL)
  if (
    url.hostname !== 'aws-1-ap-southeast-2.pooler.supabase.com' ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    decodeURIComponent(url.username) !== 'prisma.pdqwsknbzkdtiwjjibqt' ||
    !url.password
  )
    throw new Error('Unexpected PATHWAYS-dev database target.')
  return url
}

export function requireExecutionAuthority(env) {
  if (env.P07_W10_MANAGED_APPROVAL !== 'APPROVE PATHWAYS-dev P07_W10_MANAGED_V1 ONLY') {
    throw new Error('Exact W10 managed approval marker is missing.')
  }
  if (!env.P07_W10_BACKUP_REFERENCE?.trim()) throw new Error('Current backup reference is missing.')
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      env.P07_W10_AUTH_USER_ID ?? '',
    )
  ) {
    throw new Error('One verified synthetic Auth subject ID is required.')
  }
}

export async function inspectFixture(tx, authUserId = null) {
  // One read statement avoids a slow series of round trips under the existing
  // interactive transaction budget. No timeout or pool setting is changed.
  const [row] = await tx.$queryRaw`
    SELECT
      (SELECT code FROM pathways.organizations WHERE id = ${fixture.approvedOrganizationId}::uuid) AS baseline_code,
      (SELECT status::text FROM pathways.organizations WHERE id = ${fixture.approvedOrganizationId}::uuid) AS baseline_status,
      (SELECT count(*)::int FROM pathways.organizations) AS organization_count,
      (SELECT count(*)::int FROM pathways.organizations WHERE id = ${fixture.organizationId}::uuid OR code = ${fixture.organizationCode}) AS organization_collision,
      (SELECT count(*)::int FROM pathways.projects WHERE id = ${fixture.projectId}::uuid OR code = ${fixture.projectCode}) AS project_collision,
      (SELECT count(*)::int FROM pathways.system_users WHERE id = ${fixture.profileId}::uuid OR auth_user_id = ${authUserId ?? fixture.profileId}::uuid OR lower(email) = ${fixture.authEmail}) AS profile_collision,
      (SELECT count(*)::int FROM pathways.project_activities WHERE id = ${fixture.activityId}::uuid OR code = ${fixture.activityCode}) AS activity_collision,
      (SELECT count(*)::int FROM pathways.data_import_batches WHERE client_import_id = '0f4060ce-8432-4fd4-b9f2-91edd4503ec8'::uuid) AS import_collision,
      (SELECT id::text FROM pathways.roles WHERE code = 'SYSTEM_ADMINISTRATOR' AND is_active) AS role_id,
      (SELECT checksum FROM public._prisma_migrations WHERE migration_name = '0020_fixed_sensitive_release_policy' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS migration_checksum,
      (SELECT count(*)::int FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished_migration_count,
      (SELECT count(*)::int FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS bad_migration_count,
      (SELECT migration_name FROM public._prisma_migrations ORDER BY started_at DESC LIMIT 1) AS latest_migration,
      (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = 'pathways_runtime') AS runtime_bypass
  `
  if (
    row?.baseline_code !== fixture.approvedOrganizationCode ||
    row.baseline_status !== 'ACTIVE' ||
    row.organization_count !== 1
  )
    throw new Error('Approved organization baseline changed.')
  if (
    row.organization_collision ||
    row.project_collision ||
    row.profile_collision ||
    row.activity_collision ||
    row.import_collision
  )
    throw new Error('W10 fixture identity already exists; refusing replay.')
  if (!row.role_id) throw new Error('Canonical System Administrator role unavailable.')
  if (
    row.migration_checksum !== fixture.migrationSha256 ||
    row.finished_migration_count !== 20 ||
    row.bad_migration_count !== 0 ||
    row.latest_migration !== fixture.migrationName
  )
    throw new Error('0020 migration ledger changed.')
  if (row.runtime_bypass !== false) throw new Error('Runtime RLS role changed.')
  return row.role_id
}

async function main() {
  const mode = process.argv[2] ?? '--plan'
  if (!['--plan', '--preflight', '--apply'].includes(mode))
    throw new Error('Use --plan, --preflight, or --apply.')
  if (mode === '--plan') {
    process.stdout.write(`${JSON.stringify({ mode, fixture, managedWrites: 0 })}\n`)
    return
  }
  const env = values()
  verifyTarget(env)
  if (mode === '--apply') requireExecutionAuthority(env)
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } } })
  try {
    if (mode === '--preflight') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`
        await inspectFixture(tx)
      })
      process.stdout.write('P07_W10_FIXTURE_DB_PREFLIGHT=PASS; managedWrites=0\n')
      return
    }
    if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Auth verification key unavailable.')
    const auth = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await auth.auth.admin.getUserById(env.P07_W10_AUTH_USER_ID)
    if (
      error ||
      data.user?.email?.toLowerCase() !== fixture.authEmail ||
      !data.user.email_confirmed_at
    ) {
      throw new Error('The exact confirmed synthetic Auth identity is unavailable.')
    }
    const roleId = await inspectFixture(prisma, env.P07_W10_AUTH_USER_ID)
    const now = new Date()
    // Batch transaction keeps the five reviewed fixture rows atomic without
    // changing the interactive transaction timeout.
    await prisma.$transaction([
      prisma.organization.create({
        data: {
          id: fixture.organizationId,
          code: fixture.organizationCode,
          name: 'P07 W10 Synthetic Isolation Organization B',
          status: 'ACTIVE',
        },
      }),
      prisma.systemUser.create({
        data: {
          id: fixture.profileId,
          organizationId: fixture.organizationId,
          roleId,
          authUserId: data.user.id,
          email: fixture.authEmail,
          fullName: 'P07 W10 Synthetic Administrator',
          accountStatus: 'ACTIVE',
          invitedAt: now,
          activatedAt: now,
        },
      }),
      prisma.project.create({
        data: {
          id: fixture.projectId,
          organizationId: fixture.organizationId,
          code: fixture.projectCode,
          title: 'P07 W10 Synthetic Isolation Project',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          status: 'PLANNED',
          publicVisibilityStatus: 'PRIVATE',
          createdById: fixture.profileId,
        },
      }),
      prisma.projectActivity.create({
        data: {
          id: fixture.activityId,
          organizationId: fixture.organizationId,
          projectId: fixture.projectId,
          code: fixture.activityCode,
          title: 'P07 W10 Synthetic Cross-Organization Activity',
          status: 'NOT_STARTED',
          createdById: fixture.profileId,
        },
      }),
      prisma.auditLog.create({
        data: {
          organizationId: fixture.organizationId,
          actorUserId: fixture.profileId,
          projectId: fixture.projectId,
          action: 'P07_W10_SYNTHETIC_FIXTURE_PROVISIONED',
          entityType: 'Organization',
          entityId: fixture.organizationId,
          changes: {
            organizationCode: fixture.organizationCode,
            projectCode: fixture.projectCode,
            activityCode: fixture.activityCode,
          },
        },
      }),
    ])
    process.stdout.write(
      'P07_W10_FIXTURE_PROVISIONED=PASS; applicationRows=5; authWrites=0; storageWrites=0\n',
    )
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`P07_W10_FIXTURE=FAILED: ${error.message}\n`)
    process.exitCode = 1
  })
}
