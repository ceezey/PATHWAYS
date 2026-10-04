import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import { PrismaService } from '@app/prisma/prisma.service'
import { ConflictException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ActivityExtensionsService } from './activity-extensions.service'

const enabled = process.env.PATHWAYS_ACTIVITY_EXTENSIONS_LOCAL_TESTS === '1'
const replayPort = Number(process.env.PATHWAYS_REPLAY_PORT)
if (enabled && !replayPort) throw new Error('PATHWAYS_REPLAY_PORT is required')
const id = (number: number) => `a9610000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const projectId = id(2)
const activityId = id(3)
const people = [
  { n: 1, role: 'PROJECT_OFFICER', name: 'Extension officer' },
  { n: 2, role: 'MONITORING_AND_EVALUATION_OFFICER', name: 'Extension M&E' },
  { n: 3, role: 'PROJECT_MANAGER', name: 'Extension manager' },
] as const
const identity = (n: number): ApplicationIdentity => ({
  id: id(200 + n),
  aal: 'aal2',
  organizationId,
  userId: id(100 + n),
  fullName: 'Synthetic',
  roles: [],
  permissions: [],
  assignedProjectIds: [projectId],
})

describe.skipIf(!enabled)('activity extension workflow on disposable PostgreSQL', () => {
  it('requests, verifies and approves, moving the planned end date once', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = String(replayPort)
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
    const rollback = new Error('Activity extension synthetic fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = ${replayPort}
          AND current_user = 'postgres'
          AND session_user = 'postgres'
          AND to_regclass('pathways.activity_extension_requests') IS NOT NULL AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (tx) => {
            // Seed as superuser without the runtime-only source-proof triggers.
            await tx.$executeRaw`SET LOCAL session_replication_role = replica`
            await tx.organization.create({
              data: { id: organizationId, code: 'EXT_LOCAL', name: 'Extension local organization' },
            })
            for (const person of people) {
              await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${id(200 + person.n)}::uuid)`
              const role = await tx.role.findUniqueOrThrow({ where: { code: person.role } })
              await tx.systemUser.create({
                data: {
                  id: id(100 + person.n),
                  organizationId,
                  roleId: role.id,
                  authUserId: id(200 + person.n),
                  fullName: person.name,
                  email: `extension-${person.n}@example.invalid`,
                  accountStatus: 'ACTIVE',
                  invitedAt: new Date('2026-09-01T00:00:00.000Z'),
                  activatedAt: new Date('2026-09-01T00:00:00.000Z'),
                },
              })
            }
            await tx.project.create({
              data: {
                id: projectId,
                organizationId,
                code: 'EXT-LOCAL',
                title: 'Extension project',
                startDate: new Date('2026-01-01T00:00:00.000Z'),
                endDate: new Date('2026-12-31T00:00:00.000Z'),
                createdById: id(103),
              },
            })
            for (const person of people) {
              await tx.userProjectAssignment.create({
                data: {
                  id: id(300 + person.n),
                  organizationId,
                  projectId,
                  userId: id(100 + person.n),
                  assignedById: id(103),
                },
              })
            }
            await tx.projectActivity.create({
              data: {
                id: activityId,
                organizationId,
                projectId,
                code: 'EXT-ACT',
                title: 'Extension activity',
                plannedStartDate: new Date('2026-09-01T00:00:00.000Z'),
                plannedEndDate: new Date('2026-11-30T00:00:00.000Z'),
                status: 'IN_PROGRESS',
                createdById: id(103),
              },
            })
            await tx.projectActivityAssignment.create({
              data: {
                organizationId,
                projectId,
                activityId,
                projectAssignmentId: id(301),
                assignedById: id(103),
              },
            })
            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
            })
            const service = new ActivityExtensionsService(scoped)
            await tx.$executeRaw`SET LOCAL session_replication_role = origin`
            // The rule source functions require the runtime session, not only the runtime role.
            await tx.$executeRaw`SET LOCAL SESSION AUTHORIZATION pathways_runtime`

            const requested = await service.request(identity(1), projectId, activityId, {
              clientMutationId: id(901),
              requestedEndDate: '2026-12-20',
              reason: 'Rains delayed the delivery partner.',
            })
            const verified = await service.verify(
              identity(2),
              projectId,
              activityId,
              requested.id,
              {
                decision: 'VERIFY',
                note: 'Checked against the work plan.',
                expectedUpdatedAt: requested.updatedAt,
              },
            )
            const [activity] = await tx.$queryRaw<Array<{ updated_at: Date }>>`
              SELECT updated_at FROM pathways.project_activities WHERE id=${activityId}::uuid`
            const approved = await service.decide(
              identity(3),
              projectId,
              activityId,
              requested.id,
              {
                clientMutationId: id(902),
                decision: 'APPROVE',
                note: 'Approved after review.',
                expectedUpdatedAt: verified.updatedAt,
                activityExpectedUpdatedAt: (activity?.updated_at as Date).toISOString(),
              },
            )
            expect(approved.status).toBe('APPROVED')
            await expect(
              service.decide(identity(3), projectId, activityId, requested.id, {
                clientMutationId: id(903),
                decision: 'APPROVE',
                note: 'Approved a second time.',
                expectedUpdatedAt: approved.updatedAt,
                activityExpectedUpdatedAt: new Date().toISOString(),
              }),
            ).rejects.toBeInstanceOf(ConflictException)

            await tx.$executeRaw`RESET SESSION AUTHORIZATION`
            const [moved] = await tx.$queryRaw<Array<{ planned_end_date: Date }>>`
              SELECT planned_end_date FROM pathways.project_activities WHERE id=${activityId}::uuid`
            expect(moved?.planned_end_date.toISOString().slice(0, 10)).toBe('2026-12-20')
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
