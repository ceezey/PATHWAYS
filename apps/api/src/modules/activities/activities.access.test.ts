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
  project: { targetGoal: '75' },
  reviewedById: null,
  reviewedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  updatedAt: new Date('2026-09-13T00:00:00.000Z'),
  projectActivityAssignment_activity: [],
  activityUpdate_activity: [],
  activityJourneyStageMapping_activity: [],
  activityIndicatorLink_activity: [],
}

const tx = {
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn(), create: vi.fn() },
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
  activityUpdate: { findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}
const storage = { downloadPrivateFile: vi.fn() }

describe('P05 activity proof authorization', () => {
  const service = new ActivitiesService({} as PrismaService, storage as unknown as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
    tx.projectActivity.findFirst.mockResolvedValue(activity)
  })

  it('does not fetch private proof when project scope is unavailable', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.downloadProof(actor, projectId, activityId, updateId),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.evidenceMedia.findFirst).not.toHaveBeenCalled()
    expect(storage.downloadPrivateFile).not.toHaveBeenCalled()
  })

  it('loads bounded activity relations through one database join query', async () => {
    tx.project.findFirst.mockResolvedValueOnce({ projectActivity_project: [activity] })

    await expect(service.list(actor, projectId)).resolves.toMatchObject([
      { projectGoalComparison: { state: 'ABOVE_TARGET', reason: null } },
    ])
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
    await expect(service.list(projectManager, projectId)).resolves.toEqual([created])
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

  it('hides an unauthorized or cross-organization Project before Activity creation', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.create(projectManager, projectId, input())).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.projectActivity.create).not.toHaveBeenCalled()
  })
})
