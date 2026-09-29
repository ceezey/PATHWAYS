import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { PrismaService } from '../../prisma/prisma.service'
import { ProjectsService } from '../projects/projects.service'
import { rolePermissions } from './authorization-policy'
import type { ApplicationIdentity } from './developer-access'

const enabled = process.env.PATHWAYS_CSV_RBAC_LOCAL_TESTS === '1'
const id = (n: number) => `a9900000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Synthetic prerequisites commit so genuine runtime LOGIN sessions can see them.
// The guarded disposable replay owns their lifetime; no hosted target is accepted.
describe.skipIf(!enabled)('CSV RBAC API against runtime RLS', () => {
  it('uses current Admin detail grants, narrows revoked access and denies forged creation', async () => {
    const admin = new PrismaService({
      datasources: {
        db: {
          url: 'postgresql://postgres@127.0.0.1:55448/pathways_phase4_phase6_replay?schema=public&connection_limit=1&connect_timeout=3&pool_timeout=5',
        },
      },
    })
    const runtime = new PrismaService({
      datasources: {
        db: {
          url: 'postgresql://pathways_runtime@127.0.0.1:55448/pathways_phase4_phase6_replay?schema=public&connection_limit=1&connect_timeout=3&pool_timeout=5',
        },
      },
    })
    try {
      const [guard] = await admin.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database()='pathways_phase4_phase6_replay' AND inet_server_addr()='127.0.0.1'::inet
        AND inet_server_port()=55448 AND current_user='postgres' AND session_user='postgres' AS safe`
      expect(guard.safe).toBe(true)
      const [runtimeGuard] = await runtime.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database()='pathways_phase4_phase6_replay' AND inet_server_addr()='127.0.0.1'::inet
        AND inet_server_port()=55448 AND current_user='pathways_runtime' AND session_user='pathways_runtime'
        AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
        AND NOT r.rolinherit AND NOT r.rolreplication
        AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
        AND NOT has_database_privilege(current_user,current_database(),'CREATE')
        AND NOT has_database_privilege(current_user,current_database(),'TEMPORARY')
        AS safe FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`
      expect(runtimeGuard.safe).toBe(true)
      await admin.$transaction(
        async (tx) => {
          await tx.$executeRaw`INSERT INTO auth.users(id) VALUES (${id(2)}::uuid),(${id(5)}::uuid)`
          await tx.organization.create({
            data: { id: id(1), code: 'CSV_RUNTIME', name: 'Synthetic CSV RBAC' },
          })
          for (const row of [
            {
              userId: id(3),
              subject: id(2),
              role: 'SYSTEM_ADMINISTRATOR',
              name: 'Synthetic Admin',
              email: 'rbac-local@example.invalid',
            },
            {
              userId: id(6),
              subject: id(5),
              role: 'PROJECT_MANAGER',
              name: 'Synthetic PM',
              email: 'rbac-pm@example.invalid',
            },
          ]) {
            const role = await tx.role.findUniqueOrThrow({ where: { code: row.role } })
            await tx.systemUser.create({
              data: {
                id: row.userId,
                organizationId: id(1),
                roleId: role.id,
                authUserId: row.subject,
                fullName: row.name,
                email: row.email,
                accountStatus: 'ACTIVE',
                invitedAt: new Date('2026-01-01T00:00:00Z'),
                activatedAt: new Date('2026-01-01T00:00:00Z'),
              },
            })
          }
        },
        { timeout: 10_000 },
      )
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
      const manager: ApplicationIdentity = {
        ...identity,
        id: id(5),
        userId: id(6),
        fullName: 'Synthetic PM',
        roles: ['PROJECT_MANAGER'],
        permissions: [...rolePermissions.PROJECT_MANAGER],
      }
      const projects = new ProjectsService(runtime)
      const context = await projects.create(manager, {
        code: 'CSV_CONTEXT',
        title: 'Synthetic project',
        description: 'Private profile text',
        status: 'PLANNED',
      })
      const detail = (await projects.list(identity))[0]
      expect(detail).toMatchObject({
        id: context.id,
        code: 'CSV_CONTEXT',
        title: 'Synthetic project',
        status: 'PLANNED',
        description: 'Private profile text',
      })
      expect(detail).not.toHaveProperty('targetGoal')
      expect(await projects.get(identity, context.id)).toMatchObject({
        id: context.id,
        description: 'Private profile text',
      })
      const adminRole = await admin.role.findUniqueOrThrow({
        where: { code: 'SYSTEM_ADMINISTRATOR' },
      })
      const detailPermission = await admin.permission.findUniqueOrThrow({
        where: { code: 'projects.detail.read' },
      })
      const detailGrantKey = { roleId: adminRole.id, permissionId: detailPermission.id }
      // RolePermission has precisely roleId, permissionId and createdAt scalars.
      // Preserve the original timestamp as well as the exact compound identity.
      const detailGrant = await admin.rolePermission.findUniqueOrThrow({
        where: { roleId_permissionId: detailGrantKey },
      })
      const forgedIdentity = {
        ...identity,
        permissions: [...identity.permissions, 'projects.detail.read'],
      }
      let detailGrantWithdrawn = false
      try {
        await admin.rolePermission.delete({ where: { roleId_permissionId: detailGrantKey } })
        detailGrantWithdrawn = true
        expect(await projects.list(forgedIdentity)).toEqual([
          { id: context.id, code: 'CSV_CONTEXT', title: 'Synthetic project', status: 'PLANNED' },
        ])
        await expect(projects.get(forgedIdentity, context.id)).rejects.toBeInstanceOf(
          ForbiddenException,
        )
        await expect(
          projects.create(forgedIdentity, { title: 'Forbidden project' } as never),
        ).rejects.toBeInstanceOf(ForbiddenException)
      } finally {
        if (detailGrantWithdrawn) await admin.rolePermission.create({ data: detailGrant })
      }
      expect(
        await admin.rolePermission.findUniqueOrThrow({
          where: { roleId_permissionId: detailGrantKey },
        }),
      ).toEqual(detailGrant)
      const created = await projects.create(manager, {
        title: 'Synthetic PM project',
        code: 'CSV_PM_CREATE',
        status: 'PLANNED',
        targetBeneficiaries: 125,
      })
      expect(created.targetBeneficiaries).toBe(125)
      expect(created).not.toHaveProperty('targetGoal')
      expect(created.projectManagerId).toBe(id(6))
      expect((await projects.get(manager, created.id)).id).toBe(created.id)
    } finally {
      await Promise.all([runtime.$disconnect(), admin.$disconnect()])
    }
  }, 60_000)
})
