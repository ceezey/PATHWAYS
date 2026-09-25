import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { ProjectsService } from '../projects/projects.service'
import type { StorageService } from '../storage/storage.service'
import { ActivitiesService } from './activities.service'

// Explicit opt-in only. This harness uses one fixed, password-free loopback
// database created and removed by phase6/Replay-Local.ps1.
const enabled = process.env.PATHWAYS_FEATURE_READ_LOCAL_TESTS === '1'
const expectedPathwaysTableCount =
  process.env.PATHWAYS_PROJECT_ACTIVITY_CREATION_LOCAL_TESTS === '1' ? 46 : 45
const id = (number: number) => `a5700000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const authSubject = id(2)
const userId = id(3)
const projectId = id(4)
const assignmentId = id(5)
const activityId = id(6)

const actor: ApplicationIdentity = {
  id: authSubject,
  aal: 'aal2',
  userId,
  organizationId,
  fullName: 'Synthetic local feature reader',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read', 'activities.read'],
  assignedProjectIds: [projectId],
}

describe.skipIf(!enabled)('joined feature reads on disposable PostgreSQL', () => {
  it('uses context, profile, and one scoped feature statement per read under runtime RLS', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = '55448'
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({
      datasources: { db: { url: localUrl.toString() } },
      log: [{ emit: 'event', level: 'query' }],
    })
    const queries: string[] = []
    ;(
      client as unknown as {
        $on(event: 'query', listener: (event: { query: string }) => void): void
      }
    ).$on('query', (event) => queries.push(event.query))
    const rollback = new Error('Synthetic feature-read fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = 55448
          AND current_user = 'postgres' AND session_user = 'postgres'
          AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'pathways' AND c.relkind = 'r') = ${expectedPathwaysTableCount}
          AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (transaction) => {
            const role = await transaction.role.upsert({
              where: { code: 'PROJECT_MANAGER' },
              create: { id: id(19), code: 'PROJECT_MANAGER', name: 'Project Manager' },
              update: { name: 'Project Manager', isActive: true },
              select: { id: true },
            })
            const permissions = await Promise.all(
              [
                { id: id(20), code: 'projects.read', name: 'Read projects' },
                { id: id(21), code: 'activities.read', name: 'Read activities' },
              ].map(({ id: permissionId, code, name }) =>
                transaction.permission.upsert({
                  where: { code },
                  create: { id: permissionId, code, name },
                  update: { name, isActive: true },
                  select: { id: true },
                }),
              ),
            )
            await transaction.rolePermission.createMany({
              data: permissions.map((permission) => ({
                roleId: role.id,
                permissionId: permission.id,
              })),
              skipDuplicates: true,
            })
            await transaction.$executeRaw`INSERT INTO auth.users(id) VALUES (${authSubject}::uuid)`
            await transaction.organization.create({
              data: {
                id: organizationId,
                code: 'R05_JOIN_LOCAL',
                name: 'Synthetic R05 joined-read organization',
              },
            })
            const authorizedAt = new Date('2026-09-20T00:00:00.000Z')
            await transaction.systemUser.create({
              data: {
                id: userId,
                organizationId,
                roleId: role.id,
                authUserId: authSubject,
                fullName: actor.fullName,
                email: 'r05-join-local@example.invalid',
                accountStatus: 'ACTIVE',
                invitedAt: authorizedAt,
                activatedAt: authorizedAt,
              },
            })
            await transaction.project.create({
              data: {
                id: projectId,
                organizationId,
                code: 'R05-JOIN-001',
                title: 'Synthetic joined-read project',
                startDate: new Date('2026-01-01T00:00:00.000Z'),
                endDate: new Date('2026-12-31T00:00:00.000Z'),
                createdById: userId,
              },
            })
            await transaction.userProjectAssignment.create({
              data: {
                id: assignmentId,
                organizationId,
                projectId,
                userId,
                assignedById: userId,
                assignedAt: authorizedAt,
              },
            })
            await transaction.projectActivity.create({
              data: {
                id: activityId,
                organizationId,
                projectId,
                code: 'R05-ACT-001',
                title: 'Synthetic joined-read activity',
                plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
                plannedEndDate: new Date('2026-12-31T00:00:00.000Z'),
                createdById: userId,
              },
            })

            // Test-only adapter reuses the rollback transaction. Production
            // verification, role/permission reads, scope predicates and RLS remain real.
            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                work(transaction),
            })
            const projects = new ProjectsService(scoped)
            const activities = new ActivitiesService(scoped, {} as StorageService)
            await transaction.$executeRaw`SET LOCAL ROLE pathways_runtime`

            queries.length = 0
            await expect(projects.list(actor)).resolves.toHaveLength(1)
            expect(queries).toHaveLength(3)
            expect(queries[2]).toMatch(/user_project_assignments/i)

            queries.length = 0
            await expect(activities.list(actor, projectId)).resolves.toHaveLength(1)
            expect(queries).toHaveLength(3)
            expect(queries[2]).toMatch(/project_activities/i)
            expect(queries[2]).toMatch(/activity_updates/i)

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
