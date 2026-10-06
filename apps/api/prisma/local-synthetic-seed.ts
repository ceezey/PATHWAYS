import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import type { CanonicalRole } from '../src/modules/auth/authorization-policy'
import { seedCanonicalReferenceData } from './canonical-seed'
import { approvedOrganization } from './developer-bootstrap'

/** Local-only synthetic workspace: one organization, program and project, and
 * one realistic account per role. No Beneficiary, activity, indicator or other
 * domain data is written. Runs only against the loopback Supabase container.
 */

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

type SeedAccount = {
  role: CanonicalRole
  fullName: string
  email: string
  positionTitle: string
  assigned: boolean
}

const accounts: SeedAccount[] = [
  {
    role: 'SYSTEM_ADMINISTRATOR',
    fullName: 'Cian Francisco',
    email: process.env.PATHWAYS_LOCAL_ADMIN_EMAIL ?? 'cian.francisco@pathways.example',
    positionTitle: 'System Administrator',
    assigned: false,
  },
  {
    role: 'PROGRAM_MANAGER',
    fullName: 'Maria Santos',
    email: 'maria.santos@pathways.example',
    positionTitle: 'Program Manager, Education',
    assigned: false,
  },
  {
    role: 'GRANT_MANAGER',
    fullName: 'Jose Reyes',
    email: 'jose.reyes@pathways.example',
    positionTitle: 'Grant Manager',
    assigned: true,
  },
  {
    role: 'PROJECT_MANAGER',
    fullName: 'Ana Dela Cruz',
    email: 'ana.delacruz@pathways.example',
    positionTitle: 'Project Manager',
    assigned: true,
  },
  {
    role: 'MONITORING_AND_EVALUATION_OFFICER',
    fullName: 'Carlo Mendoza',
    email: 'carlo.mendoza@pathways.example',
    positionTitle: 'Monitoring and Evaluation Officer',
    assigned: true,
  },
  {
    role: 'PROJECT_OFFICER',
    fullName: 'Liza Bautista',
    email: 'liza.bautista@pathways.example',
    positionTitle: 'Project Officer, Borongan',
    assigned: true,
  },
  {
    role: 'PROJECT_OFFICER',
    fullName: 'Emmanuel Cruz',
    email: 'emmanuel.cruz@pathways.example',
    positionTitle: 'Project Officer, Masbate',
    assigned: false,
  },
]

export function assertLoopback(label: string, value: string | undefined) {
  if (!value) throw new Error(`${label} is required.`)
  const { hostname } = new URL(value)
  if (!LOOPBACK.has(hostname))
    throw new Error(`${label} must point at the local Supabase instance.`)
}

function generatePassword() {
  return `Pw-${randomBytes(18).toString('base64url')}`
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL
  const runtimeUrl = process.env.DATABASE_URL
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assertLoopback('DIRECT_URL', databaseUrl)
  assertLoopback('DATABASE_URL', runtimeUrl)
  assertLoopback('SUPABASE_URL', supabaseUrl)
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')

  const supabase = createClient(supabaseUrl as string, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } })

  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
    if (bucketError) throw bucketError
    if (!buckets.some((bucket) => bucket.id === 'pathways-private')) {
      const { error } = await supabase.storage.createBucket('pathways-private', { public: false })
      if (error) throw error
    }

    const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    })
    if (listError) throw listError
    const credentials: {
      role: CanonicalRole
      fullName: string
      email: string
      password?: string
    }[] = []
    const authIds = new Map<string, string>()
    for (const account of accounts) {
      const found = existing.users.find((user) => user.email === account.email)
      if (found) {
        authIds.set(account.email, found.id)
        credentials.push({ role: account.role, fullName: account.fullName, email: account.email })
        continue
      }
      const password = generatePassword()
      const { data, error } = await supabase.auth.admin.createUser({
        email: account.email,
        password,
        email_confirm: true,
      })
      if (error) throw error
      authIds.set(account.email, data.user.id)
      credentials.push({
        role: account.role,
        fullName: account.fullName,
        email: account.email,
        password,
      })
    }

    // Record new passwords before any database write so a failed run never
    // leaves Auth users whose passwords are unknown.
    const created = credentials.filter((entry) => entry.password)
    if (created.length) {
      const outputDir = path.resolve(__dirname, '..', '..', '..', '.tmp', 'local-seed')
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(
        path.join(outputDir, `credentials-${Date.now()}.json`),
        `${JSON.stringify({ supabaseUrl, accounts: created }, null, 2)}
`,
        { mode: 0o600 },
      )
    }

    const seededAt = new Date()
    const workspace = await prisma.$transaction(async (tx) => {
      await seedCanonicalReferenceData(tx)
      const roles = new Map((await tx.role.findMany()).map((role) => [role.code, role.id]))
      const organization =
        (await tx.organization.findUnique({ where: { code: approvedOrganization.code } })) ??
        (await tx.organization.create({
          data: {
            ...approvedOrganization,
            description: 'Plan International Pilipinas country office workspace.',
            contactEmail: 'info@pathways.example',
            address: 'Quezon City, Metro Manila',
          },
        }))

      const users = new Map<CanonicalRole, string>()
      const usersByEmail = new Map<string, string>()
      for (const account of accounts) {
        const authUserId = authIds.get(account.email) as string
        const roleId = roles.get(account.role)
        if (!roleId) throw new Error(`Missing canonical role ${account.role}.`)
        const user = await tx.systemUser.upsert({
          where: { authUserId },
          update: {},
          create: {
            organizationId: organization.id,
            roleId,
            authUserId,
            fullName: account.fullName,
            email: account.email,
            positionTitle: account.positionTitle,
            accountStatus: 'ACTIVE',
            invitedAt: seededAt,
            activatedAt: seededAt,
          },
        })
        if (!users.has(account.role)) users.set(account.role, user.id)
        usersByEmail.set(account.email, user.id)
      }

      const program =
        (await tx.program.findFirst({
          where: { organizationId: organization.id, code: 'EDU-2026' },
        })) ??
        (await tx.program.create({
          data: {
            organizationId: organization.id,
            code: 'EDU-2026',
            name: 'Inclusive Education Program',
            description: 'Keeps girls and boys in safe, inclusive schools in Eastern Visayas.',
            managerUserId: users.get('PROGRAM_MANAGER'),
            startDate: new Date('2026-01-01'),
            endDate: new Date('2028-12-31'),
            status: 'ONGOING',
          },
        }))
      return { organizationId: organization.id, programId: program.id, users, usersByEmail }
    })

    // Projects carry rule-engine source provenance that only the runtime role
    // can write, so the project is created the way the API does it: as the
    // Project Manager, inside a verified runtime context.
    const projectManager = accounts.find((entry) => entry.role === 'PROJECT_MANAGER') as SeedAccount
    const managerUserId = workspace.users.get('PROJECT_MANAGER') as string
    const projectId = await runtime.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('request.jwt.claim.sub', ${authIds.get(projectManager.email)}, true),
          set_config('request.jwt.claims', '', true),
          set_config('app.organization_id', ${workspace.organizationId}, true),
          set_config('app.user_id', ${managerUserId}, true)`
      const project =
        (await tx.project.findFirst({
          where: { organizationId: workspace.organizationId, code: 'SSG-ES-2026' },
        })) ??
        (await tx.project.create({
          data: {
            organizationId: workspace.organizationId,
            programId: workspace.programId,
            code: 'SSG-ES-2026',
            title: 'Safe Schools for Girls – Eastern Samar',
            description:
              'Strengthens school-based protection and learning continuity for adolescent girls in typhoon-affected municipalities of Eastern Samar.',
            objectives:
              'Reduce school dropout among girls aged 12–17 and establish functioning school protection committees.',
            implementationArea: 'Borongan City, Guiuan and Llorente, Eastern Samar',
            sector: 'Education',
            targetBeneficiaries: 160,
            programManagerId: workspace.users.get('PROGRAM_MANAGER'),
            startDate: new Date('2026-03-01'),
            endDate: new Date('2027-08-31'),
            status: 'ONGOING',
            createdById: managerUserId,
          },
        }))
      return project.id
    })

    // Team assignment is administrator authority (assignments.manage).
    const administrator = accounts.find(
      (entry) => entry.role === 'SYSTEM_ADMINISTRATOR',
    ) as SeedAccount
    const administratorUserId = workspace.users.get('SYSTEM_ADMINISTRATOR') as string
    await runtime.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('request.jwt.claim.sub', ${authIds.get(administrator.email)}, true),
          set_config('request.jwt.claims', '', true),
          set_config('app.organization_id', ${workspace.organizationId}, true),
          set_config('app.user_id', ${administratorUserId}, true)`
      for (const account of accounts.filter((entry) => entry.assigned)) {
        const userId = workspace.usersByEmail.get(account.email) as string
        const current = await tx.userProjectAssignment.findFirst({
          where: { projectId, userId, status: 'ACTIVE' },
        })
        if (!current) {
          await tx.userProjectAssignment.create({
            data: {
              organizationId: workspace.organizationId,
              projectId,
              userId,
              assignedById: administratorUserId,
            },
          })
        }
      }
    })

    console.info(
      `Local synthetic seed complete: ${accounts.length} accounts (${created.length} new). New passwords are in .tmp/local-seed/.`,
    )
  } finally {
    await Promise.all([prisma.$disconnect(), runtime.$disconnect()])
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Local synthetic seed failed.')
    process.exitCode = 1
  })
}
