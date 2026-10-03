import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

import type {
  CreateActivityDto,
  TransitionActivityDto,
} from '../src/modules/activities/activities.dto'
import { ActivitiesService } from '../src/modules/activities/activities.service'
import type { CanonicalRole } from '../src/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '../src/modules/auth/developer-access'
import type { RegisterBeneficiaryDto } from '../src/modules/beneficiaries/beneficiaries.dto'
import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'
import { IndicatorsService } from '../src/modules/indicators/indicators.service'
import type { CreateProjectDto } from '../src/modules/projects/projects.dto'
import { ProjectsService } from '../src/modules/projects/projects.service'
import { StorageService } from '../src/modules/storage/storage.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { seedCanonicalReferenceData } from './canonical-seed'
import { approvedOrganization } from './developer-bootstrap'

/**
 * Realistic, fictional Philippine-context hosted seed for the PATHWAYS-devV2 project
 * (klbtoqdalmcsfjqophty). Run only through scripts/db/hosted-seed.mjs, which validates the
 * target and forwards env vars; this file never resolves or validates a Supabase project on
 * its own. Never creates, invites, emails, or sets a password for the System Administrator
 * account; it is looked up by email through the admin API and must already exist.
 */

const ALLOWED_PROJECT_REF = 'klbtoqdalmcsfjqophty'
const ALLOWED_SUPABASE_URL = `https://${ALLOWED_PROJECT_REF}.supabase.co`
const ALLOWED_DIRECT_PG_HOST = `db.${ALLOWED_PROJECT_REF}.supabase.co`
const SYSTEM_ADMIN_EMAIL = 'cianjake.francisco@gmail.com'
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

type DummyStaffAccount = {
  role: CanonicalRole
  firstName: string
  lastName: string
  positionTitle: string
}

const dummyStaff: DummyStaffAccount[] = [
  {
    role: 'PROGRAM_MANAGER',
    firstName: 'Maricel',
    lastName: 'Villanueva',
    positionTitle: 'Program Manager, Child Protection and Education',
  },
  {
    role: 'GRANT_MANAGER',
    firstName: 'Rodrigo',
    lastName: 'Bautista',
    positionTitle: 'Grant Manager',
  },
  {
    role: 'PROJECT_MANAGER',
    firstName: 'Angelica',
    lastName: 'Fernandez',
    positionTitle: 'Project Manager',
  },
  {
    role: 'MONITORING_AND_EVALUATION_OFFICER',
    firstName: 'Noel',
    lastName: 'Aquino',
    positionTitle: 'Monitoring and Evaluation Officer',
  },
  {
    role: 'PROJECT_OFFICER',
    firstName: 'Dianne',
    lastName: 'Salazar',
    positionTitle: 'Project Officer, Northern Samar',
  },
  {
    role: 'PROJECT_OFFICER',
    firstName: 'Emmanuel',
    lastName: 'Cruz',
    positionTitle: 'Project Officer, Masbate',
  },
]

// Role subdomains for dummy staff addresses, e.g. po.pathways.co.ph for Project Officers.
const staffRoleSubdomain: Partial<Record<CanonicalRole, string>> = {
  GRANT_MANAGER: 'gm',
  MONITORING_AND_EVALUATION_OFFICER: 'meo',
  PROGRAM_MANAGER: 'pgm',
  PROJECT_MANAGER: 'pm',
  PROJECT_OFFICER: 'po',
}

function staffEmail(staff: DummyStaffAccount) {
  return `${staff.firstName.toLowerCase()}.${staff.lastName.toLowerCase()}@${staffRoleSubdomain[staff.role]}.pathways.co.ph`
}

/** Stable deterministic UUID (v4-shaped, not cryptographically a v5) derived from a fixed seed
 * string, so idempotency keys (clientMutationId/clientRegistrationId) are identical on rerun.
 */
function stableUuid(seed: string) {
  const hash = createHash('sha256').update(seed).digest('hex')
  const bytes = hash.slice(0, 32).split('')
  // Set version 4 and RFC 4122 variant bits so the value is a structurally valid UUID.
  bytes[12] = '4'
  const variantNibble = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16)
  bytes[16] = variantNibble
  const hex = bytes.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function generatePassword() {
  return `Pw-${randomBytes(18).toString('base64url')}`
}

function parseUrlOrThrow(raw: string, label: string): URL {
  try {
    return new URL(raw)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }
}

function safeUsername(url: URL): string {
  try {
    return decodeURIComponent(url.username || '')
  } catch {
    return url.username || ''
  }
}

function isLoopback(hostname: string | null): boolean {
  return Boolean(hostname) && LOOPBACK.has(String(hostname).toLowerCase())
}

function isPoolerHost(hostname: string | null): boolean {
  return /\.pooler\.supabase\.com$/i.test(String(hostname || ''))
}

// Mirrors scripts/db/hosted-seed-target.mjs's assertHostedPgUrl: the host must be the
// project's direct Postgres host (bare role username) or a pooler host (username
// "<role>.<ref>"). Anything else, including a loopback host, is rejected in hosted mode.
function assertHostedPgUrl(url: URL, label: string, expectedRole: string): void {
  const host = (url.hostname || '').toLowerCase()
  const username = safeUsername(url)
  if (host === ALLOWED_DIRECT_PG_HOST) {
    if (username !== expectedRole) {
      throw new Error(
        `${label} must connect as role "${expectedRole}" on ${ALLOWED_DIRECT_PG_HOST}.`,
      )
    }
    return
  }
  if (isPoolerHost(host)) {
    const expectedUsername = `${expectedRole}.${ALLOWED_PROJECT_REF}`
    if (username !== expectedUsername) {
      throw new Error(
        `${label} must use username "${expectedUsername}" on a *.pooler.supabase.com host.`,
      )
    }
    return
  }
  throw new Error(
    `${label} host must be exactly ${ALLOWED_DIRECT_PG_HOST} or a *.pooler.supabase.com host with username "${expectedRole}.${ALLOWED_PROJECT_REF}". Refusing to seed any other target (including loopback hosts) in hosted mode.`,
  )
}

function assertGuardedTarget() {
  const testLocal = process.env.PATHWAYS_HOSTED_SEED_MODE === 'test-local'
  const supabaseUrl = process.env.SUPABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  const directUrl = process.env.DIRECT_URL
  if (!supabaseUrl || !databaseUrl || !directUrl) {
    throw new Error('SUPABASE_URL, DATABASE_URL and DIRECT_URL are all required.')
  }
  const supabaseParsed = parseUrlOrThrow(supabaseUrl, 'SUPABASE_URL')
  const databaseParsed = parseUrlOrThrow(databaseUrl, 'DATABASE_URL')
  const directParsed = parseUrlOrThrow(directUrl, 'DIRECT_URL')

  if (testLocal) {
    if (
      !isLoopback(supabaseParsed.hostname) ||
      !isLoopback(databaseParsed.hostname) ||
      !isLoopback(directParsed.hostname)
    ) {
      throw new Error(
        '--test-local requires every URL (SUPABASE_URL, DATABASE_URL, DIRECT_URL) to be loopback. ' +
          'Refusing a hosted target.',
      )
    }
    return { testLocal: true as const }
  }
  if (supabaseUrl !== ALLOWED_SUPABASE_URL) {
    throw new Error(`SUPABASE_URL must equal exactly ${ALLOWED_SUPABASE_URL}.`)
  }
  // DATABASE_URL is the runtime identity; DIRECT_URL is the migration owner.
  assertHostedPgUrl(databaseParsed, 'DATABASE_URL', 'pathways_runtime')
  assertHostedPgUrl(directParsed, 'DIRECT_URL', 'prisma')
  return { testLocal: false as const }
}

function identityFor(
  authUserId: string,
  organizationId: string,
  userId: string,
): ApplicationIdentity {
  // Placeholder shape only: withAuthorizedOperation re-derives roles/permissions/fullName from
  // the database inside the same transaction, so nothing here is trusted or used directly.
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

const privateBuckets: Array<{
  id: string
  fileSizeLimit: number
  allowedMimeTypes?: string[]
}> = [
  {
    id: 'pathways-private',
    fileSizeLimit: 52_428_800,
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  { id: 'uploads', fileSizeLimit: 52_428_800 },
  { id: 'reports', fileSizeLimit: 52_428_800 },
  { id: 'participant-cards', fileSizeLimit: 52_428_800 },
  { id: 'assets', fileSizeLimit: 52_428_800 },
]

type BucketPlan = { id: string; fileSizeLimit: number; allowedMimeTypes?: string[] }
type ExistingBucketRow = {
  id: string
  public: boolean
  file_size_limit?: number | null
  allowed_mime_types?: string[] | null
}
/** Minimal shape of the supabase-js storage admin client this reconciler needs, so it can be
 * unit tested with a fake client instead of a real Supabase Storage service. */
type StorageBucketAdmin = {
  listBuckets(): Promise<{ data: ExistingBucketRow[] | null; error: unknown }>
  createBucket(
    id: string,
    options: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] },
  ): Promise<{ error: unknown }>
  updateBucket(
    id: string,
    options: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] },
  ): Promise<{ error: unknown }>
}

function sameMimeList(a: string[] | null | undefined, b: string[] | undefined) {
  const normalize = (list?: string[] | null) => [...(list ?? [])].sort()
  const x = normalize(a)
  const y = normalize(b)
  return x.length === y.length && x.every((value, index) => value === y[index])
}

/** Creates any missing bucket, and brings an already-existing bucket's settings (visibility,
 * file size limit, allowed MIME types) up to the required configuration instead of leaving it
 * however it happened to be left by earlier runs or manual changes. Returns one outcome per
 * bucket id: 'CREATED', 'UPDATED', or 'UNCHANGED' when it already matched. */
export async function reconcileStorageBuckets(
  storage: StorageBucketAdmin,
  buckets: readonly BucketPlan[] = privateBuckets,
): Promise<Record<string, 'CREATED' | 'UPDATED' | 'UNCHANGED'>> {
  const { data: existingBuckets, error: listError } = await storage.listBuckets()
  if (listError) throw listError
  const outcomes: Record<string, 'CREATED' | 'UPDATED' | 'UNCHANGED'> = {}
  for (const bucket of buckets) {
    const existing = existingBuckets?.find((row) => row.id === bucket.id)
    const desired = {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes,
    }
    if (!existing) {
      const { error } = await storage.createBucket(bucket.id, desired)
      if (error) throw error
      outcomes[bucket.id] = 'CREATED'
      continue
    }
    const matches =
      existing.public === false &&
      existing.file_size_limit === bucket.fileSizeLimit &&
      sameMimeList(existing.allowed_mime_types, bucket.allowedMimeTypes)
    if (matches) {
      outcomes[bucket.id] = 'UNCHANGED'
      continue
    }
    const { error } = await storage.updateBucket(bucket.id, desired)
    if (error) throw error
    outcomes[bucket.id] = 'UPDATED'
  }
  return outcomes
}

type ProjectPlan = {
  code: string
  title: string
  description: string
  objectives: string
  implementationArea: string
  province: string
  cityMunicipality: string
  barangays: string[]
  sector: string
  targetBeneficiaries: number
  projectBudget: string
  partners: string[]
  startDate: string
  endDate: string
  status: 'ONGOING'
  beneficiaryCount: number
}

const projectPlans: ProjectPlan[] = [
  {
    // Deliberately distinct from local-synthetic-seed.ts's own 'SSG-ES-2026' fixture
    // (same organization, PLAN_PH): two independent seed scripts must never collide on
    // a project code, or one silently treats the other's project as "already exists"
    // and skips its own team-assignment/activity setup for it.
    code: 'SGE-ES-2026',
    title: 'School Girls Education Continuity Initiative - Eastern Samar',
    description:
      'Strengthens school-based protection and learning continuity for adolescent girls in typhoon-affected municipalities of Eastern Samar.',
    objectives:
      'Reduce school dropout among girls aged 12-17 and establish functioning school protection committees.',
    implementationArea: 'Borongan City and Guiuan, Eastern Samar',
    province: 'Eastern Samar',
    cityMunicipality: 'Borongan City',
    barangays: ['Songco', 'Sabang', 'San Policarpo'],
    sector: 'Education',
    targetBeneficiaries: 1200,
    projectBudget: '4500000.00',
    partners: [
      'Department of Education Eastern Samar Division',
      'Borongan City Local Government Unit',
    ],
    startDate: '2026-03-01',
    endDate: '2027-08-31',
    status: 'ONGOING',
    beneficiaryCount: 21,
  },
  {
    code: 'CRL-NS-2026',
    title: 'Community Resilience and Livelihoods - Northern Samar',
    description:
      'Builds household and community resilience through livelihood diversification and disaster preparedness in coastal Northern Samar barangays.',
    objectives:
      'Increase household income diversification and functioning barangay disaster response teams.',
    implementationArea: 'Catarman and Lavezares, Northern Samar',
    province: 'Northern Samar',
    cityMunicipality: 'Catarman',
    barangays: ['Bagacay', 'Cag-abaca', 'Dalakit'],
    sector: 'Livelihoods',
    targetBeneficiaries: 800,
    projectBudget: '3200000.00',
    partners: ['Northern Samar Provincial Agriculture Office'],
    startDate: '2026-02-01',
    endDate: '2027-12-31',
    status: 'ONGOING',
    beneficiaryCount: 21,
  },
  {
    code: 'ECD-MB-2026',
    title: 'Early Childhood Development Pilot - Masbate',
    description:
      'Pilots a small early childhood development and parenting support cohort in a single Masbate barangay before wider rollout.',
    objectives:
      'Validate the parenting-session curriculum with a small starting cohort before scale-up.',
    implementationArea: 'Masbate City, Masbate',
    province: 'Masbate',
    cityMunicipality: 'Masbate City',
    barangays: ['Bapor', 'Buenavista'],
    sector: 'Early Childhood Development',
    targetBeneficiaries: 60,
    projectBudget: '450000.00',
    partners: ['Masbate City Social Welfare and Development Office'],
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'ONGOING',
    beneficiaryCount: 3,
  },
]

const filipinoFirstNamesFemale = [
  'Maria',
  'Angela',
  'Kristine',
  'Joy',
  'Precious',
  'Rica',
  'Divine',
  'Shaira',
  'Ella',
  'Nica',
  'Grace',
  'Jasmine',
  'Kate',
  'Lorraine',
  'Michelle',
  'Nicole',
  'Rosemarie',
  'Samantha',
  'Trisha',
  'Yasmin',
  'Bea',
  'Charmaine',
  'Diana',
]
const filipinoFirstNamesMale = [
  'Jose',
  'Mark',
  'John',
  'Paolo',
  'Miguel',
  'Ronnel',
  'Kevin',
  'Christian',
  'Rafael',
  'Vince',
  'Aldrin',
  'Bryan',
  'Carlo',
  'Dennis',
  'Edgar',
  'Francis',
  'Gerald',
  'Henry',
  'Ivan',
  'Jerome',
  'Kyle',
  'Leo',
]
const filipinoLastNames = [
  'Santos',
  'Reyes',
  'Cruz',
  'Bautista',
  'Ocampo',
  'Garcia',
  'Mendoza',
  'Torres',
  'Flores',
  'Ramos',
  'Villanueva',
  'Aquino',
  'Castillo',
  'Del Rosario',
  'Gonzales',
  'Navarro',
  'Pascual',
  'Salazar',
  'Tolentino',
  'Valdez',
  'Ignacio',
  'Lopez',
  'Marasigan',
  'Robles',
]

function pick<T>(items: readonly T[], index: number) {
  return items[index % items.length]
}

function isoDate(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function main() {
  const guard = assertGuardedTarget()
  const supabaseUrl = process.env.SUPABASE_URL as string
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const directUrl = process.env.DIRECT_URL as string
  const runtimeUrl = process.env.DATABASE_URL as string
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } })
  const runtime = new PrismaService({ datasources: { db: { url: runtimeUrl } } })
  const storage = new StorageService()
  const projectsService = new ProjectsService(runtime)
  const activitiesService = new ActivitiesService(runtime, storage)
  const indicatorsService = new IndicatorsService(runtime)
  const beneficiariesService = new BeneficiariesService(runtime)

  try {
    // --- Storage buckets -------------------------------------------------
    const bucketOutcomes = await reconcileStorageBuckets(supabase.storage)

    // --- System Administrator lookup (never created here) ----------------
    let adminAuthId: string | null = null
    for (let page = 1; page <= 20 && !adminAuthId; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      const found = data.users.find((user) => user.email === SYSTEM_ADMIN_EMAIL)
      if (found) adminAuthId = found.id
      if (data.users.length < 1000) break
    }
    if (!adminAuthId) {
      throw new Error(
        `System Administrator Auth account "${SYSTEM_ADMIN_EMAIL}" was not found. Create it in Supabase Auth first; this seed never creates, invites, or sets a password for it.`,
      )
    }

    // --- Dummy staff Auth accounts -----------------------------------------
    const staffCredentials: { role: CanonicalRole; email: string; password?: string }[] = []
    const staffAuthIds = new Map<string, string>()
    {
      const existingByEmail = new Map<string, string>()
      for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        for (const user of data.users) if (user.email) existingByEmail.set(user.email, user.id)
        if (data.users.length < 1000) break
      }
      for (const staff of dummyStaff) {
        const email = staffEmail(staff)
        const found = existingByEmail.get(email)
        if (found) {
          staffAuthIds.set(email, found)
          staffCredentials.push({ role: staff.role, email })
          continue
        }
        const password = generatePassword()
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        })
        if (error) throw error
        staffAuthIds.set(email, data.user.id)
        staffCredentials.push({ role: staff.role, email, password })
      }
    }
    const createdCredentials = staffCredentials.filter((entry) => entry.password)
    if (createdCredentials.length) {
      const outputDir = path.resolve(__dirname, '..', '..', '..', '.tmp', 'hosted-seed')
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(
        path.join(outputDir, `credentials-${Date.now()}.json`),
        `${JSON.stringify({ supabaseUrl, accounts: createdCredentials }, null, 2)}\n`,
        { mode: 0o600 },
      )
    }

    // --- Canonical reference data + organization + profiles (superuser tx) ---
    const seededAt = new Date()
    const workspace = await prisma.$transaction(async (tx) => {
      await seedCanonicalReferenceData(tx)
      const roles = new Map((await tx.role.findMany()).map((role) => [role.code, role.id]))
      const organization =
        (await tx.organization.findUnique({ where: { code: approvedOrganization.code } })) ??
        (await tx.organization.create({
          data: {
            ...approvedOrganization,
            description: 'Plan International Pilipinas role-staging workspace.',
            contactEmail: 'info@plan-international.test',
            address: 'Makati City, Metro Manila',
          },
        }))

      const adminRoleId = roles.get('SYSTEM_ADMINISTRATOR')
      if (!adminRoleId) throw new Error('Missing canonical role SYSTEM_ADMINISTRATOR.')
      const adminProfile = await tx.systemUser.upsert({
        where: { authUserId: adminAuthId as string },
        update: {},
        create: {
          organizationId: organization.id,
          roleId: adminRoleId,
          authUserId: adminAuthId as string,
          fullName: 'System Administrator',
          email: SYSTEM_ADMIN_EMAIL,
          positionTitle: 'System Administrator',
          accountStatus: 'ACTIVE',
          invitedAt: seededAt,
          activatedAt: seededAt,
        },
      })

      const staffUserIds = new Map<CanonicalRole | string, string>()
      const staffByRole = new Map<CanonicalRole, string[]>()
      for (const staff of dummyStaff) {
        const email = staffEmail(staff)
        const authUserId = staffAuthIds.get(email) as string
        const roleId = roles.get(staff.role)
        if (!roleId) throw new Error(`Missing canonical role ${staff.role}.`)
        const user = await tx.systemUser.upsert({
          where: { authUserId },
          update: {},
          create: {
            organizationId: organization.id,
            roleId,
            authUserId,
            fullName: `${staff.firstName} ${staff.lastName}`,
            email,
            positionTitle: staff.positionTitle,
            accountStatus: 'ACTIVE',
            invitedAt: seededAt,
            activatedAt: seededAt,
          },
        })
        staffUserIds.set(email, user.id)
        staffByRole.set(staff.role, [...(staffByRole.get(staff.role) ?? []), user.id])
      }

      return {
        organizationId: organization.id,
        adminUserId: adminProfile.id,
        staffUserIds,
        staffByRole,
      }
    })

    // --- Programs: still created on the owner connection -----------------------------
    // ProgramsService.create() is gated behind the 'programs.create' permission (see its
    // @RequirePermission('programs.create') controller and its own internal
    // SYSTEM_ADMINISTRATOR-only check), but no canonical role is ever granted that
    // permission: it is absent from SYSTEM_ADMINISTRATOR's grant list in
    // authorization-policy.ts, and rbac-contract.json lists zero roles for it too. Calling
    // programsService.create() here throws ForbiddenException('Required application
    // permission is missing.') for every identity, including a real System Administrator —
    // this is a pre-existing RBAC gap in the product, not something this seed can safely
    // paper over. Fixing it needs a new migration (the 0027/0035 grant matrices are an
    // immutable, migration-verified ceiling per csv-rbac.test.ts) plus an RBAC contract
    // update and SAD review, which is out of scope for this seed. Filed as a follow-up;
    // until then, program creation stays on the owner connection like the rest of this
    // bootstrap subset, with the same rationale (prisma owns these tables without FORCE
    // RLS, and there is no signed-in identity this early for RLS to check against anyway).
    const programPlans: Array<{
      code: string
      name: string
      description: string
      startDate: string
      endDate: string
      status: 'ONGOING'
    }> = [
      {
        code: 'CPE-2026',
        name: 'Child Protection and Education Program',
        description: 'Protects children and keeps them learning across Eastern Visayas and Bicol.',
        startDate: '2026-01-01',
        endDate: '2028-12-31',
        status: 'ONGOING',
      },
      {
        code: 'RES-2026',
        name: 'Resilient Communities Program',
        description:
          'Strengthens household resilience and livelihoods in disaster-prone provinces.',
        startDate: '2026-01-01',
        endDate: '2028-12-31',
        status: 'ONGOING',
      },
    ]
    const programManagerId = workspace.staffByRole.get('PROGRAM_MANAGER')?.[0]
    const programIds = new Map<string, string>()
    for (const plan of programPlans) {
      const existing = await prisma.program.findFirst({
        where: { organizationId: workspace.organizationId, code: plan.code },
      })
      if (existing) {
        programIds.set(plan.code, existing.id)
        continue
      }
      const created = await prisma.program.create({
        data: {
          organizationId: workspace.organizationId,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          managerUserId: programManagerId,
          startDate: new Date(`${plan.startDate}T00:00:00.000Z`),
          endDate: new Date(`${plan.endDate}T00:00:00.000Z`),
          status: plan.status,
        },
      })
      programIds.set(plan.code, created.id)
    }

    const emailOf = (staff: DummyStaffAccount) => staffEmail(staff)
    const userIdOf = (staff: DummyStaffAccount) =>
      workspace.staffUserIds.get(emailOf(staff)) as string
    const authIdOf = (staff: DummyStaffAccount) => staffAuthIds.get(emailOf(staff)) as string
    const projectManagerStaff = dummyStaff.find(
      (s) => s.role === 'PROJECT_MANAGER',
    ) as DummyStaffAccount
    const monitoringOfficerStaff = dummyStaff.find(
      (s) => s.role === 'MONITORING_AND_EVALUATION_OFFICER',
    ) as DummyStaffAccount
    const projectOfficerStaff = dummyStaff.filter((s) => s.role === 'PROJECT_OFFICER')
    const programManagerStaff = dummyStaff.find(
      (s) => s.role === 'PROGRAM_MANAGER',
    ) as DummyStaffAccount

    const projectManagerIdentity = identityFor(
      authIdOf(projectManagerStaff),
      workspace.organizationId,
      userIdOf(projectManagerStaff),
    )
    const administratorIdentity = identityFor(
      adminAuthId,
      workspace.organizationId,
      workspace.adminUserId,
    )

    const programCodesByProjectIndex = ['CPE-2026', 'CPE-2026', 'RES-2026']
    const projectSummaries: Array<{
      plan: ProjectPlan
      projectId: string
      activityStatuses: string[]
      indicatorCount: number
      registeredBeneficiaries: number
    }> = []

    let projectIndex = -1
    for (const plan of projectPlans) {
      projectIndex += 1
      const programId = programIds.get(programCodesByProjectIndex[projectIndex])

      // --- Project (through ProjectsService.create, under the Project Manager's own scope) ---
      const existingProject = await prisma.project.findFirst({
        where: { organizationId: workspace.organizationId, code: plan.code },
      })
      let projectId: string
      if (existingProject) {
        projectId = existingProject.id
      } else {
        const createProjectDto: CreateProjectDto = {
          code: plan.code,
          title: plan.title,
          description: plan.description,
          objectives: plan.objectives,
          implementationArea: plan.implementationArea,
          implementingPartnerNames: plan.partners,
          sector: plan.sector,
          targetBeneficiaries: plan.targetBeneficiaries,
          projectBudget: plan.projectBudget,
          programManagerId: userIdOf(programManagerStaff),
          projectManagerId: userIdOf(projectManagerStaff),
          monitoringOfficerId: userIdOf(monitoringOfficerStaff),
          projectOfficerIds: projectOfficerStaff.map(userIdOf),
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: plan.status,
          programId,
        }
        const created = await projectsService.create(projectManagerIdentity, createProjectDto)
        projectId = (created as { id: string }).id
      }

      // --- Team assignments: already established through the authorized path. ---
      // projectsService.create() (above) runs the same private replaceTeamAssignments
      // step the ProjectsService API uses for real team changes, under the Project
      // Manager identity, inside the same transaction as project creation. There is
      // no separate raw-SQL write here and no forged request.jwt.claim/app.* session
      // config: the Row Level Security identity used for this project's team was
      // always the one withAuthorizedOperation derived server-side for that call.
      // On a rerun (existingProject above), the team from the first run is left
      // untouched, matching this seed's no-duplicates guarantee.

      // --- Activities (5-8, mixed statuses) --------------------------------
      const activityTemplates = [
        { title: 'Baseline household survey', type: 'Assessment', days: 14 },
        { title: 'Community orientation session', type: 'Community Engagement', days: 7 },
        { title: 'Training of frontline volunteers', type: 'Capacity Building', days: 10 },
        { title: 'Distribution of learning/starter kits', type: 'Distribution', days: 5 },
        { title: 'Monthly monitoring visit - Q2', type: 'Monitoring', days: 3 },
        { title: 'Midline review workshop', type: 'Review', days: 4 },
        { title: 'Follow-up household visits', type: 'Monitoring', days: 20 },
      ]
      const activityCount = 5 + (projectIndex % 3) // 5, 6, 7
      const activityStatuses: string[] = []
      for (let i = 0; i < activityCount; i += 1) {
        const template = pick(activityTemplates, i)
        const clientMutationId = stableUuid(`activity-create:${plan.code}:${i}`)
        const plannedStart = addDaysIso(plan.startDate, i * 21)
        const plannedEnd = addDaysIso(plannedStart, template.days)
        const createDto: CreateActivityDto = {
          clientMutationId,
          code: `ACT-${plan.code}-${String(i + 1).padStart(2, '0')}`,
          title: template.title,
          description: `${template.title} for ${plan.title}.`,
          activityType: template.type,
          plannedStartDate: plannedStart,
          plannedEndDate: plannedEnd,
          targetBeneficiaries: Math.max(10, Math.floor(plan.targetBeneficiaries / activityCount)),
          budgetAllocation: (Number(plan.projectBudget) / activityCount / 10).toFixed(2),
          assignedUserIds: [userIdOf(projectOfficerStaff[i % projectOfficerStaff.length])],
        }
        const existingActivity = await prisma.projectActivity.findFirst({
          where: { organizationId: workspace.organizationId, projectId, code: createDto.code },
        })
        if (!existingActivity) {
          await activitiesService.create(projectManagerIdentity, projectId, createDto)
        }
        // Re-read from the database rather than trust the service's mapped return shape, so
        // the status/updatedAt used for the transition decision below is always accurate.
        const activity = await prisma.projectActivity.findFirstOrThrow({
          where: { organizationId: workspace.organizationId, projectId, code: createDto.code },
        })

        // Mixed statuses: leave roughly a third PLANNED, move a third IN_PROGRESS, cancel one.
        if (activity.status === 'NOT_STARTED') {
          if (i === activityCount - 1 && projectIndex === 0) {
            const fresh = await prisma.projectActivity.findUniqueOrThrow({
              where: { id: activity.id },
            })
            const transitionDto: TransitionActivityDto = {
              clientMutationId: stableUuid(`activity-cancel:${plan.code}:${i}`),
              status: 'CANCELLED',
              reason: 'Superseded by a merged follow-up activity.',
              expectedUpdatedAt: fresh.updatedAt.toISOString(),
            }
            await activitiesService.transition(
              projectManagerIdentity,
              projectId,
              activity.id,
              transitionDto,
            )
          } else if (i % 3 === 1) {
            const fresh = await prisma.projectActivity.findUniqueOrThrow({
              where: { id: activity.id },
            })
            const transitionDto: TransitionActivityDto = {
              clientMutationId: stableUuid(`activity-start:${plan.code}:${i}`),
              status: 'IN_PROGRESS',
              expectedUpdatedAt: fresh.updatedAt.toISOString(),
            }
            await activitiesService.transition(
              projectManagerIdentity,
              projectId,
              activity.id,
              transitionDto,
            )
          }
        }
        const finalRow = await prisma.projectActivity.findUniqueOrThrow({
          where: { id: activity.id },
        })
        activityStatuses.push(finalRow.status)
      }

      // --- Indicators (2-3 per project, with baseline/target and a few measurements) ---
      const indicatorTemplates = [
        {
          code: `${plan.code.replace(/-/g, '')}-ENR`,
          name: 'Beneficiaries enrolled',
          unitLabel: 'persons',
          numericKind: 'COUNT',
          direction: 'HIGHER_IS_BETTER',
          baseline: '0',
          target: String(plan.targetBeneficiaries),
        },
        {
          code: `${plan.code.replace(/-/g, '')}-ATT`,
          name: 'Session attendance rate',
          unitLabel: 'percent',
          numericKind: 'PERCENTAGE',
          direction: 'HIGHER_IS_BETTER',
          baseline: '40.00',
          target: '85.00',
        },
        {
          code: `${plan.code.replace(/-/g, '')}-SAT`,
          name: 'Community satisfaction score',
          unitLabel: 'score (0-10)',
          numericKind: 'NON_NEGATIVE',
          direction: 'HIGHER_IS_BETTER',
          baseline: '5.0',
          target: '8.0',
        },
      ]
      const indicatorCount = 2 + (projectIndex % 2) // 2 or 3
      for (let i = 0; i < indicatorCount; i += 1) {
        const template = indicatorTemplates[i]
        const existingIndicator = await prisma.projectIndicator.findFirst({
          where: { organizationId: workspace.organizationId, projectId, code: template.code },
        })
        let indicatorId: string
        if (existingIndicator) {
          indicatorId = existingIndicator.id
        } else {
          const displayPrecision = template.numericKind === 'COUNT' ? 0 : 2
          const created = (await indicatorsService.create(projectManagerIdentity, projectId, {
            code: template.code,
            name: template.name,
            unitLabel: template.unitLabel,
            dataSource: 'Manual field reporting',
            mode: 'MANUAL',
            numericKind: template.numericKind,
            direction: template.direction,
            displayPrecision,
            periodStart: plan.startDate,
            periodEnd: addDaysIso(plan.startDate, 365),
            baseline: template.baseline,
            target: template.target,
            clientMutationId: stableUuid(`indicator-create:${plan.code}:${template.code}`),
          })) as unknown as { id: string }
          indicatorId = created.id
        }

        const periodStart = plan.startDate
        const periodEnd = addDaysIso(plan.startDate, 365)
        const readingValue = (reading: number) =>
          template.numericKind === 'COUNT'
            ? String(Math.round(plan.beneficiaryCount * (0.4 + (i + reading) * 0.2)))
            : template.numericKind === 'PERCENTAGE'
              ? (55 + (i + reading) * 10).toFixed(2)
              : (6 + (i + reading) * 0.5).toFixed(1)
        const firstMeasure = (await indicatorsService.measure(
          projectManagerIdentity,
          projectId,
          indicatorId,
          {
            clientMeasurementId: stableUuid(`indicator-measure:${plan.code}:${template.code}:0`),
            periodStart,
            periodEnd,
            value: readingValue(0),
            source: 'Field monitoring report',
          },
        )) as unknown as { measurementId: string | null }
        if (firstMeasure.measurementId) {
          await indicatorsService.measure(projectManagerIdentity, projectId, indicatorId, {
            clientMeasurementId: stableUuid(`indicator-measure:${plan.code}:${template.code}:1`),
            periodStart,
            periodEnd,
            value: readingValue(1),
            source: 'Field monitoring report',
            correctsMeasurementId: firstMeasure.measurementId,
            correctionReason: 'Updated with the latest monitoring visit reading.',
          })
        }
      }

      // --- Beneficiary registration form + beneficiaries -------------------
      const registrationContext = await beneficiariesService.ensureDefaultRegistrationForm(
        projectManagerIdentity,
        projectId,
      )
      const formId = registrationContext.definitions[0]?.id
      if (!formId) throw new Error(`Default registration form unavailable for ${plan.code}.`)

      let registeredCount = 0
      for (let i = 0; i < plan.beneficiaryCount; i += 1) {
        const { registerDto } = planBeneficiaryRegistration(plan, projectIndex, i, formId)
        await beneficiariesService.register(projectManagerIdentity, projectId, registerDto)
        registeredCount += 1
      }

      projectSummaries.push({
        plan,
        projectId,
        activityStatuses,
        indicatorCount,
        registeredBeneficiaries: registeredCount,
      })
    }

    // --- Summary ------------------------------------------------------------
    const totalBeneficiaries = projectSummaries.reduce(
      (sum, p) => sum + p.registeredBeneficiaries,
      0,
    )
    console.info('\n=== Hosted realistic seed complete (PATHWAYS-devV2) ===')
    console.info(`Mode: ${guard.testLocal ? 'test-local' : 'hosted'}`)
    console.info(`Organization: ${approvedOrganization.name} (${approvedOrganization.code})`)
    console.info('\nStorage buckets:')
    for (const [id, outcome] of Object.entries(bucketOutcomes)) console.info(`  ${id}: ${outcome}`)
    console.info('\nUsers and roles:')
    console.info(
      `  ${SYSTEM_ADMIN_EMAIL}: SYSTEM_ADMINISTRATOR (existing Auth account, linked only)`,
    )
    for (const staff of dummyStaff) console.info(`  ${emailOf(staff)}: ${staff.role}`)
    console.info('\nPrograms:')
    for (const [code] of programIds) console.info(`  ${code}`)
    console.info('\nProjects:')
    for (const summary of projectSummaries) {
      console.info(
        `  ${summary.plan.code} (${summary.plan.province}): ` +
          `${summary.activityStatuses.length} activities [${summary.activityStatuses.join(', ')}], ` +
          `${summary.indicatorCount} indicators, ${summary.registeredBeneficiaries} beneficiaries`,
      )
    }
    console.info(`\nTotal beneficiaries: ${totalBeneficiaries}`)
    console.info(
      `Small cohort project (SADDD suppression demo): ${projectPlans[2].code} (${projectPlans[2].beneficiaryCount} beneficiaries)`,
    )
    if (createdCredentials.length) {
      console.info(
        `\n${createdCredentials.length} new staff password(s) written to .tmp/hosted-seed/credentials-*.json (not printed).`,
      )
    }
  } finally {
    await Promise.all([prisma.$disconnect(), runtime.$disconnect()])
  }
}

function addDaysIsoFromYears(iso: string, years: number) {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  return date.toISOString().slice(0, 10)
}

/** Pure beneficiary registration plan for one row: no I/O, deterministic on (plan, index),
 * so idempotency and data-validity are directly testable without a database. */
function planBeneficiaryRegistration(
  plan: ProjectPlan,
  projectIndex: number,
  index: number,
  formId: string,
) {
  const isFemale = index % 2 === 0
  const firstName = isFemale
    ? pick(filipinoFirstNamesFemale, index)
    : pick(filipinoFirstNamesMale, index)
  const lastName = pick(filipinoLastNames, index * 7 + projectIndex)
  const code = `BEN-${plan.code}-${String(index + 1).padStart(3, '0')}`
  // Age spread from 5 through 70, none under 5 and no future date.
  const age = 5 + ((index * 11 + projectIndex * 5) % 66)
  const enrollmentDate = addDaysIso(plan.startDate, Math.min(30 + index * 2, 300))
  const birthDate = addDaysIsoFromYears(enrollmentDate, -age)
  const isMinor = age < 18
  const disabilityStatus = index % 9 === 0 ? 'WITH_DISABILITY' : 'NOT_SPECIFIED'
  const barangay = pick(plan.barangays, index)
  const clientRegistrationId = stableUuid(`beneficiary-register:${plan.code}:${code}`)
  const registerDto: RegisterBeneficiaryDto = {
    formId,
    clientRegistrationId,
    values: {
      registration_operation: 'CREATE',
      beneficiary_code: code,
      subject_type: 'INDIVIDUAL',
      first_name: firstName,
      last_name: lastName,
      sex: isFemale ? 'FEMALE' : 'MALE',
      birth_date: birthDate,
      disability_status: disabilityStatus,
      location_barangay: barangay,
      location_city_municipality: plan.cityMunicipality,
      location_province: plan.province,
      consent_recorded: true,
      data_processing_consent_recorded: true,
      is_minor: isMinor,
      guardian_consent_recorded: isMinor,
      enrollment_date: enrollmentDate,
    },
  }
  return { code, age, birthDate, enrollmentDate, registerDto }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : 'Hosted realistic seed failed.')
    process.exitCode = 1
  })
}

export {
  assertGuardedTarget,
  stableUuid,
  staffEmail,
  dummyStaff,
  projectPlans,
  planBeneficiaryRegistration,
  SYSTEM_ADMIN_EMAIL,
}
