import 'reflect-metadata'

import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({ tx: undefined as Prisma.TransactionClient | undefined }))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, identity, permission, work, options) => {
    const allowed = [permission, ...(options?.alsoAllow ?? [])]
    if (!allowed.some((code) => hasAtomicPermission(identity.roles[0], identity.permissions, code)))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, identity)
  }),
}))

import { BeneficiaryJourneyController, JourneyStagesController } from './participants.controller'
import { ParticipantsService } from './participants.service'

const projectId = '20000000-0000-4000-8000-000000000002'
const identity = (role: string, permissions: string[]): ApplicationIdentity => ({
  id: '60000000-0000-4000-8000-000000000006',
  aal: 'aal2',
  userId: '70000000-0000-4000-8000-000000000007',
  organizationId: '10000000-0000-4000-8000-000000000001',
  fullName: 'Synthetic actor',
  roles: [role],
  permissions,
  assignedProjectIds: [projectId],
})

const tx = {
  $queryRaw: vi.fn(),
  projectActivity: { findMany: vi.fn().mockResolvedValue([]) },
  project: { findFirst: vi.fn() },
  journeyStage: { findMany: vi.fn() },
}
const service = new ParticipantsService({} as PrismaService)

beforeEach(() => {
  vi.clearAllMocks()
  tx.projectActivity.findMany.mockResolvedValue([])
  state.tx = tx as unknown as Prisma.TransactionClient
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.journeyStage.findMany.mockResolvedValue([])
})

describe('journey access split after the aggregate-only System Administrator change', () => {
  it('lets System Administrator list and save project-level stages with journeys.manage', async () => {
    const admin = identity('SYSTEM_ADMINISTRATOR', ['journeys.manage'])
    await expect(service.listStages(admin, projectId)).resolves.toEqual([])
    tx.$queryRaw.mockResolvedValue([{ inUse: true }])
    await expect(service.saveStages(admin, projectId, { stages: [] })).resolves.toEqual([])
  })

  it('returns 403 for System Administrator beneficiary journey history, even with a claimed permission', async () => {
    for (const permissions of [[], ['journeys.read'], ['journeys.read', 'journeys.manage']]) {
      await expect(
        service.history(
          identity('SYSTEM_ADMINISTRATOR', permissions),
          projectId,
          '30000000-0000-4000-8000-00000000000a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
  })

  it('denies stage listing to a System Administrator holding only a claimed journeys.read', async () => {
    await expect(
      service.listStages(identity('SYSTEM_ADMINISTRATOR', ['journeys.read']), projectId),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.journeyStage.findMany).not.toHaveBeenCalled()
  })

  it('still lets a Project Manager with the grant read stages', async () => {
    await expect(
      service.listStages(identity('PROJECT_MANAGER', ['journeys.read']), projectId),
    ).resolves.toEqual([])
  })

  it('declares both permissions on the stage list route and only journeys.read on history', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, JourneyStagesController.prototype.list)).toEqual([
      'journeys.read',
      'journeys.manage',
    ])
    expect(
      Reflect.getMetadata(PERMISSION_KEY, BeneficiaryJourneyController.prototype.history),
    ).toBe('journeys.read')
  })
})
