import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { PrismaService } from '../../prisma/prisma.service'
import { ProjectsService } from '../projects/projects.service'
import { rolePermissions } from './authorization-policy'
import type { ApplicationIdentity } from './developer-access'

const enabled = process.env.PATHWAYS_CSV_RBAC_LOCAL_TESTS === '1'
const id = (n: number) => `a9900000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe.skipIf(!enabled)('CSV RBAC API against runtime RLS', () => {
  it('returns only project context to Admin and denies detail and creation before retrieval', async () => {
    const client = new PrismaService({
      datasources: {
        db: {
          url: 'postgresql://postgres@127.0.0.1:55448/pathways_phase4_phase6_replay?schema=public&connection_limit=1',
        },
      },
    })
    const rollback = new Error('Synthetic RBAC rollback')
    let passed = false
    try {
      const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database()='pathways_phase4_phase6_replay' AND inet_server_addr()='127.0.0.1'::inet
        AND inet_server_port()=55448 AND current_user='postgres' AS safe
      `
      expect(guard.safe).toBe(true)
      try {
        await client.$transaction(
          async (tx) => {
            await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${id(2)}::uuid)`
            await tx.organization.create({
              data: { id: id(1), code: 'CSV_RUNTIME', name: 'Synthetic CSV RBAC' },
            })
            const role = await tx.role.findUniqueOrThrow({
              where: { code: 'SYSTEM_ADMINISTRATOR' },
            })
            await tx.systemUser.create({
              data: {
                id: id(3),
                organizationId: id(1),
                roleId: role.id,
                authUserId: id(2),
                fullName: 'Synthetic Admin',
                email: 'rbac-local@example.invalid',
                accountStatus: 'ACTIVE',
                invitedAt: new Date('2026-01-01T00:00:00Z'),
                activatedAt: new Date('2026-01-01T00:00:00Z'),
              },
            })
            await tx.project.create({
              data: {
                id: id(4),
                organizationId: id(1),
                code: 'CSV_CONTEXT',
                title: 'Synthetic project',
                description: 'Private profile text',
                createdById: id(3),
              },
            })
            const scoped = Object.create(PrismaService.prototype) as PrismaService
            Object.defineProperty(scoped, '$transaction', {
              value: (work: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
                work(tx),
            })
            const projects = new ProjectsService(scoped)
            const identity: ApplicationIdentity = {
              id: id(2),
              userId: id(3),
              organizationId: id(1),
              aal: 'aal2',
              fullName: 'Synthetic Admin',
              roles: ['SYSTEM_ADMINISTRATOR'],
              permissions: ['projects.read', 'projects.create'],
              assignedProjectIds: [],
            }
            await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
            expect(await projects.list(identity)).toEqual([
              { id: id(4), code: 'CSV_CONTEXT', title: 'Synthetic project', status: 'PLANNED' },
            ])
            await expect(projects.get(identity, id(4))).rejects.toBeInstanceOf(ForbiddenException)
            await expect(
              projects.create(identity, { title: 'Forbidden project' } as never),
            ).rejects.toBeInstanceOf(ForbiddenException)
            await tx.$executeRaw`RESET ROLE`
            await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${id(5)}::uuid)`
            const managerRole = await tx.role.findUniqueOrThrow({
              where: { code: 'PROJECT_MANAGER' },
            })
            await tx.systemUser.create({
              data: {
                id: id(6),
                organizationId: id(1),
                roleId: managerRole.id,
                authUserId: id(5),
                fullName: 'Synthetic PM',
                email: 'rbac-pm@example.invalid',
                accountStatus: 'ACTIVE',
                invitedAt: new Date('2026-01-01T00:00:00Z'),
                activatedAt: new Date('2026-01-01T00:00:00Z'),
              },
            })
            await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
            const manager: ApplicationIdentity = {
              ...identity,
              id: id(5),
              userId: id(6),
              roles: ['PROJECT_MANAGER'],
              permissions: [...rolePermissions.PROJECT_MANAGER],
            }
            const created = await projects.create(manager, {
              title: 'Synthetic PM project',
              code: 'CSV_PM_CREATE',
              status: 'PLANNED',
              targetGoal: '80',
              targetBeneficiaries: 125,
            })
            expect(created.targetBeneficiaries).toBe(125)
            expect(created.targetGoal).toBe('80')
            expect(created.projectManagerId).toBe(id(6))
            expect((await projects.get(manager, created.id)).id).toBe(created.id)
            passed = true
            throw rollback
          },
          { timeout: 45_000 },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      expect(passed).toBe(true)
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
