import 'reflect-metadata'

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { StorageService } from '@app/modules/storage/storage.service'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({ actor: undefined as ApplicationIdentity | undefined }))

// The operation boundary is replaced with a permission check against the synthetic actor.
vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, permission: string, work) => {
    if (!state.actor?.permissions.includes(permission))
      throw new ForbiddenException('Permission denied.')
    return work(tx, state.actor)
  }),
}))

import { MilestonesController } from './activities.controller'
import { ActivitiesService } from './activities.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const milestoneId = '30000000-0000-4000-8000-000000000003'

const manager: ApplicationIdentity = {
  id: '50000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  userId: '60000000-0000-4000-8000-000000000006',
  organizationId,
  fullName: 'Synthetic project manager',
  roles: ['PROJECT_MANAGER'],
  permissions: ['activities.read', 'milestones.manage'],
  assignedProjectIds: [projectId],
}

const tx = {
  project: { findFirst: vi.fn() },
  projectMilestone: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}

const save = { title: 'Baseline survey done', targetDate: '2026-06-30' }
const update = {
  ...save,
  status: 'IN_PROGRESS' as const,
  expectedUpdatedAt: '2026-09-13T00:00:00.000Z',
}

describe('G-F2-10 milestones require milestones.manage', () => {
  const service = new ActivitiesService({} as PrismaService, {} as StorageService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = manager
    tx.project.findFirst.mockResolvedValue({ id: projectId, startDate: null, endDate: null })
    tx.projectMilestone.create.mockResolvedValue({ id: milestoneId })
    tx.projectMilestone.updateMany.mockResolvedValue({ count: 1 })
    tx.projectMilestone.findUniqueOrThrow.mockResolvedValue({
      id: milestoneId,
      status: 'IN_PROGRESS',
    })
  })

  it('gates both write routes with the milestones.manage permission', () => {
    for (const route of [
      MilestonesController.prototype.create,
      MilestonesController.prototype.update,
    ])
      expect(Reflect.getMetadata(PERMISSION_KEY, route)).toBe('milestones.manage')
  })

  it('denies create and update before any read when the grant is absent', async () => {
    state.actor = { ...manager, permissions: ['activities.read'] }
    await expect(service.createMilestone(manager, projectId, save)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      service.updateMilestone(manager, projectId, milestoneId, update),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.findFirst).not.toHaveBeenCalled()
    expect(tx.projectMilestone.create).not.toHaveBeenCalled()
    expect(tx.projectMilestone.updateMany).not.toHaveBeenCalled()
  })

  it('creates a scoped milestone with an audit entry', async () => {
    await service.createMilestone(manager, projectId, save)
    expect(tx.projectMilestone.create.mock.calls[0]?.[0].data).toMatchObject({
      organizationId,
      projectId,
      title: 'Baseline survey done',
    })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.action).toBe('MILESTONE_CREATED')
  })

  it('updates with the loaded revision and audits the new status', async () => {
    await service.updateMilestone(manager, projectId, milestoneId, update)
    expect(tx.projectMilestone.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      updatedAt: new Date(update.expectedUpdatedAt),
    })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
      action: 'MILESTONE_UPDATED',
      changes: { status: 'IN_PROGRESS' },
    })
  })

  it('rejects a stale revision and a completion without its date', async () => {
    tx.projectMilestone.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.updateMilestone(manager, projectId, milestoneId, update),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    await expect(
      service.updateMilestone(manager, projectId, milestoneId, { ...update, status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
