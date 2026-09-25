import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { BeneficiaryListQueryDto } from '@app/modules/beneficiaries/beneficiaries.dto'
import { BeneficiariesService } from '@app/modules/beneficiaries/beneficiaries.service'
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import { PrismaService } from '@app/prisma/prisma.service'
import { BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { DashboardsService } from './dashboards.service'

const enabled = process.env.PATHWAYS_C8_LOCAL_TESTS === '1'
const expectedPathwaysTableCount =
  process.env.PATHWAYS_PROJECT_ACTIVITY_CREATION_LOCAL_TESTS === '1' ? 46 : 45
const id = (number: number) => `a5800000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const authSubject = id(2)
const userId = id(3)
const projectId = id(4)
const beneficiaryId = id(5)
const actor: ApplicationIdentity = {
  id: authSubject,
  aal: 'aal2',
  organizationId,
  userId,
  fullName: 'Synthetic C8 local reader',
  roles: ['PROJECT_MANAGER'],
  permissions: [
    'analytics.read',
    'beneficiaries.aggregates.read',
    'beneficiaries.records.read',
    'beneficiaries.records.register',
    'beneficiaries.enrollments.manage',
  ],
  assignedProjectIds: [projectId],
}

describe.skipIf(!enabled)('C8 service path on disposable PostgreSQL', () => {
  it('uses real authorization, RLS, Prisma filters and the protected SQL release', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = '55448'
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
    const rollback = new Error('C8 synthetic fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = 55448
          AND current_user = 'postgres' AND session_user = 'postgres'
          AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='pathways' AND c.relkind='r') = ${expectedPathwaysTableCount} AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (tx) => {
            const role = await tx.role.upsert({
              where: { code: 'PROJECT_MANAGER' },
              create: { id: id(10), code: 'PROJECT_MANAGER', name: 'Project Manager' },
              update: { name: 'Project Manager', isActive: true },
              select: { id: true },
            })
            for (const [number, code] of [
              [11, 'analytics.read'],
              [12, 'beneficiaries.aggregates.read'],
              [13, 'beneficiaries.records.read'],
              [14, 'beneficiaries.records.register'],
              [15, 'beneficiaries.enrollments.manage'],
            ] as const) {
              const permission = await tx.permission.upsert({
                where: { code },
                create: { id: id(number), code, name: code },
                update: { name: code, isActive: true },
                select: { id: true },
              })
              await tx.rolePermission.createMany({
                data: [{ roleId: role.id, permissionId: permission.id }],
                skipDuplicates: true,
              })
            }
            await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${authSubject}::uuid)`
            await tx.organization.create({
              data: {
                id: organizationId,
                code: 'C8_LOCAL',
                name: 'Synthetic C8 local organization',
              },
            })
            await tx.systemUser.create({
              data: {
                id: userId,
                organizationId,
                roleId: role.id,
                authUserId: authSubject,
                fullName: actor.fullName,
                email: 'c8-local@example.invalid',
                accountStatus: 'ACTIVE',
                invitedAt: new Date('2026-09-01T00:00:00.000Z'),
                activatedAt: new Date('2026-09-01T00:00:00.000Z'),
              },
            })
            await tx.project.create({
              data: {
                id: projectId,
                organizationId,
                code: 'C8-LOCAL',
                title: 'Synthetic closed project',
                startDate: new Date('2026-01-01T00:00:00.000Z'),
                endDate: new Date('2026-07-31T00:00:00.000Z'),
                createdById: userId,
              },
            })
            await tx.userProjectAssignment.create({
              data: { id: id(6), organizationId, projectId, userId, assignedById: userId },
            })
            await tx.$queryRaw`
            SELECT set_config('request.jwt.claim.sub', ${authSubject}, true),
              set_config('app.organization_id', ${organizationId}, true),
              set_config('app.user_id', ${userId}, true)
          `
            await tx.beneficiary.create({
              data: {
                id: beneficiaryId,
                organizationId,
                code: 'C8-BEN-1',
                subjectType: 'INDIVIDUAL',
                firstName: 'Synthetic',
                lastName: 'Person',
                sex: 'FEMALE',
                birthDate: new Date('2020-06-30T00:00:00.000Z'),
                disabilityStatus: 'WITH_DISABILITY',
                consentRecorded: true,
                dataProcessingConsentRecorded: true,
                isMinor: true,
                guardianConsentRecorded: true,
                createdById: userId,
              },
            })
            await tx.beneficiaryProjectEnrollment.create({
              data: {
                id: id(7),
                organizationId,
                projectId,
                beneficiaryId,
                enrollmentDate: new Date('2026-01-01T00:00:00.000Z'),
                recordedById: userId,
              },
            })

            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
            })
            const beneficiaries = new BeneficiariesService(scoped)
            const dashboards = new DashboardsService(scoped, {} as IndicatorsService)
            await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`

            const list = (filters: Partial<BeneficiaryListQueryDto>) =>
              beneficiaries.list(actor, projectId, { limit: 25, ...filters })
            const matching = await list({
              sex: 'FEMALE',
              ageBand: '0-9',
              disabilityStatus: 'WITH_DISABILITY',
              enrollmentStatus: 'ACTIVE',
            })
            expect(matching.items.map((row) => row.id)).toEqual([beneficiaryId])
            expect((await list({ ageBand: 'Unknown' })).items).toHaveLength(0)
            expect((await list({ sex: 'MALE' })).items).toHaveLength(0)
            expect((await list({ enrollmentStatus: 'EXITED' })).items).toHaveLength(0)

            const released = await dashboards.saddd(actor, { projectId })
            expect(released.releaseState).toBe('RELEASED')
            expect(released.periodStart).toBe('2026-01-01')
            expect(released.periodEnd).toBe('2026-07-31')
            expect(released.total.state).toBe('SUPPRESSED')
            expect(released.total.value).toBeNull()
            expect((await dashboards.saddd(actor, { projectId })).releaseState).toBe('RELEASED')
            await expect(
              dashboards.saddd(actor, { projectId, sex: 'FEMALE' }),
            ).rejects.toBeInstanceOf(BadRequestException)
            completed = true
            throw rollback
          },
          { timeout: 60_000 },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      expect(completed).toBe(true)
    } finally {
      await client.$disconnect()
    }
  }, 75_000)
})
