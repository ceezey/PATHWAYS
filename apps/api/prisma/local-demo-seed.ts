import { PrismaClient } from '@prisma/client'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'

import { ActivitiesService } from '../src/modules/activities/activities.service'
import type { ApplicationIdentity } from '../src/modules/auth/developer-access'
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
import { ProjectOverviewMetricsService } from '../src/modules/projects/project-overview-metrics.service'
import { ProjectsService } from '../src/modules/projects/projects.service'
import { PublicService } from '../src/modules/public/public.service'
import type { ReceiptPdfRenderer } from '../src/modules/report-pdf/receipt-pdf.renderer'
import type { ReportPdfRenderer } from '../src/modules/report-pdf/report-pdf.renderer'
import { ReportsService } from '../src/modules/reports/reports.service'
import { RulesHumanService } from '../src/modules/rules/rules-human.service'
import { StorageService } from '../src/modules/storage/storage.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { reconcileStorageBuckets, stableUuid } from './hosted-realistic-seed'
import type { ProjectKey } from './local-demo-data'
import { localDrainRules } from './local-demo-stage-rules'
import { runDemoStages } from './local-demo-stages'
import { assertLocalDemoTarget } from './local-demo-target'

/**
 * Local presentation workspace. Runs only against the loopback Supabase stack (assertLoopback plus
 * the fixed local database port) after `pnpm db:local:reset` has written the base accounts. Every
 * domain write goes through the same application services and runtime database role the API uses,
 * so validation, row level security and audit recording apply. The few tables that have no
 * application write path yet (programs, milestones, assessment results) are written on the owner
 * connection, exactly like the base seed and hosted seed do for programs.
 */

export type StaffKey =
  | 'admin'
  | 'programManager'
  | 'grantManager'
  | 'projectManager'
  | 'me'
  | 'liza'
  | 'emmanuel'
export type Staff = {
  userId: string
  authUserId: string
  email: string
  role: string
  identity: ApplicationIdentity
}

export type DemoContext = {
  today: string
  organizationId: string
  owner: PrismaClient
  runtime: PrismaService
  // biome-ignore lint/suspicious/noExplicitAny: the client is only used for storage and auth admin calls
  supabase: SupabaseClient<any, any, any>
  services: {
    projects: ProjectsService
    activities: ActivitiesService
    indicators: IndicatorsService
    library: IndicatorLibraryService
    beneficiaries: BeneficiariesService
    metadata: MetadataService
    participants: ParticipantsService
    imports: ImportsService
    finance: FinanceService
    reports: ReportsService
    rules: RulesHumanService
    publication: PublicService
    evaluations: EvaluationsService
  }
  staff: Record<StaffKey, Staff>
  programIds: Map<string, string>
  projectIds: Map<ProjectKey, string>
  stable: (seed: string) => string
  log: (line: string) => void
  /** Evaluates the rules and commits alerts; a no-op with a log line when no drain is available. */
  drainRules: () => Promise<void>
}

const staffEmails: Record<StaffKey, string> = {
  admin: process.env.PATHWAYS_LOCAL_ADMIN_EMAIL ?? 'cian.francisco@pathways.example',
  programManager: 'maria.santos@pathways.example',
  grantManager: 'jose.reyes@pathways.example',
  projectManager: 'ana.delacruz@pathways.example',
  me: 'carlo.mendoza@pathways.example',
  liza: 'liza.bautista@pathways.example',
  emmanuel: 'emmanuel.cruz@pathways.example',
}

export function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

export function identityFor(
  authUserId: string,
  organizationId: string,
  userId: string,
): ApplicationIdentity {
  // Roles, permissions and assignments are re-derived from the database inside every authorized
  // operation; nothing here is trusted.
  return {
    id: authUserId,
    aal: 'aal2',
    userId,
    organizationId,
    fullName: '',
    roles: [],
    permissions: [],
    assignedProjectIds: [],
  }
}

export function requireId(map: Map<ProjectKey, string>, key: ProjectKey) {
  const id = map.get(key)
  if (!id) throw new Error(`Project ${key} is not available.`)
  return id
}

/** The report service uploads CSV reports as "text/csv; charset=utf-8", which the private bucket's
 * allow list ("text/csv") rejects with a 503 on the local storage server. Only this local bucket
 * is widened, so a CSV report can also be generated live during a demonstration. */
async function allowCsvReportContentType(client: DemoContext['supabase']) {
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

async function main() {
  assertLocalDemoTarget(process.env)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')
  const supabase = createClient(process.env.SUPABASE_URL as string, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } })
  const runtime = new PrismaService({ datasources: { db: { url: process.env.DATABASE_URL } } })
  const storage = new StorageService()
  const participants = new ParticipantsService(runtime)
  const beneficiaries = new BeneficiariesService(runtime)
  const indicators = new IndicatorsService(runtime)
  const dashboards = new DashboardsService(runtime, indicators)
  const services = {
    projects: new ProjectsService(runtime),
    activities: new ActivitiesService(runtime, storage),
    indicators,
    library: new IndicatorLibraryService(runtime, indicators),
    beneficiaries,
    metadata: new MetadataService(runtime, participants),
    participants,
    imports: new ImportsService(runtime, storage, beneficiaries, participants),
    finance: new FinanceService(runtime, storage, {
      // Seeds never render a receipt document; the Chromium renderer stays off.
      render: () => Promise.reject(new Error('Receipt renderer disabled.')),
    } as unknown as ReceiptPdfRenderer),
    reports: new ReportsService(
      runtime,
      storage,
      dashboards,
      // Seeds keep pdfkit output deterministic by disabling the Chromium renderer.
      {
        render: () => Promise.reject(new Error('PDF renderer disabled.')),
      } as unknown as ReportPdfRenderer,
      new ProjectOverviewMetricsService(runtime, indicators, dashboards),
      new RulesHumanService(runtime),
    ),
    rules: new RulesHumanService(runtime),
    publication: new PublicService(runtime),
    evaluations: new EvaluationsService(runtime, new EvaluationMetricsService(indicators)),
  }

  const failures: string[] = []
  try {
    await reconcileStorageBuckets(supabase.storage)
    await allowCsvReportContentType(supabase)

    const staff = {} as Record<StaffKey, Staff>
    let organizationId = ''
    for (const [key, email] of Object.entries(staffEmails) as Array<[StaffKey, string]>) {
      const user = await owner.systemUser.findFirst({
        where: { email },
        select: {
          id: true,
          authUserId: true,
          organizationId: true,
          role: { select: { code: true } },
        },
      })
      if (!user) throw new Error(`Base account ${email} is missing. Run pnpm db:local:reset first.`)
      organizationId = user.organizationId
      staff[key] = {
        userId: user.id,
        authUserId: user.authUserId as string,
        email,
        role: user.role.code,
        identity: identityFor(user.authUserId as string, user.organizationId, user.id),
      }
    }

    const log = (line: string) => console.info(line)
    const context: DemoContext = {
      today: manilaToday(),
      organizationId,
      owner,
      runtime,
      supabase,
      services,
      staff,
      programIds: new Map(),
      projectIds: new Map(),
      // A salt is only for rebuilding after hand-deleting rows during development; normal runs use none.
      stable: (seed) => stableUuid(`${process.env.PATHWAYS_DEMO_SALT ?? ''}${seed}`),
      log,
      drainRules: localDrainRules(log),
    }
    failures.push(...(await runDemoStages(context)))
  } finally {
    await Promise.all([owner.$disconnect(), runtime.$disconnect()])
  }
  if (failures.length) {
    console.error(`\nLocal demo workspace finished with ${failures.length} failed stage(s):`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : 'Local demo workspace failed.')
    process.exitCode = 1
  })
}
