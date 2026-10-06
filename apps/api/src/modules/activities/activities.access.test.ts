// These existing domain tests isolate receipt transport; dedicated source tests cover its boundary.
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async (
    _tx: unknown,
    operation: string,
    projectId: string,
    sourceId: string | null,
    _key: unknown,
    body: Record<string, unknown>,
  ) => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
      operation,
    )
      ? 'f0000000-0000-4000-8000-000000000002'
      : null,
    generatedValues: {
      timestamp: '2026-09-27T00:00:00.001Z',
      businessDate: '2026-09-27',
      normalizedValue: operation === 'INDICATOR_MEASUREMENT' ? body.value : null,
      requestHash:
        operation === 'INDICATOR_MEASUREMENT'
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(
                JSON.stringify({
                  projectId,
                  indicatorId: sourceId,
                  periodStart: body.periodStart,
                  periodEnd: body.periodEnd,
                  value: body.value,
                  source: body.source,
                  note: body.note ?? null,
                  correctsMeasurementId: body.correctsMeasurementId ?? null,
                  correctionReason: body.correctionReason ?? null,
                }),
              )
              .digest('hex')
          : null,
    },
  }),
  finishRuleSourceOperation: async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }),
  readRuleSourceAcknowledgement: async () => null,
  bootstrapRuleSourceProject: async () => undefined,
}))
import { createHash } from 'node:crypto'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('@app/modules/auth/application-profile.service', () => ({
  readApplicationProfile: vi.fn(async () => state.actor),
}))
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

import { ActivitiesService } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const updateId = '40000000-0000-4000-8000-000000000004'
const officerId = '70000000-0000-4000-8000-000000000007'
const indicatorId = '80000000-0000-4000-8000-000000000008'
const stageId = '90000000-0000-4000-8000-000000000009'
const actor: ApplicationIdentity = {
  id: '50000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic actor',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['activities.read', 'evidence.review'],
  assignedProjectIds: [projectId],
}

const activity = {
  id: activityId,
  projectId,
  code: 'ACT-1',
  title: 'Synthetic activity',
  description: null,
  activityType: null,
  timelineOverrideJustification: null,
  targetBeneficiaries: 25,
  plannedStartDate: new Date('2026-01-01T00:00:00.000Z'),
  plannedEndDate: new Date('2026-12-31T00:00:00.000Z'),
  actualStartDate: new Date('2026-01-01T00:00:00.000Z'),
  actualEndDate: null,
  status: 'FOR_REVIEW',
  progressPercent: 80,
  project: {},
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
}

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  userProjectAssignment: { findMany: vi.fn() },
  projectActivityAssignment: { createMany: vi.fn(), updateMany: vi.fn() },
  projectIndicator: { findMany: vi.fn() },
  journeyStage: { findFirst: vi.fn() },
  activityIndicatorLink: { deleteMany: vi.fn(), createMany: vi.fn() },
  activityJourneyStageMapping: { deleteMany: vi.fn(), create: vi.fn() },
  projectBudgetRecord: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  evidenceMedia: { findFirst: vi.fn(), updateMany: vi.fn() },
  budgetExpenseEntry: { aggregate: vi.fn(), groupBy: vi.fn() },
  activityUpdate: { findFirst: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
  auditLog: { create: vi.fn() },
}
const listMetricKeys = [
  'indicatorCount',
  'beneficiariesTarget',
  'beneficiariesReached',
  'budgetUtilization',
]
const storage = { downloadPrivateFile: vi.fn() }

describe('P05 activity proof authorization', () => {
  const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    tx.$queryRaw.mockResolvedValue([])
    tx.activityUpdate.groupBy.mockResolvedValue([])
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
    tx.projectActivity.findFirst.mockResolvedValue(activity)
  })

  it('selects only scoped activity context for Admin configuration', async () => {
    state.actor = {
      ...actor,
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['activities.context.read'],
    }
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [
        {
          id: activityId,
          title: 'Synthetic activity',
          status: 'IN_PROGRESS',
          activityJourneyStageMapping_activity: [{ stageId }],
        },
      ],
    })
    await expect(service.context(state.actor, projectId)).resolves.toEqual([
      {
        id: activityId,
        title: 'Synthetic activity',
        status: 'IN_PROGRESS',
        journeyStageId: stageId,
      },
    ])
    const request = tx.project.findFirst.mock.calls[0][0]
    expect(request.where.AND).toContainEqual({ id: projectId })
    expect(Object.keys(request.select.projectActivity_project.select).sort()).toEqual([
      'activityJourneyStageMapping_activity',
      'id',
      'status',
      'title',
    ])
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
  })

  it('denies a proof outside the project scope without metadata or storage reads', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.downloadProof(actor, projectId, activityId, updateId)).rejects.toThrow()
    expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('releases a scoped proof only when its bytes match the recorded digest', async () => {
    const bytes = Buffer.from('synthetic proof bytes')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const proof = { bucket: 'b', objectKey: 'k', fileName: 'proof.jpg', contentType: 'image/jpeg' }
    tx.evidenceMedia.findFirst.mockResolvedValueOnce({ ...proof, sha256 })
    storage.downloadPrivateFile.mockResolvedValueOnce(bytes)
    await expect(service.downloadProof(actor, projectId, activityId, updateId)).resolves.toEqual({
      fileName: 'proof.jpg',
      contentType: 'image/jpeg',
      body: bytes,
    })
    expect(tx.evidenceMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: actor.organizationId, projectId }),
      }),
    )
    tx.evidenceMedia.findFirst.mockResolvedValueOnce({ ...proof, sha256: '0'.repeat(64) })
    storage.downloadPrivateFile.mockResolvedValueOnce(bytes)
    await expect(
      service.downloadProof(actor, projectId, activityId, updateId),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('loads bounded activity relations through one database join query', async () => {
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })

    const [result] = await service.list(actor, projectId)
    expect(result).not.toHaveProperty('projectGoalComparison')
    expect(result.progress).toBe(activity.progressPercent)
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        relationLoadStrategy: 'join',
        select: expect.objectContaining({
          projectActivity_project: expect.objectContaining({
            take: 100,
            where: { organizationId, archivedAt: null },
          }),
        }),
        where: {
          AND: [{ organizationId, archivedAt: null, id: { in: [projectId] } }, { id: projectId }],
        },
      }),
    )
  })

  it('returns a lean list shape without update history, proof, emails or read metrics', async () => {
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'budgets.read', 'beneficiaries.aggregates.read'],
    }
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [
        {
          ...activity,
          projectActivityAssignment_activity: [
            {
              projectAssignment: {
                userId: '70000000-0000-4000-8000-000000000007',
                user: { fullName: 'Officer' },
              },
            },
          ],
        },
      ],
    })

    const [item] = await service.list(state.actor, projectId)
    expect(Object.keys(item ?? {}).sort()).toEqual(
      [
        'assignedTo',
        'assignedUserIds',
        'beneficiariesReached',
        'beneficiariesTarget',
        'budgetUtilization',
        'capabilities',
        'code',
        'description',
        'dueDate',
        'id',
        'indicatorCount',
        'indicatorIds',
        'journeyStageId',
        'journeyStageIds',
        'overdue',
        'overdueExplanationNeeded',
        'progress',
        'projectId',
        'startDate',
        'status',
        'storedStatus',
        'targetBeneficiaries',
        'title',
        'updatedAt',
      ].sort(),
    )
    expect(item?.assignedTo).toEqual(['Officer'])
    const select = tx.project.findFirst.mock.calls[0][0].select.projectActivity_project.select
    expect(select).not.toHaveProperty('activityUpdate_activity')
    expect(select.projectActivityAssignment_activity.select.projectAssignment.select.user).toEqual({
      select: { fullName: true },
    })
    // The list never runs the per-activity detail aggregate and carries no logged total.
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
    expect(item).not.toHaveProperty('budgetLogged')
  })

  it('returns grouped list metrics in single scoped queries for a full reader', async () => {
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: [
        'activities.read',
        'budgets.read',
        'expenses.read',
        'beneficiaries.aggregates.read',
      ],
    }
    tx.project.findFirst.mockResolvedValueOnce({
      projectActivity_project: [
        {
          ...activity,
          activityIndicatorLink_activity: [{ indicatorId: 'i1' }, { indicatorId: 'i2' }],
        },
      ],
    })
    tx.activityUpdate.groupBy.mockResolvedValueOnce([
      { activityId: activity.id, _sum: { beneficiariesReachedThisSession: 12 } },
    ])
    tx.projectBudgetRecord.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        activityId: activity.id,
        plannedBudget: new Prisma.Decimal('1000'),
        archivedAt: null,
      },
      {
        id: 'r0',
        activityId: activity.id,
        plannedBudget: new Prisma.Decimal('500'),
        archivedAt: new Date(),
      },
    ])
    tx.budgetExpenseEntry.groupBy.mockResolvedValueOnce([
      { budgetRecordId: 'r1', _sum: { amount: new Prisma.Decimal('400') } },
      { budgetRecordId: 'r0', _sum: { amount: new Prisma.Decimal('100') } },
    ])
    const [item] = await service.list(state.actor, projectId)
    expect(item).toMatchObject({
      indicatorCount: 2,
      beneficiariesTarget: 25,
      beneficiariesReached: 12,
      budgetUtilization: 50,
    })
    expect(tx.activityUpdate.groupBy).toHaveBeenCalledTimes(1)
    expect(tx.budgetExpenseEntry.groupBy).toHaveBeenCalledTimes(1)
    expect(tx.projectBudgetRecord.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId,
      projectId,
    })
    expect(tx.budgetExpenseEntry.groupBy.mock.calls[0][0].where).toMatchObject({
      organizationId,
      projectId,
      status: 'APPROVED',
    })
  })

  it('returns 0 reached for a granted reader with no approved sessions', async () => {
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'beneficiaries.aggregates.read'],
    }
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    tx.activityUpdate.groupBy.mockResolvedValueOnce([])
    const [item] = await service.list(state.actor, projectId)
    expect(item).toMatchObject({ beneficiariesReached: 0 })
  })

  it('returns null budget and reached metrics without the grants and skips their queries', async () => {
    state.actor = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'budgets.read'],
    }
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    const [item] = await service.list(state.actor, projectId)
    expect(item).toMatchObject({ budgetUtilization: null, beneficiariesReached: null })
    expect(tx.activityUpdate.groupBy).not.toHaveBeenCalled()
    expect(tx.projectBudgetRecord.findMany).not.toHaveBeenCalled()
    expect(tx.budgetExpenseEntry.groupBy).not.toHaveBeenCalled()
  })

  it('returns the approved logged total for an expense reader, scoped to the activity', async () => {
    const reader = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'expenses.read'],
    }
    state.actor = reader as ApplicationIdentity
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    tx.budgetExpenseEntry.aggregate.mockResolvedValueOnce({
      _sum: { amount: new Prisma.Decimal('1500.5') },
      _count: { _all: 2 },
    })
    const detail = await service.get(reader, projectId, activityId)
    expect(detail).toMatchObject({ budgetLogged: '1500.50', budgetLoggedEntries: 2 })
    expect(tx.budgetExpenseEntry.aggregate).toHaveBeenCalledWith({
      where: {
        organizationId,
        projectId,
        status: 'APPROVED',
        budgetRecord: { organizationId, projectId, activityId },
      },
      _sum: { amount: true },
      _count: { _all: true },
    })
  })

  it('reports an empty approved expense set as zero entries, not as a missing value', async () => {
    const reader = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'expenses.read'],
    }
    state.actor = reader as ApplicationIdentity
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    tx.budgetExpenseEntry.aggregate.mockResolvedValueOnce({
      _sum: { amount: null },
      _count: { _all: 0 },
    })
    await expect(service.get(reader, projectId, activityId)).resolves.toMatchObject({
      budgetLogged: '0.00',
      budgetLoggedEntries: 0,
    })
  })

  it('withholds the logged total (null, never 0) without expenses.read', async () => {
    const officer = {
      ...actor,
      roles: ['PROJECT_OFFICER'],
      permissions: ['activities.read', 'budgets.read'],
    }
    state.actor = officer as ApplicationIdentity
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    const detail = await service.get(officer, projectId, activityId)
    expect(detail).toMatchObject({ budgetLogged: null, budgetLoggedEntries: null })
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
  })

  it('allocates from every live budget line, matching the list and the finance ledger', async () => {
    const officer = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read', 'budgets.read'],
    }
    state.actor = officer as ApplicationIdentity
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    // An activity envelope plus a named category line; the detail used to read only the first.
    tx.projectBudgetRecord.findMany.mockResolvedValueOnce([
      { activityId, plannedBudget: new Prisma.Decimal('40000') },
      { activityId, plannedBudget: new Prisma.Decimal('20000') },
    ])
    await expect(service.get(officer, projectId, activityId)).resolves.toMatchObject({
      budgetAllocation: '60000.00',
    })
    // No category filter: a line that funds the activity counts whatever it is called.
    const where = tx.projectBudgetRecord.findMany.mock.calls[0]?.[0].where
    expect(where).toMatchObject({ archivedAt: null })
    expect(where).not.toHaveProperty('category')
  })

  it('reads no expenses for an out-of-scope activity', async () => {
    const reader = { ...actor, permissions: ['activities.read', 'expenses.read'] }
    state.actor = reader
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(reader, projectId, activityId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.budgetExpenseEntry.aggregate).not.toHaveBeenCalled()
  })

  it('keeps full nested updates, proof and metrics on the single-activity read', async () => {
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })
    const detail = await service.get(actor, projectId, activityId)
    expect(detail).toHaveProperty('updateNotes')
    expect(detail).toHaveProperty('submittedProof')
    expect(detail).toHaveProperty('assignedEmails')
    const select = tx.project.findFirst.mock.calls[0][0].select.projectActivity_project.select
    expect(select).toHaveProperty('activityUpdate_activity')
  })

  it('reports a guessed or cross-project activity id as not found on the detail read', async () => {
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [] })
    await expect(service.get(actor, projectId, activityId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(actor, projectId, activityId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(service.get(actor, projectId, 'not-a-uuid')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('does not disclose a guessed proof identifier outside the scoped activity', async () => {
    tx.evidenceMedia.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.downloadProof(actor, projectId, activityId, updateId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('rejects self-review before any review state is written', async () => {
    tx.activityUpdate.findFirst.mockResolvedValueOnce({
      id: updateId,
      status: 'PENDING',
      submittedById: actor.userId,
      updatedAt: new Date('2026-09-13T00:00:00.000Z'),
      progressPercent: 80,
      evidenceMedia_update: [{ id: 'proof', storageReady: true, status: 'PENDING' }],
    })
    await expect(
      service.reviewUpdate(actor, projectId, activityId, updateId, {
        decision: 'APPROVE',
        reason: 'Not allowed',
        clientMutationId: 'e0000000-0000-4000-8000-000000000001',
        expectedUpdatedAt: '2026-09-13T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.activityUpdate.update).not.toHaveBeenCalled()
  })
})

describe('Activity creation contract authorization', () => {
  const projectManager: ApplicationIdentity = {
    ...actor,
    roles: ['PROJECT_MANAGER'],
    permissions: [
      'activities.read',
      'activities.create',
      'activities.update',
      'indicators.update',
      'journeys.read',
      'budgets.read',
      'budgets.create',
    ],
  }
  const repairedActivity = {
    ...activity,
    status: 'NOT_STARTED',
    progressPercent: 0,
    timelineOverrideJustification: 'Approved early mobilization',
    targetBeneficiaries: 50,
    projectActivityAssignment_activity: [
      {
        projectAssignment: {
          userId: officerId,
          user: { fullName: 'Synthetic Project Officer', email: 'officer@example.invalid' },
        },
      },
    ],
    activityIndicatorLink_activity: [{ indicatorId }],
    activityOverdueExplanation_activity: [],
    activityJourneyStageMapping_activity: [{ stageId }],
  }
  const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = projectManager
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({
      id: projectId,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    })
    tx.userProjectAssignment.findMany.mockResolvedValue([{ id: updateId, userId: officerId }])
    tx.projectIndicator.findMany.mockResolvedValue([{ id: indicatorId }])
    tx.journeyStage.findFirst.mockResolvedValue({ id: stageId })
    tx.projectActivity.findFirst.mockResolvedValue(repairedActivity)
    tx.projectBudgetRecord.findFirst.mockResolvedValue(null)
    tx.projectBudgetRecord.findMany.mockResolvedValue([
      { activityId, plannedBudget: new Prisma.Decimal('25000.25') },
    ])
  })

  const input = () => ({
    clientMutationId: 'e0000000-0000-4000-8000-000000000001',
    title: 'Synthetic repaired activity',
    plannedStartDate: '2025-12-15',
    plannedEndDate: '2026-06-30',
    timelineOverrideJustification: 'Approved early mobilization',
    targetBeneficiaries: 50,
    budgetAllocation: '25000.25',
    assignedUserIds: [officerId],
    indicatorIds: [indicatorId],
    journeyStageId: stageId,
  })

  it('round-trips repaired fields, Project Officers, optional links, and decimal budget', async () => {
    const created = await service.create(projectManager, projectId, input())
    expect(created).toMatchObject({
      targetBeneficiaries: 50,
      budgetAllocation: '25000.25',
      assignedUserIds: [officerId],
      indicatorIds: [indicatorId],
      journeyStageId: stageId,
      timelineOverrideJustification: 'Approved early mobilization',
    })
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [repairedActivity] })
    if (!('sourceAcknowledgement' in created)) throw new Error('Expected fresh source projection')
    const { sourceAcknowledgement, ...savedActivity } = created
    expect(sourceAcknowledgement).toMatchObject({ committed: true, replayed: false })
    const [listed] = await service.list(projectManager, projectId)
    expect(listed).toMatchObject(
      Object.fromEntries(
        Object.keys(listed ?? {})
          .filter((key) => !listMetricKeys.includes(key))
          .map((key) => [key, (savedActivity as Record<string, unknown>)[key]]),
      ),
    )
    expect(tx.projectActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId,
          projectId,
          targetBeneficiaries: 50,
          timelineOverrideJustification: 'Approved early mobilization',
        }),
      }),
    )
    expect(tx.activityIndicatorLink.createMany).toHaveBeenCalled()
    expect(tx.activityJourneyStageMapping.create).toHaveBeenCalled()
    expect(tx.projectBudgetRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'ACTIVITY_PROFILE_TOTAL',
        currency: 'PHP',
        plannedBudget: expect.any(Prisma.Decimal),
      }),
    })
  })

  it('accepts explicitly blank indicator and journey links', async () => {
    const blank = { ...input(), indicatorIds: [], journeyStageId: null }
    await expect(service.create(projectManager, projectId, blank)).resolves.toBeDefined()
    expect(tx.activityIndicatorLink.createMany).not.toHaveBeenCalled()
    expect(tx.activityJourneyStageMapping.create).not.toHaveBeenCalled()
  })

  it('rejects an assignee who is not an active Project Officer on the project', async () => {
    tx.userProjectAssignment.findMany.mockResolvedValueOnce([])
    await expect(service.create(projectManager, projectId, input())).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.projectActivity.create).not.toHaveBeenCalled()
  })

  it('rejects a cross-project indicator', async () => {
    tx.projectIndicator.findMany.mockResolvedValueOnce([])
    await expect(service.create(projectManager, projectId, input())).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.projectActivity.create).not.toHaveBeenCalled()
  })

  it('rejects a cross-project journey stage', async () => {
    tx.journeyStage.findFirst.mockResolvedValueOnce(null)
    await expect(service.create(projectManager, projectId, input())).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.projectActivity.create).not.toHaveBeenCalled()
  })

  it('requires a justification only when Activity dates leave the Project timeline', async () => {
    const invalid = input()
    ;(invalid as Partial<typeof invalid>).timelineOverrideJustification = undefined
    await expect(service.create(projectManager, projectId, invalid)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.userProjectAssignment.findMany).not.toHaveBeenCalled()
  })

  const updateInput = () => {
    const { budgetAllocation: _budget, ...rest } = input()
    return { ...rest, expectedUpdatedAt: repairedActivity.updatedAt.toISOString() }
  }

  it('updates with one project-scope query and one scoped activity read-back', async () => {
    tx.projectActivity.updateMany.mockResolvedValue({ count: 1 })
    await expect(
      service.update(projectManager, projectId, activityId, updateInput()),
    ).resolves.toMatchObject({ id: activityId })
    expect(tx.project.findFirst).toHaveBeenCalledOnce()
    expect(tx.projectActivity.findFirst).toHaveBeenCalledTimes(2)
    for (const [request] of tx.projectActivity.findFirst.mock.calls)
      expect(request.where).toMatchObject({ organizationId, projectId, archivedAt: null })
  })

  it('denies an update outside project scope before reading or writing the activity', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.update(projectManager, projectId, activityId, updateInput()),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(tx.projectActivity.updateMany).not.toHaveBeenCalled()
  })

  it('transitions with one project-scope query and one scoped activity read-back', async () => {
    tx.projectActivity.updateMany.mockResolvedValue({ count: 1 })
    await service.transition(projectManager, projectId, activityId, {
      status: 'IN_PROGRESS',
      clientMutationId: 'e0000000-0000-4000-8000-000000000002',
      expectedUpdatedAt: repairedActivity.updatedAt.toISOString(),
    })
    expect(tx.project.findFirst).toHaveBeenCalledOnce()
    expect(tx.projectActivity.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.projectActivity.findFirst.mock.calls[1][0].where).toEqual({
      id: activityId,
      organizationId,
      projectId,
      archivedAt: null,
    })
  })

  it('denies a transition for a cross-project activity id', async () => {
    tx.projectActivity.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.transition(projectManager, projectId, activityId, {
        status: 'CANCELLED',
        reason: 'Synthetic',
        clientMutationId: 'e0000000-0000-4000-8000-000000000003',
        expectedUpdatedAt: repairedActivity.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.projectActivity.updateMany).not.toHaveBeenCalled()
  })

  it('hides an unauthorized or cross-organization Project before Activity creation', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.create(projectManager, projectId, input())).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.projectActivity.create).not.toHaveBeenCalled()
  })
})
