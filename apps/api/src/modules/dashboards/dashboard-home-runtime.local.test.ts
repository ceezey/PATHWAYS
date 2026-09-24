import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { IndicatorsService } from '@app/modules/indicators/indicators.service'
import { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { DashboardsService } from './dashboards.service'

const enabled = process.env.PATHWAYS_DASHBOARD_HOME_SCOPE_LOCAL_TESTS === '1'
const id = (number: number) => `a9240000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const authSubject = id(2)
const userId = id(3)
const projectId = id(4)
const actor: ApplicationIdentity = {
  id: authSubject,
  aal: 'aal2',
  organizationId,
  userId,
  fullName: 'Dashboard home Project Officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['projects.read'],
  assignedProjectIds: [projectId],
}

describe.skipIf(!enabled)('dashboard home on disposable PostgreSQL', () => {
  it('allows projects.read without granting analytics.read', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = '55448'
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
    const rollback = new Error('Dashboard home synthetic fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = 55448
          AND current_user = 'postgres'
          AND session_user = 'postgres'
          AND to_regprocedure(
            'pathways.p06_home_dashboard(uuid,uuid[],date,date,text)'
          ) IS NOT NULL AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (tx) => {
            const role = await tx.role.create({
              data: { id: id(10), code: 'PROJECT_OFFICER', name: 'Project Officer' },
              select: { id: true },
            })
            const permission = await tx.permission.upsert({
              where: { code: 'projects.read' },
              create: { id: id(11), code: 'projects.read', name: 'projects.read' },
              update: { name: 'projects.read', isActive: true },
              select: { id: true },
            })
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: permission.id },
            })
            await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${authSubject}::uuid)`
            await tx.organization.create({
              data: {
                id: organizationId,
                code: 'DASH_HOME_LOCAL',
                name: 'Dashboard home local organization',
              },
            })
            await tx.systemUser.create({
              data: {
                id: userId,
                organizationId,
                roleId: role.id,
                authUserId: authSubject,
                fullName: actor.fullName,
                email: 'dashboard-home@example.invalid',
                accountStatus: 'ACTIVE',
                invitedAt: new Date('2026-09-01T00:00:00.000Z'),
                activatedAt: new Date('2026-09-01T00:00:00.000Z'),
              },
            })
            await tx.project.create({
              data: {
                id: projectId,
                organizationId,
                code: 'DASH-HOME',
                title: 'Dashboard home project',
                startDate: new Date('2026-01-01T00:00:00.000Z'),
                endDate: new Date('2026-12-31T00:00:00.000Z'),
                createdById: userId,
              },
            })
            await tx.userProjectAssignment.create({
              data: { id: id(5), organizationId, projectId, userId, assignedById: userId },
            })
            await tx.projectActivity.create({
              data: {
                id: id(6),
                organizationId,
                projectId,
                code: 'DASH-ACT',
                title: 'Dashboard activity',
                plannedStartDate: new Date('2026-09-01T00:00:00.000Z'),
                plannedEndDate: new Date('2026-09-30T00:00:00.000Z'),
                status: 'NOT_STARTED',
                createdById: userId,
              },
            })

            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
            })
            const dashboards = new DashboardsService(scoped, {} as IndicatorsService)
            await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`

            const home = await dashboards.home(actor, {
              projectId,
              periodStart: '2026-09-01',
              periodEnd: '2026-09-30',
            })
            expect(home.activities.find((item) => item.key === 'NOT_STARTED')?.metric.value).toBe(
              '1',
            )
            expect(home.participationRecords).toMatchObject({
              state: 'MISSING',
              value: null,
              reason: 'SENSITIVE_RELEASE_NOT_ENABLED_V1',
            })
            await expect(
              dashboards.monitoring(actor, {
                projectId,
                periodStart: '2026-09-01',
                periodEnd: '2026-09-30',
              }),
            ).rejects.toBeInstanceOf(ForbiddenException)
            completed = true
            throw rollback
          },
          { timeout: 30_000 },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      expect(completed).toBe(true)
    } finally {
      await client.$disconnect()
    }
  }, 45_000)
})
