import { BadRequestException, type HttpException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import type { StepUpPinActor } from './beneficiary-step-up-pin.service'
import { OwnAccountService } from './own-account.service'
import type { PasswordRecoveryService } from './password-recovery.service'

const state = vi.hoisted(() => ({
  permission: undefined as string | undefined,
  options: undefined as unknown,
  operations: 0,
}))
const tx = { auditLog: { create: vi.fn() } }
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    caller: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
    options?: unknown,
  ) => {
    state.permission = permission
    state.options = options
    state.operations += 1
    return work(tx, caller)
  },
}))

const ORG = '10000000-0000-4000-8000-000000000001'
const USER = '30000000-0000-4000-8000-000000000003'
const AUTH = '30000000-0000-4000-8000-000000000004'
const GOOD = 'Str0ng!Passw0rd#1'
const identity: ApplicationIdentity = {
  id: AUTH,
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
    state.options = undefined
    state.operations = 0
  })

  it('writes one SIGNED_OUT row for the verified actor', async () => {
    await new OwnAccountService({} as PrismaService, {} as PasswordRecoveryService).recordSignOut(
      identity,
    )
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

describe('own password change', () => {
  const recovery = { setPassword: vi.fn() }
  const service = () =>
    new OwnAccountService({} as PrismaService, recovery as unknown as PasswordRecoveryService)
  const actorWith = (mfaVerifiedAt: number | undefined): StepUpPinActor => ({
    auth: { id: AUTH, aal: 'aal2', mfaVerifiedAt } as StepUpPinActor['auth'],
    profile: identity,
    sessionId: '30000000-0000-4000-8000-000000000005',
  })

  beforeEach(() => {
    vi.clearAllMocks()
    state.operations = 0
    state.options = undefined
    recovery.setPassword.mockReset().mockResolvedValue(undefined)
  })

  it('refuses a stale or missing authenticator step before any change', async () => {
    for (const at of [undefined, Date.now() / 1000 - 16 * 60]) {
      const error = await service()
        .changePassword(actorWith(at), GOOD)
        .catch((e: unknown) => e)
      expect((error as HttpException).getStatus()).toBe(403)
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'STEP_UP_TOTP_REQUIRED',
      })
    }
    expect(state.operations).toBe(0)
    expect(recovery.setPassword).not.toHaveBeenCalled()
  })

  it('writes OWN_PASSWORD_CHANGED, then sets the password of the caller only', async () => {
    await service().changePassword(actorWith(Date.now() / 1000 - 60), GOOD)
    expect(state.permission).toBe('profile.manage')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorUserId: USER,
        action: 'OWN_PASSWORD_CHANGED',
        entityType: 'Authentication',
        entityId: USER,
      },
    })
    expect(recovery.setPassword).toHaveBeenCalledWith(AUTH, GOOD)
    expect(tx.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      recovery.setPassword.mock.invocationCallOrder[0] ?? 0,
    )
    expect(state.options).toEqual({ transactionTimeoutMs: 15_000 })
  })

  it('passes an Auth refusal through as 400', async () => {
    recovery.setPassword.mockRejectedValue(new BadRequestException('The password was not changed.'))
    await expect(
      service().changePassword(actorWith(Date.now() / 1000), GOOD),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
