import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ApplicationProfileService } from '../src/modules/auth/application-profile.service'
import { type CanonicalRole, rolePermissions } from '../src/modules/auth/authorization-policy'
import { AuthorizedDataService } from '../src/modules/auth/authorized-data.service'
import { DEVELOPER_AUTH_UUID } from '../src/modules/auth/developer-access'
import { PrismaService } from '../src/prisma/prisma.service'
import { assertCanonicalReferenceData, seedCanonicalReferenceData } from './canonical-seed'
import {
  bootstrapDeveloperAdministrator,
  bootstrapDeveloperOrganization,
  verifyDeveloperBootstrap,
} from './developer-bootstrap'

const enabled = process.env.PATHWAYS_PHASE5_LOCAL_DB_TESTS === '1'
const id = (n: number) => `a5500000-0000-4000-8000-${String(n).padStart(12, '0')}`

async function referenceSnapshot(tx: Prisma.TransactionClient) {
  return {
    roles: await tx.role.findMany({ orderBy: { code: 'asc' } }),
    permissions: await tx.permission.findMany({ orderBy: { code: 'asc' } }),
    mappings: await tx.rolePermission.findMany({
      orderBy: [{ roleId: 'asc' }, { permissionId: 'asc' }],
    }),
  }
}

describe.skipIf(!enabled)(
  'Phase 5 real PostgreSQL seed/bootstrap and runtime authorization',
  () => {
    it('is idempotent, links only the verified UUID, scopes queries, rejects escalation, and rolls back fixtures', async () => {
      // Fixed, password-free, disposable loopback connection. Never reads env URLs.
      const url = new URL('postgresql://127.0.0.1')
      url.username = 'postgres'
      url.port = '55439'
      url.pathname = '/pathways_phase4_replay'
      url.searchParams.set('connection_limit', '1')
      const client = new PrismaService({ datasources: { db: { url: url.toString() } } })
      const rollback = new Error('Phase 5 synthetic fixture rollback')
      let completed = false
      try {
        const [guard] = await client.$queryRaw<Array<{ safe: boolean }>>`
        SELECT current_database() = 'pathways_phase4_replay'
          AND inet_server_addr() = '127.0.0.1'::inet AND inet_server_port() = 55439
          AND current_user = 'postgres' AND session_user = 'postgres'
          AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='pathways' AND c.relkind='r') = 39 AS safe
      `
        expect(guard.safe).toBe(true)
        const before = await referenceSnapshot(client)
        expect(await client.systemUser.count()).toBe(0)
        expect(await client.organization.count()).toBe(0)
        try {
          await client.$transaction(
            async (tx) => {
              await seedCanonicalReferenceData(tx)
              await assertCanonicalReferenceData(tx)
              const firstSeed = await referenceSnapshot(tx)
              const counts = await seedCanonicalReferenceData(tx)
              expect(counts.roles).toBe(6)
              expect(counts.mappings).toBe(
                Object.values(rolePermissions).reduce((sum, codes) => sum + codes.length, 0),
              )
              expect(await referenceSnapshot(tx)).toEqual(firstSeed)
              expect(await tx.organization.count()).toBe(0)
              expect(await tx.systemUser.count()).toBe(0)
              await expect(verifyDeveloperBootstrap(tx)).rejects.toThrow('bootstrap differs')
              const organization = await bootstrapDeveloperOrganization(tx)
              expect(organization).toMatchObject({
                name: 'Plan International Pilipinas',
                code: 'PLAN_PH',
              })
              expect(await bootstrapDeveloperOrganization(tx)).toEqual(organization)
              await tx.$executeRaw`SAVEPOINT phase5_stale_organization`
              await tx.organization.update({
                where: { id: organization.id },
                data: { code: 'Plan International Pilipinas' },
              })
              await expect(bootstrapDeveloperOrganization(tx)).rejects.toThrow(
                'exact approved bootstrap',
              )
              await expect(bootstrapDeveloperAdministrator(tx, true)).rejects.toThrow(
                'completed separately',
              )
              await tx.$executeRaw`ROLLBACK TO SAVEPOINT phase5_stale_organization`
              await tx.$executeRaw`RELEASE SAVEPOINT phase5_stale_organization`
              // Synthetic UUID identity rows only; no live Auth request or password.
              await tx.$executeRaw`
            INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
              (${DEVELOPER_AUTH_UUID}::uuid,'local-designated@example.invalid',now()),
              (${id(20)}::uuid,'local-other@example.invalid',now())
          `
              await expect(bootstrapDeveloperAdministrator(tx, false)).rejects.toThrow(
                'Private password confirmation',
              )
              await expect(bootstrapDeveloperAdministrator(tx, true)).rejects.toThrow(
                'verified MFA precondition',
              )
              expect(await tx.systemUser.count()).toBe(0)
              await tx.$executeRaw`INSERT INTO auth.mfa_factors VALUES (${DEVELOPER_AUTH_UUID}::uuid,'totp','verified')`
              const bootstrap = await bootstrapDeveloperAdministrator(tx, true)
              const firstProfile = await tx.systemUser.findMany()
              expect(await bootstrapDeveloperAdministrator(tx, true)).toEqual(bootstrap)
              expect(await verifyDeveloperBootstrap(tx)).toEqual(bootstrap)
              expect(await tx.systemUser.findMany()).toEqual(firstProfile)
              expect(firstProfile).toHaveLength(1)
              expect(firstProfile[0].authUserId).toBe(DEVELOPER_AUTH_UUID)
              expect(await tx.systemUser.count({ where: { authUserId: id(20) } })).toBe(0)

              const orgA = organization.id
              const orgB = id(2)
              const userA = bootstrap.userId
              const roles = await tx.role.findMany()
              const roleId = (role: CanonicalRole) => {
                const found = roles.find((item) => item.code === role)
                if (!found) throw new Error('Missing fixture role')
                return found.id
              }
              await tx.organization.create({
                data: { id: orgB, code: 'LOCAL_OTHER', name: 'Synthetic other organization' },
              })
              await tx.systemUser.create({
                data: {
                  id: id(21),
                  organizationId: orgB,
                  roleId: roleId('SYSTEM_ADMINISTRATOR'),
                  fullName: 'Synthetic other profile',
                  email: 'local-other@example.invalid',
                  authUserId: id(20),
                  accountStatus: 'ACTIVE',
                  invitedAt: new Date(Date.now() - 86_400_000),
                  activatedAt: new Date(),
                },
              })
              await tx.program.create({
                data: {
                  id: id(50),
                  organizationId: orgA,
                  code: 'LOCAL_PROGRAM',
                  name: 'Synthetic managed program',
                  managerUserId: userA,
                },
              })
              await tx.project.createMany({
                data: [
                  { id: id(100), organizationId: orgA, code: 'LOCAL_ASSIGNED', title: 'Assigned' },
                  {
                    id: id(101),
                    organizationId: orgA,
                    code: 'LOCAL_ENDED',
                    title: 'Ended assignment',
                  },
                  {
                    id: id(102),
                    organizationId: orgA,
                    code: 'LOCAL_FUTURE',
                    title: 'Future assignment',
                  },
                  {
                    id: id(103),
                    organizationId: orgA,
                    code: 'LOCAL_ARCHIVED',
                    title: 'Archived',
                    archivedAt: new Date(),
                  },
                  {
                    id: id(104),
                    organizationId: orgA,
                    code: 'LOCAL_PROGRAM',
                    title: 'Managed program project',
                    programId: id(50),
                  },
                  {
                    id: id(105),
                    organizationId: orgB,
                    code: 'LOCAL_FOREIGN',
                    title: 'Foreign project',
                  },
                ],
              })
              const yesterday = new Date(Date.now() - 86_400_000)
              await tx.userProjectAssignment.createMany({
                data: [100, 101, 102, 103].map((n) => ({
                  id: id(n + 100),
                  organizationId: orgA,
                  projectId: id(n),
                  userId: userA,
                  assignedById: userA,
                  assignedAt: n === 102 ? new Date(Date.now() + 86_400_000) : yesterday,
                  status: n === 101 ? 'ENDED' : 'ACTIVE',
                  endedAt: n === 101 ? new Date() : null,
                  endReason: n === 101 ? 'Synthetic ended' : null,
                })),
              })
              await tx.beneficiary.create({
                data: {
                  id: id(300),
                  organizationId: orgA,
                  code: 'LOCAL_PERSON',
                  firstName: 'Synthetic',
                  lastName: 'Private',
                  isDummyRecord: true,
                },
              })
              await tx.beneficiaryProjectEnrollment.createMany({
                data: [100, 101].map((n) => ({
                  id: id(n + 300),
                  organizationId: orgA,
                  projectId: id(n),
                  beneficiaryId: id(300),
                  enrollmentDate: yesterday,
                  recordedById: userA,
                })),
              })
              // Test adapter reuses the same rollback transaction. Production code and
              // RLS are real; credentials/identity verification are not bypassed live.
              const scoped = Object.create(PrismaService.prototype) as PrismaService
              Object.defineProperty(scoped, '$transaction', {
                value: (work: (t: Prisma.TransactionClient) => Promise<unknown>) => work(tx),
              })
              const profiles = new ApplicationProfileService(scoped)
              const data = new AuthorizedDataService(scoped)
              for (const role of Object.keys(rolePermissions) as CanonicalRole[]) {
                await tx.$executeRaw`SET LOCAL ROLE postgres`
                await tx.systemUser.update({ where: { id: userA }, data: { roleId: roleId(role) } })
                await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
                const profile = await profiles.resolve(DEVELOPER_AUTH_UUID, orgA, userA)
                expect(profile.roles).toEqual([role])
                expect(profile.assignedProjectIds).toEqual([id(100)])
                const projects = await data.projects(profile)
                expect(projects.map((project) => project.id)).toEqual(
                  role === 'SYSTEM_ADMINISTRATOR'
                    ? [100, 101, 102, 104].map(id)
                    : role === 'PROGRAM_MANAGER'
                      ? [100, 104].map(id)
                      : [id(100)],
                )
                await expect(data.beneficiaryAggregate(profile, id(105))).rejects.toThrow(
                  'Project unavailable',
                )
                expect(await data.beneficiaryAggregate(profile, id(100))).toEqual({
                  projectId: id(100),
                  enrollmentCount: 1,
                })
                if (['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(role)) {
                  // Even forged SYSTEM_ADMINISTRATOR fields are replaced by the fresh
                  // database role and permissions in the same scoped transaction.
                  await expect(
                    data.beneficiaries(
                      {
                        ...profile,
                        roles: ['SYSTEM_ADMINISTRATOR'],
                        permissions: ['beneficiaries.records.read'],
                      },
                      id(100),
                    ),
                  ).rejects.toThrow('permission')
                } else {
                  const beneficiaries = await data.beneficiaries(profile, id(100))
                  expect(beneficiaries).toHaveLength(1)
                  expect(beneficiaries[0].projectId).toBe(id(100))
                  expect(beneficiaries[0]).not.toHaveProperty('enrollments')
                }
                if (role !== 'SYSTEM_ADMINISTRATOR') {
                  await expect(data.beneficiaryAggregate(profile, id(101))).rejects.toThrow(
                    'Project unavailable',
                  )
                }
                await expect(data.projects({ ...profile, organizationId: orgB })).rejects.toThrow()
                await expect(profiles.resolve(id(20), orgA, userA)).rejects.toThrow()
                await expect(data.projects({ ...profile, aal: 'aal1' } as never)).rejects.toThrow(
                  'MFA',
                )
              }
              await tx.$executeRaw`SET LOCAL ROLE postgres`
              await tx.systemUser.update({
                where: { id: userA },
                data: { roleId: roleId('SYSTEM_ADMINISTRATOR') },
              })
              await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
              const admin = await profiles.resolve(DEVELOPER_AUTH_UUID, orgA, userA)
              await tx.$executeRaw`SET LOCAL ROLE postgres`
              // Every non-active lifecycle must revoke a previously good context.
              for (const accountStatus of [
                'INVITED',
                'SUSPENDED',
                'DEACTIVATED',
                'ARCHIVED',
              ] as const) {
                await tx.$executeRaw`SAVEPOINT phase5_lifecycle`
                const now = new Date()
                await tx.userProjectAssignment.updateMany({
                  where: { userId: userA, status: 'ACTIVE' },
                  data: {
                    status: 'ENDED',
                    endedAt: new Date(Date.now() + 172_800_000),
                    endReason: 'Synthetic lifecycle test',
                  },
                })
                await tx.systemUser.update({
                  where: { id: userA },
                  data: {
                    accountStatus,
                    activatedAt: accountStatus === 'INVITED' ? null : firstProfile[0].activatedAt,
                    suspendedAt: accountStatus === 'SUSPENDED' ? now : null,
                    deactivatedAt: accountStatus === 'DEACTIVATED' ? now : null,
                    archivedAt: accountStatus === 'ARCHIVED' ? now : null,
                  },
                })
                await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
                await expect(data.projects(admin)).rejects.toMatchObject({ status: 403 })
                await tx.$executeRaw`ROLLBACK TO SAVEPOINT phase5_lifecycle`
                await tx.$executeRaw`RELEASE SAVEPOINT phase5_lifecycle`
              }
              await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
              for (const project of [id(105), id(999), 'invalid']) {
                await expect(data.beneficiaryAggregate(admin, project)).rejects.toMatchObject({
                  status: 404,
                })
              }
              await tx.$executeRaw`SET LOCAL ROLE postgres`
              // Real immutable database review constraints: even an administrator
              // cannot approve their own submission or the item they verified.
              for (const n of [22, 23])
                await tx.systemUser.create({
                  data: {
                    id: id(n),
                    organizationId: orgA,
                    roleId: roleId('PROJECT_MANAGER'),
                    fullName: `Synthetic reviewer ${n}`,
                    email: `reviewer${n}@example.invalid`,
                    accountStatus: 'ACTIVE',
                    invitedAt: yesterday,
                    activatedAt: yesterday,
                  },
                })
              await tx.projectBudgetRecord.create({
                data: {
                  id: id(500),
                  organizationId: orgA,
                  projectId: id(100),
                  category: 'Synthetic',
                  currency: 'PHP',
                  plannedBudget: 100,
                  recordedById: userA,
                },
              })
              await tx.budgetExpenseEntry.create({
                data: {
                  id: id(501),
                  organizationId: orgA,
                  projectId: id(100),
                  budgetRecordId: id(500),
                  description: 'Synthetic receipt',
                  amount: 10,
                  expenseDate: yesterday,
                  submittedById: userA,
                  submittedAt: yesterday,
                },
              })
              await tx.evidenceMedia.create({
                data: {
                  id: id(502),
                  organizationId: orgA,
                  projectId: id(100),
                  expenseId: id(501),
                  type: 'DOCUMENT',
                  fileName: 'fixture.pdf',
                  bucket: 'pathways-private',
                  objectKey: `organizations/${orgA}/projects/${id(100)}/evidence/${id(502)}/fixture.pdf`,
                  sha256: 'a'.repeat(64),
                  byteSize: 10,
                  contentType: 'application/pdf',
                  submittedById: userA,
                  submittedAt: yesterday,
                },
              })
              await tx.evidenceMedia.update({
                where: { id: id(502) },
                data: { status: 'VERIFIED', verifiedById: id(22), verifiedAt: yesterday },
              })
              await tx.budgetExpenseEntry.update({
                where: { id: id(501) },
                data: { receiptEvidenceId: id(502) },
              })
              await tx.budgetExpenseEntry.update({
                where: { id: id(501) },
                data: { status: 'VERIFIED', verifiedById: id(22), verifiedAt: yesterday },
              })
              for (const actor of [userA, id(22)]) {
                await tx.$executeRaw`SAVEPOINT phase5_self_approval`
                await expect(
                  tx.$executeRaw`UPDATE pathways.budget_expense_entries SET status='APPROVED', approved_by_id=${actor}::uuid, approved_at=now() WHERE id=${id(501)}::uuid`,
                ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } })
                await tx.$executeRaw`ROLLBACK TO SAVEPOINT phase5_self_approval`
                await tx.$executeRaw`RELEASE SAVEPOINT phase5_self_approval`
              }
              await tx.budgetExpenseEntry.update({
                where: { id: id(501) },
                data: { status: 'APPROVED', approvedById: id(23), approvedAt: new Date() },
              })
              await tx.permission.update({
                where: { code: 'projects.read' },
                data: { isActive: false },
              })
              await expect(seedCanonicalReferenceData(tx)).rejects.toThrow('permission drift')
              await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
              await expect(data.projects(admin)).rejects.toThrow('permission')
              await tx.$executeRaw`SET LOCAL ROLE postgres`
              await tx.role.update({
                where: { id: roleId('SYSTEM_ADMINISTRATOR') },
                data: { isActive: false },
              })
              await tx.$executeRaw`SET LOCAL ROLE pathways_runtime`
              await expect(data.projects(admin)).rejects.toThrow(
                'Application scope could not be verified',
              )
              completed = true
              throw rollback
            },
            { timeout: 90_000 },
          )
        } catch (error) {
          if (error !== rollback) throw error
        }
        expect(completed).toBe(true)
        expect(await referenceSnapshot(client)).toEqual(before)
        expect(await client.organization.count()).toBe(0)
        expect(await client.systemUser.count()).toBe(0)
        const [auth] = await client.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM auth.users`
        expect(auth.count).toBe(0n)
      } finally {
        await client.$disconnect()
      }
    }, 100_000)
  },
)
