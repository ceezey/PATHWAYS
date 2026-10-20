import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { PrismaService } from '@app/prisma/prisma.service'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ActivityEscalationsService } from './activity-escalations.service'

const enabled = process.env.PATHWAYS_ACTIVITY_ESCALATIONS_LOCAL_TESTS === '1'
const replayPort = Number(process.env.PATHWAYS_REPLAY_PORT)
if (enabled && !replayPort) throw new Error('PATHWAYS_REPLAY_PORT is required')
const id = (number: number) => `a9700000-0000-4000-8000-${String(number).padStart(12, '0')}`
const organizationId = id(1)
const projectId = id(2)
const otherProjectId = id(3)
const activityId = id(4)
const programId = id(5)
const otherProgramId = id(6)
const people = [
  { n: 1, role: 'PROJECT_OFFICER', name: 'Escalation officer' },
  { n: 2, role: 'PROJECT_MANAGER', name: 'Escalation manager' },
  { n: 3, role: 'PROJECT_MANAGER', name: 'Escalation outside manager' },
  { n: 4, role: 'PROGRAM_MANAGER', name: 'Escalation program manager' },
  { n: 5, role: 'SYSTEM_ADMINISTRATOR', name: 'Escalation administrator' },
  { n: 6, role: 'PROGRAM_MANAGER', name: 'Escalation outside program manager' },
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
const note = 'A decision note of enough length.'

describe.skipIf(!enabled)('activity escalation workflow on disposable PostgreSQL', () => {
  it('denies out-of-tier actors and runs raise, forward, program-resolve with the activity unchanged', async () => {
    const localUrl = new URL('postgresql://127.0.0.1')
    localUrl.username = 'postgres'
    localUrl.port = String(replayPort)
    localUrl.pathname = '/pathways_phase4_phase6_replay'
    localUrl.searchParams.set('schema', 'public')
    localUrl.searchParams.set('connection_limit', '1')
    localUrl.searchParams.set('connect_timeout', '5')
    const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
    const rollback = new Error('Activity escalation synthetic fixture rollback')
    let completed = false

    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_phase6_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = ${replayPort}
          AND current_user = 'postgres'
          AND session_user = 'postgres'
          AND to_regclass('pathways.activity_escalations') IS NOT NULL AS safe
      `
      expect(guard?.safe).toBe(true)

      try {
        await client.$transaction(
          async (tx) => {
            // Seed as superuser without the runtime-only source-proof triggers.
            await tx.$executeRaw`SET LOCAL session_replication_role = replica`
            await tx.organization.create({
              data: {
                id: organizationId,
                code: 'ESC_LOCAL',
                name: 'Escalation local organization',
              },
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
                  email: `escalation-${person.n}@example.invalid`,
                  accountStatus: 'ACTIVE',
                  invitedAt: new Date('2026-09-01T00:00:00.000Z'),
                  activatedAt: new Date('2026-09-01T00:00:00.000Z'),
                },
              })
            }
            for (const [programKey, code, manager] of [
              [programId, 'ESC-PRG', 4],
              [otherProgramId, 'ESC-PRG-OTHER', 6],
            ] as const)
              await tx.program.create({
                data: {
                  id: programKey,
                  organizationId,
                  code,
                  name: `Escalation program ${code}`,
                  managerUserId: id(100 + manager),
                },
              })
            for (const [key, code, program] of [
              [projectId, 'ESC-LOCAL', programId],
              [otherProjectId, 'ESC-OTHER', otherProgramId],
            ] as const)
              await tx.project.create({
                data: {
                  id: key,
                  organizationId,
                  programId: program,
                  code,
                  title: `Escalation project ${code}`,
                  startDate: new Date('2026-01-01T00:00:00.000Z'),
                  endDate: new Date('2026-12-31T00:00:00.000Z'),
                  createdById: id(105),
                },
              })
            for (const [n, project] of [
              [1, projectId],
              [2, projectId],
              [3, otherProjectId],
            ] as const)
              await tx.userProjectAssignment.create({
                data: {
                  id: id(300 + n),
                  organizationId,
                  projectId: project,
                  userId: id(100 + n),
                  assignedById: id(105),
                },
              })
            await tx.projectActivity.create({
              data: {
                id: activityId,
                organizationId,
                projectId,
                code: 'ESC-ACT',
                title: 'Escalation activity',
                plannedStartDate: new Date('2026-09-01T00:00:00.000Z'),
                plannedEndDate: new Date('2026-11-30T00:00:00.000Z'),
                actualStartDate: new Date('2026-09-01T00:00:00.000Z'),
                status: 'IN_PROGRESS',
                createdById: id(105),
              },
            })
            await tx.projectActivityAssignment.create({
              data: {
                organizationId,
                projectId,
                activityId,
                projectAssignmentId: id(301),
                assignedById: id(105),
              },
            })
            const snapshot = async () =>
              (
                await tx.$queryRaw<Array<{ row: unknown }>>`
                  SELECT to_jsonb(a) AS row FROM pathways.project_activities a WHERE a.id=${activityId}::uuid`
              )[0]?.row
            const before = await snapshot()

            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (inner: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
            })
            const service = new ActivityEscalationsService(scoped)
            await tx.$executeRaw`SET LOCAL session_replication_role = origin`
            await tx.$executeRaw`SET LOCAL SESSION AUTHORIZATION pathways_runtime`

            const raised = await service.raise(identity(1), projectId, activityId, {
              clientMutationId: id(901),
              reason: 'The partner cannot deliver on the planned date.',
            })
            expect(raised.status).toBe('OPEN')
            const decision = (updatedAt: string) => ({ note, expectedUpdatedAt: updatedAt })

            // A Project Manager on another project cannot reach the activity.
            await expect(
              service.forward(
                identity(3),
                projectId,
                activityId,
                raised.id,
                decision(raised.updatedAt),
              ),
            ).rejects.toBeInstanceOf(NotFoundException)
            // A System Administrator is refused at forward and project-level resolve.
            for (const step of ['forward', 'resolve'] as const)
              await expect(
                service[step](
                  identity(5),
                  projectId,
                  activityId,
                  raised.id,
                  decision(raised.updatedAt),
                ),
              ).rejects.toBeInstanceOf(ForbiddenException)

            const forwarded = await service.forward(
              identity(2),
              projectId,
              activityId,
              raised.id,
              decision(raised.updatedAt),
            )
            expect(forwarded).toMatchObject({ status: 'FORWARDED', forwardNote: note })

            // A Program Manager outside the managed program cannot reach the activity.
            await expect(
              service.programResolve(
                identity(6),
                projectId,
                activityId,
                raised.id,
                decision(forwarded.updatedAt),
              ),
            ).rejects.toBeInstanceOf(NotFoundException)

            const resolved = await service.programResolve(
              identity(4),
              projectId,
              activityId,
              raised.id,
              decision(forwarded.updatedAt),
            )
            expect(resolved).toMatchObject({
              status: 'RESOLVED',
              resolutionLevel: 'PROGRAM',
              raisedBy: { id: id(101) },
              forwardedBy: { id: id(102) },
              resolvedBy: { id: id(104) },
            })
            const listed = await service.list(identity(4), projectId, activityId)
            expect(listed.map((row) => row.status)).toEqual(['RESOLVED'])

            await tx.$executeRaw`RESET SESSION AUTHORIZATION`
            expect(await snapshot()).toEqual(before)
            const [audit] = await tx.$queryRaw<Array<{ actions: string[] }>>`
              SELECT array_agg(action ORDER BY occurred_at, action) AS actions FROM pathways.audit_logs
              WHERE entity_type='ActivityEscalation' AND organization_id=${organizationId}::uuid`
            expect([...(audit?.actions ?? [])].sort()).toEqual([
              'ACTIVITY_ESCALATION_FORWARDED',
              'ACTIVITY_ESCALATION_RAISED',
              'ACTIVITY_ESCALATION_RESOLVED',
            ])
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
