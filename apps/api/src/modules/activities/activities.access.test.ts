import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
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
}

const tx = {
  project: { findFirst: vi.fn() },
  projectActivity: { findFirst: vi.fn() },
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
