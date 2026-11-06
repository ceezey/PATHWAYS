import { readdirSync } from 'node:fs'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

import { seedCanonicalReferenceData } from './canonical-seed'
import { approvedOrganization } from './developer-bootstrap'
import { reconcileStorageBuckets } from './hosted-realistic-seed'

/**
 * Demo-free production bootstrap for the PATHWAYS project (mvzxitlbtkkyvubgbcmx): private storage
 * buckets, canonical reference data, the approved organization and the System Administrator
 * profile. Run only through `scripts/db/hosted/seed.mjs --production`, after the hosted build.
 * Never creates Auth accounts or passwords; the administrator's Auth user must already exist.
 */

const PRODUCTION_PROJECT_REF = 'mvzxitlbtkkyvubgbcmx'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/** Defense in depth behind seed-target.mjs: only the production project, or loopback in test-local mode. */
export function assertProductionTarget(env: NodeJS.ProcessEnv) {
  const { SUPABASE_URL: supabaseUrl, DIRECT_URL: directUrl } = env
  if (!supabaseUrl || !directUrl) throw new Error('SUPABASE_URL and DIRECT_URL are required.')
  const supabase = new URL(supabaseUrl)
  const direct = new URL(directUrl)
  if (env.PATHWAYS_HOSTED_SEED_MODE === 'test-local') {
    if (!LOOPBACK.has(supabase.hostname) || !LOOPBACK.has(direct.hostname)) {
      throw new Error('test-local mode requires loopback SUPABASE_URL and DIRECT_URL.')
    }
    return
  }
  const host = direct.hostname.toLowerCase()
  const user = decodeURIComponent(direct.username)
  const directOk =
    (host === `db.${PRODUCTION_PROJECT_REF}.supabase.co` && user === 'prisma') ||
    (host.endsWith('.pooler.supabase.com') && user === `prisma.${PRODUCTION_PROJECT_REF}`)
  if (supabaseUrl !== `https://${PRODUCTION_PROJECT_REF}.supabase.co` || !directOk) {
    throw new Error(
      `Refusing any target other than the production project ${PRODUCTION_PROJECT_REF}.`,
    )
  }
}

/** Checkout migrations the database has not finished; seeding from a newer checkout adds rows later migrations create. */
export function unappliedCheckoutMigrations(
  checkout: readonly string[],
  ledger: ReadonlyArray<{ migration_name: string; finished: boolean }>,
) {
  const applied = new Set(ledger.filter((row) => row.finished).map((row) => row.migration_name))
  return checkout.filter((name) => !applied.has(name))
}

async function main() {
  assertProductionTarget(process.env)
  const adminEmail = process.env.PATHWAYS_ADMIN_EMAIL?.trim().toLowerCase()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminEmail || !serviceKey) {
    throw new Error('PATHWAYS_ADMIN_EMAIL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  const supabase = createClient(process.env.SUPABASE_URL as string, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
  try {
    const ledger = await prisma.$queryRaw<Array<{ migration_name: string; finished: boolean }>>`
      SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS finished
      FROM public._prisma_migrations`
    const checkout = readdirSync(path.join(__dirname, '..', 'migrations')).filter((name) =>
      /^\d{4}_/.test(name),
    )
    const missing = unappliedCheckoutMigrations(checkout, ledger)
    if (missing.length) {
      throw new Error(
        `Refusing to seed: the database has not applied ${missing.length} checkout migration(s), first ${missing[0]}. Run the bootstrap from a checkout whose migrations end at the database's last migration.`,
      )
    }
    const buckets = await reconcileStorageBuckets(supabase.storage)

    let adminAuthId: string | undefined
    for (let page = 1; page <= 20 && !adminAuthId; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      adminAuthId = data.users.find((user) => user.email?.toLowerCase() === adminEmail)?.id
      if (data.users.length < 1000) break
    }
    if (!adminAuthId) {
      throw new Error(
        'The administrator Auth user was not found. Create it in Supabase Auth first.',
      )
    }
    const authUserId = adminAuthId

    const result = await prisma.$transaction(async (tx) => {
      await seedCanonicalReferenceData(tx)
      const organization =
        (await tx.organization.findUnique({ where: { code: approvedOrganization.code } })) ??
        (await tx.organization.create({ data: approvedOrganization }))
      const role = await tx.role.findUniqueOrThrow({ where: { code: 'SYSTEM_ADMINISTRATOR' } })
      const now = new Date()
      const profile = await tx.systemUser.upsert({
        where: { authUserId },
        update: {},
        create: {
          organizationId: organization.id,
          roleId: role.id,
          authUserId,
          fullName: 'System Administrator',
          email: adminEmail,
          positionTitle: 'System Administrator',
          accountStatus: 'ACTIVE',
          invitedAt: now,
          activatedAt: now,
        },
      })
      return { organizationId: organization.id, adminUserId: profile.id }
    })
    console.info(JSON.stringify({ buckets, ...result }))
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
