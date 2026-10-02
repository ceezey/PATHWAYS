import 'reflect-metadata'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

// The operation boundary is replaced with a permission check against the synthetic actor,
// so a missing grant denies before any scoped read runs.
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, state.actor)
  }),
}))

import { ActivitiesController } from './activities.controller'
import { RecordActivityProgressDto } from './activities.dto'
import { ActivitiesService } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const otherProjectId = '20000000-0000-4000-8000-00000000000f'
const clientUpdateId = 'a0000000-0000-4000-8000-00000000000a'

const actor: ApplicationIdentity = {
  id: '50000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic officer',
  roles: ['PROJECT_OFFICER'],
  permissions: ['activities.read', 'activities.progress.update'],
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
  status: 'IN_PROGRESS',
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
}

const tx = {
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
  projectActivityAssignment: { findFirst: vi.fn() },
  projectBudgetRecord: { findMany: vi.fn() },
  activityUpdate: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

const input = { clientUpdateId, progressPercent: 45, note: '  Halfway through sessions.  ' }

describe('Activity progress update (activities.progress.update)', () => {
  const service = new ActivitiesService({} as PrismaService, {} as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = actor
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.$queryRaw.mockResolvedValue([])
    tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
    tx.projectActivity.findFirst.mockResolvedValue(activity)
    tx.projectActivityAssignment.findFirst.mockResolvedValue({ id: 'assignment' })
    tx.activityUpdate.findFirst.mockResolvedValue(null)
  })

  it('gates the endpoint with the progress permission', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype.recordProgress)).toBe(
      'activities.progress.update',
    )
  })

  it('records a scoped pending update with an audit entry (happy path)', async () => {
    const result = await service.recordProgress(actor, projectId, activityId, input)
    expect(result.id).toBe(activityId)
    const scoped = tx.project.findFirst.mock.calls[0][0]
    expect(scoped.where.AND[0]).toMatchObject({ organizationId, archivedAt: null })
    expect(scoped.where.AND).toContainEqual({ id: projectId })
    expect(tx.activityUpdate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        projectId,
        activityId,
        clientUpdateId,
        progressPercent: 45,
        note: 'Halfway through sessions.',
        submittedById: actor.userId,
      }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId,
        actorUserId: actor.userId,
        action: 'ACTIVITY_PROGRESS_RECORDED',
        entityType: 'ActivityUpdate',
      }),
    })
  })

  it('resolves project scope once and reads the activity back without a second scope query', async () => {
    await service.recordProgress(actor, projectId, activityId, input)
    expect(tx.project.findFirst).toHaveBeenCalledOnce()
    expect(tx.projectActivity.findFirst).toHaveBeenCalledTimes(2)
    const readBack = tx.projectActivity.findFirst.mock.calls[1][0]
    expect(readBack.where).toEqual({
      id: activityId,
      organizationId,
      projectId,
      archivedAt: null,
    })
  })

  it('still denies a project outside scope before any activity read or write', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.recordProgress(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('replays the same client update id without a second write', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({
      projectId,
      activityId,
      progressPercent: 45,
      note: 'Halfway through sessions.',
    })
    await service.recordProgress(actor, projectId, activityId, input)
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies an actor without the permission before any read (sad)', async () => {
    state.actor = { ...actor, permissions: ['activities.read'] }
    await expect(
      service.recordProgress(state.actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('rejects invalid input at the DTO boundary (sad)', async () => {
    for (const body of [
      { ...input, progressPercent: 101 },
      { ...input, progressPercent: -1 },
      { ...input, progressPercent: '50' },
      { ...input, clientUpdateId: 'not-a-uuid' },
      { ...input, note: '' },
      { clientUpdateId, progressPercent: 10 },
    ]) {
      const errors = await validate(plainToInstance(RecordActivityProgressDto, body))
      expect(errors.length).toBeGreaterThan(0)
    }
    expect(await validate(plainToInstance(RecordActivityProgressDto, input))).toEqual([])
  })

  it('rejects progress on an activity that is not in progress (sad)', async () => {
    tx.projectActivity.findFirst.mockResolvedValue({ ...activity, status: 'FOR_REVIEW' })
    await expect(
      service.recordProgress(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('hides a cross-organization or unassigned project before activity retrieval (abuse)', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.recordProgress(actor, otherProjectId, activityId, input),
    ).rejects.toBeInstanceOf(NotFoundException)
    const scoped = tx.project.findFirst.mock.calls[0][0]
    expect(scoped.where.AND[0]).toMatchObject({ organizationId })
    expect(tx.projectActivity.findFirst).not.toHaveBeenCalled()
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies an actor without an active assignment on the activity (abuse)', async () => {
    tx.projectActivityAssignment.findFirst.mockResolvedValue(null)
    await expect(
      service.recordProgress(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.projectActivityAssignment.findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId,
      projectAssignment: { userId: actor.userId, status: 'ACTIVE' },
    })
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('rejects a reused client update id with different input (abuse)', async () => {
    tx.activityUpdate.findFirst.mockResolvedValue({
      projectId,
      activityId,
      progressPercent: 10,
      note: 'Different',
    })
    await expect(
      service.recordProgress(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('rejects a new progress update while one is pending for the activity (409)', async () => {
    tx.activityUpdate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'pending' })
    await expect(
      service.recordProgress(actor, projectId, activityId, input),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.activityUpdate.findFirst.mock.calls[1][0].where).toMatchObject({
      organizationId,
      projectId,
      activityId,
      status: 'PENDING',
    })
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })

  it('requires proof submission for 100% completion', async () => {
    await expect(
      service.recordProgress(actor, projectId, activityId, { ...input, progressPercent: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.activityUpdate.create).not.toHaveBeenCalled()
  })
})
