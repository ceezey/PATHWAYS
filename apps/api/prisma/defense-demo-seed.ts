import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

import { ActivitiesService } from '../src/modules/activities/activities.service'
import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'
import { DashboardsService } from '../src/modules/dashboards/dashboards.service'
import { EvaluationMetricsService } from '../src/modules/evaluations/evaluation-metrics'
import { EvaluationsService } from '../src/modules/evaluations/evaluations.service'
import { FinanceService } from '../src/modules/finance/finance.service'
import { ImportsService } from '../src/modules/imports/imports.service'
import { IndicatorLibraryService } from '../src/modules/indicators/indicator-library.service'
import { IndicatorsService } from '../src/modules/indicators/indicators.service'
import { MetadataService } from '../src/modules/metadata/metadata.service'
import { ParticipantsService } from '../src/modules/participants/participants.service'
import { ProjectsService } from '../src/modules/projects/projects.service'
import { PublicService } from '../src/modules/public/public.service'
import { ReportsService } from '../src/modules/reports/reports.service'
import { RulesHumanService } from '../src/modules/rules/rules-human.service'
import { StorageService } from '../src/modules/storage/storage.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { ensureBaseWorkspace } from './defense-demo-base'
import { alertSnapshot, enterPrompt, localWorkerDrain, schedulerDrain } from './defense-demo-drain'
import { describeStaff, resolveStaff } from './defense-demo-staff'
import { assertDefenseTarget } from './defense-demo-target'
import { verifyDefenseDemo } from './defense-demo-verify'
import { reconcileStorageBuckets, stableUuid } from './hosted-realistic-seed'
import {
  type DemoContext,
  type Staff,
  type StaffKey,
  identityFor,
  manilaToday,
} from './local-demo-seed'
import { localDrainRules } from './local-demo-stage-rules'
import { runDemoStages } from './local-demo-stages'
import { asUser } from './local-demo-util'

/**
 * Defense demo entrypoint: hosted PATHWAYS-devV2 by default, loopback with --test-local, read-only
 * checks with --verify. It reuses existing staff accounts and never creates auth users.
 */

async function main() {
  const testLocal = process.argv.includes('--test-local')
  assertDefenseTarget(testLocal)
  const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
  try {
    if (process.argv.includes('--verify')) {
      await verify(owner)
      return
    }
    await seed(owner, testLocal)
  } finally {
    await owner.$disconnect()
  }
}

async function verify(owner: PrismaClient) {
  const runtime = new PrismaService({ datasources: { db: { url: process.env.DATABASE_URL } } })
  try {
    const staff = await resolveActors(owner)
    const ctx = { runtime, organizationId: staff.admin.identity.organizationId }
    const results = await verifyDefenseDemo(owner, (key, run) => asUser(ctx, staff[key], run))
    console.table(results)
    if (results.some((r) => r.ok === false)) process.exitCode = 1
  } finally {
    await runtime.$disconnect()
  }
}

async function resolveActors(owner: PrismaClient) {
  const rows = await owner.systemUser.findMany({
    where: { accountStatus: 'ACTIVE' },
    select: {
      id: true,
      authUserId: true,
      email: true,
      organizationId: true,
      role: { select: { code: true } },
    },
  })
  const picked = resolveStaff(rows.map(({ role, ...row }) => ({ ...row, roleCode: role.code })))
  const staff = {} as Record<StaffKey, Staff>
  for (const [key, row] of Object.entries(picked) as Array<[StaffKey, (typeof picked)[StaffKey]]>)
    staff[key] = {
      userId: row.id,
      authUserId: row.authUserId as string,
      email: row.email,
      role: row.roleCode,
      identity: identityFor(row.authUserId as string, row.organizationId, row.id),
    }
  console.info('Resolved staff (existing accounts only):')
  for (const line of describeStaff(staff)) console.info(line)
  return staff
}

async function seed(owner: PrismaClient, testLocal: boolean) {
  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const runtime = new PrismaService({ datasources: { db: { url: process.env.DATABASE_URL } } })
  // Rule reads by non-admin roles take several seconds on a slow host, so give the seed the maximum transaction window.
  const verified = runtime.withVerifiedContext.bind(runtime) as typeof runtime.withVerifiedContext
  runtime.withVerifiedContext = (context, work, options) =>
    verified(context, work, { timeoutMs: 30_000, ...options })
  try {
    const staff = await resolveActors(owner)
    const organizationId = staff.admin.identity.organizationId
    await prepareStorage(supabase, testLocal)

    const storage = new StorageService()
    const participants = new ParticipantsService(runtime)
    const beneficiaries = new BeneficiariesService(runtime)
    const indicators = new IndicatorsService(runtime)
    const drainRules =
      localWorkerDrain(process.env) ??
      (testLocal
        ? localDrainRules((line) => console.info(line))
        : schedulerDrain({
            snapshot: alertSnapshot(owner, organizationId),
            isTty: Boolean(process.stdin.isTTY),
            prompt: enterPrompt,
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            log: (line) => console.info(line),
          }))
    const context: DemoContext = {
      today: manilaToday(),
      organizationId,
      owner,
      runtime,
      supabase,
      services: {
        projects: new ProjectsService(runtime),
        activities: new ActivitiesService(runtime, storage),
        indicators,
        library: new IndicatorLibraryService(runtime, indicators),
        beneficiaries,
        metadata: new MetadataService(runtime, participants),
        participants,
        imports: new ImportsService(runtime, storage, beneficiaries, participants),
        finance: new FinanceService(runtime, storage),
        reports: new ReportsService(runtime, storage, new DashboardsService(runtime, indicators)),
        rules: new RulesHumanService(runtime),
        publication: new PublicService(runtime),
        evaluations: new EvaluationsService(runtime, new EvaluationMetricsService(indicators)),
      },
      staff,
      programIds: new Map(),
      projectIds: new Map(),
      stable: (seed) => stableUuid(`${process.env.PATHWAYS_DEMO_SALT ?? ''}${seed}`),
      log: (line) => console.info(line),
      drainRules,
    }
    await ensureBaseWorkspace(context)
    const failures = await runDemoStages(context)
    if (failures.length) {
      console.error(`\nDefense demo finished with ${failures.length} failed stage(s):`)
      for (const failure of failures) console.error(`  - ${failure}`)
      process.exitCode = 1
    }
  } finally {
    await runtime.$disconnect()
  }
}

/** Reconciles buckets; the CSV content type widening is for the local stack only. */
export async function prepareStorage(
  client: DemoContext['supabase'],
  testLocal: boolean,
  steps = { reconcile: reconcileStorageBuckets, widen: allowCsvReports },
) {
  await steps.reconcile(client.storage)
  if (testLocal) await steps.widen(client)
}

// Local storage only: lets the CSV report content type through the private bucket allow list.
async function allowCsvReports(client: DemoContext['supabase']) {
  const wanted = 'text/csv; charset=utf-8'
  const { data, error } = await client.storage.listBuckets()
  if (error) throw error
  const bucket = data.find((row) => row.id === 'pathways-private')
  if (!bucket || bucket.allowed_mime_types?.includes(wanted)) return
  const { error: updateError } = await client.storage.updateBucket('pathways-private', {
    public: false,
    fileSizeLimit: bucket.file_size_limit ?? undefined,
    allowedMimeTypes: [...(bucket.allowed_mime_types ?? []), wanted],
  })
  if (updateError) throw updateError
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Defense demo seed failed.')
    process.exitCode = 1
  })
}
