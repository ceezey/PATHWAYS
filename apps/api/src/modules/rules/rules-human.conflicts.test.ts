import 'reflect-metadata'

import type { ApplicationIdentity } from '@app/common/authz/application-identity'
import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'
import type { PrismaService } from '@app/prisma/prisma.service'
import { rolePermissions } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RulesHumanService } from './rules-human.service'

vi.mock('@app/common/authz/authorized-operation', () => ({ withAuthorizedOperation: vi.fn() }))

const id = '10000000-0000-4000-8000-000000000001'

function setup(failure: unknown) {
  const tx = { $queryRaw: vi.fn().mockRejectedValue(failure) }
  vi.mocked(withAuthorizedOperation).mockImplementation((async (_p, identity, _perm, fn) =>
    fn(tx as unknown as Prisma.TransactionClient, identity)) as typeof withAuthorizedOperation)
  const identity = {
    id,
    aal: 'aal2',
    userId: id,
    organizationId: id,
    fullName: 'Synthetic fixture',
    roles: ['PROGRAM_MANAGER'],
    permissions: [...rolePermissions.PROGRAM_MANAGER],
    assignedProjectIds: [id],
  } as ApplicationIdentity
  return { identity, service: new RulesHumanService({} as PrismaService) }
}

describe('rule conflict mapping', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    [
      'createRule',
      '42710',
      409,
      'Another rule already uses this code. Choose a different rule code.',
    ],
    [
      'activateRule',
      '54000',
      409,
      'This project already has 20 active rules. Deactivate one before activating another.',
    ],
    ['activateRule', '40001', 409, 'The resource changed. Reload before retrying.'],
    ['createRule', '54000', 503, 'Rules processing is temporarily unavailable.'],
    ['activateRule', '42710', 503, 'Rules processing is temporarily unavailable.'],
  ])('%s with SQLSTATE %s answers %i', async (method, code, status, message) => {
    const { identity, service } = setup(Object.assign(Error('db'), { meta: { code } }))
    const call =
      method === 'createRule'
        ? service.createRule(identity, {})
        : service.activateRule(identity, id, {})
    await expect(call).rejects.toMatchObject({ status, message })
  })
})
