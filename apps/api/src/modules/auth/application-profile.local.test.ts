import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { PrismaService } from '../../prisma/prisma.service'
import { ApplicationProfileService } from './application-profile.service'

// Explicit opt-in only. This harness NEVER reads DATABASE_URL, DIRECT_URL,
// an environment file, a password, or a hosted connection setting.
const enabled = process.env.PATHWAYS_MFA_LOCAL_DB_TESTS === '1'
const fixtureId = (number: number) => `a5000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const orgA = fixtureId(1)
const orgB = fixtureId(2)
const roleId = fixtureId(3)
const userA = fixtureId(10)
const userB = fixtureId(11)
const invitedUser = fixtureId(12)
const unlinkedUser = fixtureId(13)
const subjectA = fixtureId(20)
const subjectB = fixtureId(21)
const invitedSubject = fixtureId(22)

async function counts(client: PrismaService) {
  return client.$queryRaw<Array<{ target: string; count: bigint }>>`
    SELECT 'auth.users' AS target, count(*) FROM auth.users
    UNION ALL SELECT 'organizations', count(*) FROM pathways.organizations
    UNION ALL SELECT 'roles', count(*) FROM pathways.roles
    UNION ALL SELECT 'permissions', count(*) FROM pathways.permissions
    UNION ALL SELECT 'role_permissions', count(*) FROM pathways.role_permissions
    UNION ALL SELECT 'system_users', count(*) FROM pathways.system_users
    UNION ALL SELECT 'projects', count(*) FROM pathways.projects
    UNION ALL SELECT 'user_project_assignments', count(*) FROM pathways.user_project_assignments
    ORDER BY target
  `
}

async function fixtures(transaction: Prisma.TransactionClient) {
  await transaction.$executeRaw`
    INSERT INTO auth.users(id) VALUES
      (${subjectA}::uuid), (${subjectB}::uuid), (${invitedSubject}::uuid)
  `
  await transaction.organization.createMany({
    data: [
      { id: orgA, code: 'MFA_SYNTHETIC_A', name: 'Synthetic local MFA organization A' },
      { id: orgB, code: 'MFA_SYNTHETIC_B', name: 'Synthetic local MFA organization B' },
    ],
  })
  await transaction.role.create({
    data: { id: roleId, code: 'PROJECT_OFFICER', name: 'Synthetic local MFA role' },
  })
  await transaction.permission.createMany({
    data: [
      { id: fixtureId(30), code: 'MFA_SYNTHETIC_READ', name: 'Synthetic active permission' },
      {
        id: fixtureId(31),
        code: 'MFA_SYNTHETIC_INACTIVE',
        name: 'Synthetic inactive permission',
        isActive: false,
      },
      { id: fixtureId(32), code: 'MFA_SYNTHETIC_UNMAPPED', name: 'Synthetic unmapped permission' },
    ],
  })
  await transaction.rolePermission.createMany({
    data: [
      { roleId, permissionId: fixtureId(30) },
      { roleId, permissionId: fixtureId(31) },
    ],
  })
  const yesterday = new Date(Date.now() - 86_400_000)
  const earlier = new Date(Date.now() - 172_800_000)
  await transaction.systemUser.createMany({
    data: [
      { id: userA, organizationId: orgA, authUserId: subjectA, fullName: 'Synthetic local A' },
      { id: userB, organizationId: orgB, authUserId: subjectB, fullName: 'Synthetic local B' },
      { id: unlinkedUser, organizationId: orgA, authUserId: null, fullName: 'Synthetic unlinked' },
    ].map((entry, index) => ({
      ...entry,
      roleId,
      email: `mfa-synthetic-${index}@example.invalid`,
      accountStatus: 'ACTIVE',
      invitedAt: earlier,
      activatedAt: yesterday,
    })),
  })
  await transaction.systemUser.create({
    data: {
      id: invitedUser,
      organizationId: orgA,
      roleId,
      authUserId: invitedSubject,
      fullName: 'Synthetic invited local user',
      email: 'mfa-synthetic-invited@example.invalid',
      accountStatus: 'INVITED',
    },
  })
  await transaction.project.createMany({
    data: [
      { id: fixtureId(100), organizationId: orgA, code: 'MFA_ACTIVE', title: 'Synthetic active' },
      { id: fixtureId(101), organizationId: orgA, code: 'MFA_ENDED', title: 'Synthetic ended' },
      { id: fixtureId(102), organizationId: orgA, code: 'MFA_FUTURE', title: 'Synthetic future' },
      {
        id: fixtureId(103),
        organizationId: orgA,
        code: 'MFA_ARCHIVED',
        title: 'Synthetic archived',
        archivedAt: yesterday,
      },
      {
        id: fixtureId(104),
        organizationId: orgB,
        code: 'MFA_OTHER',
        title: 'Synthetic other scope',
      },
      { id: fixtureId(105), organizationId: orgA, code: 'MFA_NONE', title: 'Synthetic unassigned' },
    ],
  })
  await transaction.userProjectAssignment.createMany({
    data: [100, 101, 102, 103, 104].map((number) => ({
      id: fixtureId(number + 100),
      organizationId: number === 104 ? orgB : orgA,
      projectId: fixtureId(number),
      userId: number === 104 ? userB : userA,
      assignedById: number === 104 ? userB : userA,
      assignedAt: number === 102 ? new Date(Date.now() + 86_400_000) : earlier,
      status: number === 101 ? 'ENDED' : 'ACTIVE',
      endedAt: number === 101 ? yesterday : null,
      endReason: number === 101 ? 'Synthetic ended assignment' : null,
    })),
  })
}

describe.skipIf(!enabled)(
  'ApplicationProfileService with immutable 0005 RLS on disposable local DB',
  () => {
    it('resolves real runtime-scoped profiles, denies invalid contexts, and rolls back all fixtures', async () => {
      const localUrl = new URL('postgresql://127.0.0.1')
      localUrl.username = 'postgres'
      localUrl.port = '55439'
      localUrl.pathname = '/pathways_phase4_replay'
      localUrl.searchParams.set('schema', 'public')
      localUrl.searchParams.set('connection_limit', '1')
      localUrl.searchParams.set('connect_timeout', '5')
      const client = new PrismaService({ datasources: { db: { url: localUrl.toString() } } })
      const rollback = new Error('Synthetic local MFA fixture rollback')
      try {
        // Guard before every insert. A loopback URL alone is not sufficient proof.
        const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_replay'
          AND inet_server_addr() = '127.0.0.1'::inet
          AND inet_server_port() = 55439
          AND current_user = 'postgres' AND session_user = 'postgres'
          AND (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
          AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'pathways' AND c.relkind = 'r') = 39
          AND EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'pathways' AND p.proname = 'runtime_context_organization')
          AS safe
      `
        expect(guard?.safe).toBe(true)
        const baseline = await counts(client)
        let completed = false
        try {
          await client.$transaction(
            async (transaction) => {
              await fixtures(transaction)
              // Test-only transaction adapter: execute the real withVerifiedContext
              // implementation in the already-open rollback transaction. Production
              // code and PrismaService startup checks are not modified or bypassed.
              const scoped = Object.create(PrismaService.prototype) as PrismaService
              Object.defineProperty(scoped, '$transaction', {
                value: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                  work(transaction),
              })
              const service = new ApplicationProfileService(scoped)
              await transaction.$executeRaw`SET LOCAL ROLE pathways_runtime`
              const [runtime] = await transaction.$queryRaw<Array<{ safe: boolean }>>`
              SELECT current_user = 'pathways_runtime'
                AND NOT r.rolsuper AND NOT r.rolbypassrls AS safe
              FROM pg_roles r WHERE r.rolname = current_user
            `
              expect(runtime.safe).toBe(true)
              await expect(service.resolve(subjectA, orgA, userA)).resolves.toEqual({
                id: subjectA,
                aal: 'aal2',
                userId: userA,
                organizationId: orgA,
                organizationName: 'Synthetic local MFA organization A',
                fullName: 'Synthetic local A',
                roles: ['PROJECT_OFFICER'],
                permissions: [],
                assignedProjectIds: [fixtureId(100)],
              })
              await expect(service.resolve(subjectB, orgB, userB)).resolves.toMatchObject({
                organizationId: orgB,
                assignedProjectIds: [fixtureId(104)],
              })
              for (const [subject, organization, user] of [
                [subjectB, orgA, userA],
                [subjectA, orgB, userA],
                [subjectA, orgB, userB],
                [subjectA, orgA, unlinkedUser],
                [invitedSubject, orgA, invitedUser],
                [fixtureId(999), orgA, userA],
                [subjectA, orgA, fixtureId(999)],
                ['not-a-uuid', orgA, userA],
              ]) {
                await expect(service.resolve(subject, organization, user)).rejects.toThrow(
                  /Application access is unavailable|A provisioned application context is required/,
                )
              }

              // Inactivation must take effect on the next resolution, without
              // depending on a cached token, role claim, or previous good context.
              await transaction.$executeRaw`SET LOCAL ROLE postgres`
              await transaction.role.update({ where: { id: roleId }, data: { isActive: false } })
              await transaction.$executeRaw`SET LOCAL ROLE pathways_runtime`
              await expect(service.resolve(subjectA, orgA, userA)).rejects.toThrow(
                'Application access is unavailable for this identity and context.',
              )
              await transaction.$executeRaw`SET LOCAL ROLE postgres`
              await transaction.role.update({ where: { id: roleId }, data: { isActive: true } })
              await transaction.organization.update({
                where: { id: orgA },
                data: { status: 'INACTIVE' },
              })
              await transaction.$executeRaw`SET LOCAL ROLE pathways_runtime`
              await expect(service.resolve(subjectA, orgA, userA)).rejects.toThrow(
                'Application access is unavailable for this identity and context.',
              )
              completed = true
              throw rollback
            },
            { timeout: 60_000 },
          )
        } catch (error) {
          if (error !== rollback) throw error
        } finally {
          // Even a failed expectation is a transaction rollback, never cleanup DML.
          expect(await counts(client)).toEqual(baseline)
        }
        expect(completed).toBe(true)
      } finally {
        await client.$disconnect()
      }
    }, 75_000)
  },
)
