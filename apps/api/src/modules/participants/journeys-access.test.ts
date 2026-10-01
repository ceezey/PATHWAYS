import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hasAtomicPermission } from '@app/modules/auth/authorization-policy'
import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({ tx: undefined as Prisma.TransactionClient | undefined }))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, identity, permission, work) => {
    if (!hasAtomicPermission(identity.roles[0], identity.permissions, permission))
      throw new ForbiddenException('Permission denied.')
    return work(state.tx, identity)
  }),
}))

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
  project: { findFirst: vi.fn() },
  journeyStage: { findMany: vi.fn() },
}
const service = new ParticipantsService({} as PrismaService)

beforeEach(() => {
  vi.clearAllMocks()
  state.tx = tx as unknown as Prisma.TransactionClient
  tx.project.findFirst.mockResolvedValue({ id: projectId })
  tx.journeyStage.findMany.mockResolvedValue([])
})

describe('journey read access after the aggregate-only System Administrator change', () => {
  it('returns 403 for System Administrator even when the profile claims journeys.read', async () => {
    for (const permissions of [[], ['journeys.read'], ['journeys.read', 'journeys.manage']]) {
      await expect(
        service.listStages(identity('SYSTEM_ADMINISTRATOR', permissions), projectId),
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        service.history(
          identity('SYSTEM_ADMINISTRATOR', permissions),
          projectId,
          '30000000-0000-4000-8000-00000000000a',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
    expect(tx.journeyStage.findMany).not.toHaveBeenCalled()
  })

  it('still lets a Project Manager with the grant read stages', async () => {
    await expect(
      service.listStages(identity('PROJECT_MANAGER', ['journeys.read']), projectId),
    ).resolves.toEqual([])
  })
})
