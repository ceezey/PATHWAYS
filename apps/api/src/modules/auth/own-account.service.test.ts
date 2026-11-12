import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import { OwnAccountService } from './own-account.service'

const state = vi.hoisted(() => ({ permission: undefined as string | undefined }))
const tx = { auditLog: { create: vi.fn() } }
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    caller: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    state.permission = permission
    return work(tx, caller)
  },
}))

const ORG = '10000000-0000-4000-8000-000000000001'
const USER = '30000000-0000-4000-8000-000000000003'
const identity: ApplicationIdentity = {
  id: USER,
  userId: USER,
  organizationId: ORG,
  aal: 'aal2',
  fullName: 'Fictional signed-in user',
  roles: ['PROJECT_MANAGER'],
  permissions: ['profile.manage'],
  assignedProjectIds: [],
}

describe('own account sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permission = undefined
  })

  it('writes one SIGNED_OUT row for the verified actor', async () => {
    await new OwnAccountService({} as PrismaService).recordSignOut(identity)
    expect(state.permission).toBe('profile.manage')
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorUserId: USER,
        action: 'SIGNED_OUT',
        entityType: 'Authentication',
        entityId: USER,
      },
    })
  })
})
