import 'reflect-metadata'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import {
  type AtomicPermission,
  type CanonicalRole,
  hasAtomicPermission,
  rolePermissions,
} from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

// The operation boundary re-checks the named permission against the synthetic actor under
// the role ceiling, as the real boundary does against the freshly read profile.
vi.mock('@app/modules/auth/authorized-operation', async () => {
  const policy = await import('@app/modules/auth/authorization-policy')
  return {
    withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission, work) => {
      const actor = state.actor
      if (!actor || !policy.hasAtomicPermission(actor.roles[0], actor.permissions, permission))
        throw new ForbiddenException('Required application permission is missing.')
      return work(state.tx, actor)
    }),
  }
})
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async () => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: null,
    generatedValues: { timestamp: '2026-09-27T00:00:00.001Z', businessDate: '2026-09-27' },
  }),
}))

import { ActivitiesController } from './activities.controller'
import { ActivitiesService, activityCapabilities } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const otherProjectId = '20000000-0000-4000-8000-00000000000f'
const activityId = '30000000-0000-4000-8000-000000000003'
const officerId = '70000000-0000-4000-8000-000000000007'

const roles = Object.keys(rolePermissions) as CanonicalRole[]
const actorFor = (role: CanonicalRole): ApplicationIdentity => ({
  id: '50000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions: [...rolePermissions[role]],
  assignedProjectIds: [projectId],
})
const has = (role: CanonicalRole, permission: AtomicPermission) =>
  hasAtomicPermission(role, rolePermissions[role], permission)

const activityRow = (status: string, personalAssignments: number) => ({
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: null,
  activityType: null,
  timelineOverrideJustification: null,
  targetBeneficiaries: 25,
  plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
  plannedEndDate: new Date('2099-12-31T00:00:00.000Z'),
  actualStartDate: null,
  actualEndDate: null,
  status,
  progressPercent: 20,
  reviewedById: null,
  reviewedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  updatedAt: new Date('2026-09-13T00:00:00.000Z'),
  projectActivityAssignment_activity: [],
  activityUpdate_activity: [],
  activityJourneyStageMapping_activity: [],
  activityIndicatorLink_activity: [],
  activityOverdueExplanation_activity: [],
  _count: { projectActivityAssignment_activity: personalAssignments },
})

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  projectActivityAssignment: { findFirst: vi.fn(), count: vi.fn() },
  userProjectAssignment: { findMany: vi.fn() },
  projectBudgetRecord: { findMany: vi.fn() },
  budgetExpenseEntry: { aggregate: vi.fn() },
  activityUpdate: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

const service = new ActivitiesService({} as PrismaService, {} as StorageService)

beforeEach(() => {
  vi.clearAllMocks()
  state.tx = tx as unknown as Prisma.TransactionClient
  tx.$queryRaw.mockResolvedValue([])
  tx.projectBudgetRecord.findMany.mockResolvedValue([])
  tx.budgetExpenseEntry.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } })
  tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
  tx.activityUpdate.findFirst.mockResolvedValue(null)
})

describe('server-computed activity capabilities', () => {
  it('computes the personal assignment in the same scoped list query, never per activity', async () => {
    const actor = actorFor('PROJECT_OFFICER')
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [activityRow('IN_PROGRESS', 1), activityRow('NOT_STARTED', 0)],
    })
    const [assigned, unassigned] = await service.list(actor, projectId)
    expect(tx.project.findFirst).toHaveBeenCalledOnce()
    expect(tx.projectActivityAssignment.findFirst).not.toHaveBeenCalled()
    expect(tx.projectActivityAssignment.count).not.toHaveBeenCalled()
    const request = tx.project.findFirst.mock.calls[0][0]
    expect(request.where.AND[0]).toMatchObject({ organizationId, id: { in: [projectId] } })
    expect(request.select.projectActivity_project.select._count).toEqual({
      select: {
        projectActivityAssignment_activity: {
          where: {
            organizationId,
            status: 'ACTIVE',
            endedAt: null,
            projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
          },
        },
      },
    })
    expect(assigned?.capabilities).toEqual({
      canEdit: false,
      canRecordProgress: true,
      canSubmitProof: true,
      canExplainOverdue: false,
    })
    expect(unassigned?.capabilities).toEqual({
      canEdit: false,
      canRecordProgress: false,
      canSubmitProof: false,
      canExplainOverdue: false,
    })
    // The flags are the only list addition: no count or internal key leaks.
    expect(assigned).not.toHaveProperty('_count')
  })

  it('adds the same flags to the detail read from its single scoped query', async () => {
    const actor = actorFor('PROJECT_MANAGER')
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [activityRow('IN_PROGRESS', 0)],
    })
    const detail = await service.get(actor, projectId, activityId)
    expect(detail.capabilities).toEqual({
      canEdit: true,
      canRecordProgress: false,
      canSubmitProof: false,
      // PROJECT_MANAGER holds monitoring.review and this row was already resolved through
      // projectScope(actor), so canExplainOverdue no longer needs a personal activity
      // assignment (see activities.service.ts activityCapabilities).
      canExplainOverdue: true,
    })
    expect(detail).not.toHaveProperty('_count')
    const select = tx.project.findFirst.mock.calls[0][0].select.projectActivity_project.select
    expect(select._count.select.projectActivityAssignment_activity.where.projectAssignment).toEqual(
      { userId: actor.userId, status: 'ACTIVE', endedAt: null },
    )
  })

  it.each(['COMPLETED', 'CANCELLED'] as const)(
    'never offers Edit on a %s activity, even to an update holder',
    (status) => {
      expect(activityCapabilities(actorFor('PROJECT_MANAGER'), status, 1).canEdit).toBe(false)
    },
  )

  it('treats a missing or zero personal assignment count as unassigned', () => {
    const actor = actorFor('PROJECT_OFFICER')
    expect(activityCapabilities(actor, 'IN_PROGRESS', undefined)).toEqual({
      canEdit: false,
      canRecordProgress: false,
      canSubmitProof: false,
      canExplainOverdue: false,
    })
  })

  it('reports the activity beneficiariesReached exactly as the database aggregate returns it', async () => {
    // cr-pathways-proof-session-beneficiary-count: pathways.p08_activity_beneficiaries_reached
    // now sums each activity's APPROVED beneficiaries_reached_this_session values (NULL as 0)
    // and excludes PENDING, VERIFIED and REJECTED updates; a later rejection lowers the sum.
    // The service is a pass-through of that already-aggregated total, so this test fixes the
    // contract at the boundary. The SQL aggregation itself is covered by
    // apps/api/prisma/tests/proof-session-beneficiary-count-runtime.sql.
    const actor = actorFor('PROJECT_MANAGER')
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [activityRow('IN_PROGRESS', 0)],
    })
    tx.$queryRaw.mockResolvedValueOnce([{ activityId, beneficiariesReached: 17 }])
    const detail = await service.get(actor, projectId, activityId)
    expect(detail.beneficiariesReached).toBe(17)
  })

  it('reports zero when the aggregate returns no row for the activity (no approved proofs yet)', async () => {
    const actor = actorFor('PROJECT_MANAGER')
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [activityRow('IN_PROGRESS', 0)],
    })
    tx.$queryRaw.mockResolvedValueOnce([])
    const detail = await service.get(actor, projectId, activityId)
    expect(detail.beneficiariesReached).toBe(0)
  })

  it('never widens a flag beyond the caller role ceiling (forged grant list)', () => {
    const forged = {
      ...actorFor('PROJECT_OFFICER'),
      permissions: [...rolePermissions.PROJECT_OFFICER, 'activities.update'],
    }
    expect(activityCapabilities(forged, 'IN_PROGRESS', 1).canEdit).toBe(false)
  })
})

describe('each role sees exactly the actions the API accepts', () => {
  const proofFile = {
    fileName: 'proof.pdf',
    contentType: 'application/pdf' as const,
    byteSize: 19,
    sha256: 'a'.repeat(64),
  }
  const cases = roles.flatMap((role) =>
    [true, false].flatMap((assigned) =>
      (['IN_PROGRESS', 'COMPLETED'] as const).map((status) => ({ role, assigned, status })),
    ),
  )

  it.each(cases)('$role, assigned=$assigned, $status', async ({ role, assigned, status }) => {
    const actor = actorFor(role)
    state.actor = actor
    const row = activityRow(status, assigned ? 1 : 0)
    const flags = activityCapabilities(actor, status, assigned ? 1 : 0)
    tx.projectActivity.findFirst.mockResolvedValue(row)
    tx.projectActivityAssignment.findFirst.mockResolvedValue(assigned ? { id: 'assignment' } : null)

    // Edit: a stale expectedUpdatedAt is the only remaining failure once authority passes.
    const edit = service
      .update(actor, projectId, activityId, {
        clientMutationId: 'c0000000-0000-4000-8000-00000000000c',
        title: 'Synthetic activity',
        plannedStartDate: '2026-01-01',
        plannedEndDate: '2026-12-31',
        assignedUserIds: [officerId],
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      })
      .catch((error: unknown) => error)
    const editError = await edit
    if (flags.canEdit) {
      expect(editError).toBeInstanceOf(ConflictException)
      expect((editError as Error).message).toBe('Activity changed; reload before saving.')
    } else {
      expect(
        editError instanceof ForbiddenException ||
          (editError instanceof ConflictException &&
            (editError as Error).message === 'Terminal activity history cannot be edited.'),
      ).toBe(true)
      if (!has(role, 'activities.update')) expect(editError).toBeInstanceOf(ForbiddenException)
    }

    // Record progress: 100% is refused as a proof-only completion after authority passes.
    const progressError = await service
      .recordProgress(actor, projectId, activityId, {
        clientUpdateId: 'a0000000-0000-4000-8000-00000000000a',
        progressPercent: 100,
        note: 'Synthetic note',
      })
      .catch((error: unknown) => error)
    if (flags.canRecordProgress) {
      expect(progressError).not.toBeInstanceOf(ForbiddenException)
    } else {
      expect(progressError).toBeInstanceOf(ForbiddenException)
    }

    // Submit proof: a reused client update id from another project is refused after authority.
    tx.activityUpdate.findFirst.mockResolvedValueOnce({
      id: 'update',
      projectId: otherProjectId,
      activityId,
      progressPercent: 100,
      note: 'Other',
      evidenceMedia_update: [],
    })
    const proofError = await service
      .reserveProof(actor, projectId, activityId, {
        clientUpdateId: 'b0000000-0000-4000-8000-00000000000b',
        progressPercent: 100,
        note: 'Synthetic proof',
        files: [proofFile],
      })
      .catch((error: unknown) => error)
    if (flags.canSubmitProof) {
      expect(proofError).toBeInstanceOf(ConflictException)
    } else {
      expect(proofError).toBeInstanceOf(ForbiddenException)
    }
  })
})

describe('GET projects/:projectId/activities/assignable-officers', () => {
  const officers = Array.from({ length: 50 }, (_, index) => ({
    user: {
      id: `71000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      fullName: `Officer ${String(index).padStart(2, '0')}`,
      // Extra columns a mis-scoped select could return must never reach the response.
      email: `officer${index}@example.test`,
      contactNumber: '+63 900 000 0000',
      authUserId: 'a1000000-0000-4000-8000-000000000001',
    },
  }))

  it('admits activity readers at the guard and forbids query parameters', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype.assignableOfficers),
    ).toBe('activities.read')
    const controller = new ActivitiesController(
      { assignableOfficers: vi.fn() } as unknown as ActivitiesService,
      {} as never,
    )
    expect(() =>
      controller.assignableOfficers({ user: actorFor('PROJECT_MANAGER') } as never, projectId, {
        include: 'email',
      }),
    ).toThrow(BadRequestException)
  })

  it('registers the route before the :activityId detail route', () => {
    const names = Object.getOwnPropertyNames(ActivitiesController.prototype)
    expect(names.indexOf('assignableOfficers')).toBeLessThan(names.indexOf('get'))
  })

  it.each(['PROJECT_OFFICER', 'PROJECT_MANAGER'] as const)(
    'returns only userId and displayName, at most 50 rows, for an assigned %s',
    async (role) => {
      const actor = actorFor(role)
      state.actor = actor
      tx.userProjectAssignment.findMany.mockResolvedValueOnce(officers)
      const result = await service.assignableOfficers(actor, projectId)
      expect(result).toHaveLength(50)
      for (const row of result) expect(Object.keys(row).sort()).toEqual(['displayName', 'userId'])
      expect(result[0]).toEqual({ userId: officers[0].user.id, displayName: 'Officer 00' })
      const project = tx.project.findFirst.mock.calls[0][0]
      expect(project.where.AND).toContainEqual({ id: projectId })
      expect(project.where.AND[0]).toMatchObject({ organizationId, id: { in: [projectId] } })
      expect(tx.userProjectAssignment.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          projectId,
          status: 'ACTIVE',
          endedAt: null,
          user: {
            accountStatus: 'ACTIVE',
            archivedAt: null,
            role: { code: 'PROJECT_OFFICER', isActive: true },
          },
        },
        select: { user: { select: { id: true, fullName: true } } },
        orderBy: [{ user: { fullName: 'asc' } }, { userId: 'asc' }],
        take: 50,
      })
    },
  )

  it.each([
    'SYSTEM_ADMINISTRATOR',
    'MONITORING_AND_EVALUATION_OFFICER',
    'PROGRAM_MANAGER',
    'GRANT_MANAGER',
  ] as const)('denies %s before any project or user read', async (role) => {
    const actor = actorFor(role)
    state.actor = actor
    expect(has(role, 'activities.create') || has(role, 'activities.update')).toBe(false)
    await expect(service.assignableOfficers(actor, projectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.userProjectAssignment.findMany).not.toHaveBeenCalled()
  })

  it('denies a forged grant list beyond the role ceiling', async () => {
    const forged = {
      ...actorFor('MONITORING_AND_EVALUATION_OFFICER'),
      permissions: [...rolePermissions.MONITORING_AND_EVALUATION_OFFICER, 'activities.create'],
    }
    state.actor = forged
    await expect(service.assignableOfficers(forged, projectId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.userProjectAssignment.findMany).not.toHaveBeenCalled()
  })

  it('returns the uniform 404 for an unassigned or cross-organization project', async () => {
    const actor = { ...actorFor('PROJECT_MANAGER'), assignedProjectIds: [projectId] }
    state.actor = actor
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.assignableOfficers(actor, otherProjectId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    const scoped = tx.project.findFirst.mock.calls[0][0]
    expect(scoped.where.AND[0]).toMatchObject({ organizationId, id: { in: [projectId] } })
    expect(scoped.where.AND).toContainEqual({ id: otherProjectId })
    expect(tx.userProjectAssignment.findMany).not.toHaveBeenCalled()
  })

  it('returns 404 for a malformed project id without reading users', async () => {
    const actor = actorFor('PROJECT_OFFICER')
    state.actor = actor
    await expect(service.assignableOfficers(actor, 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.userProjectAssignment.findMany).not.toHaveBeenCalled()
  })

  it('reports an empty eligible set as an empty list', async () => {
    const actor = actorFor('PROJECT_MANAGER')
    state.actor = actor
    tx.userProjectAssignment.findMany.mockResolvedValueOnce([])
    await expect(service.assignableOfficers(actor, projectId)).resolves.toEqual([])
  })
})
