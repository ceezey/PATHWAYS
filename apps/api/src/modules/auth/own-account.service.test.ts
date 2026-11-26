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
const tx = { auditLog: { create: vi.fn() }, $queryRaw: vi.fn() }
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
const SESSION = '30000000-0000-4000-8000-000000000005'
const OTHER = '30000000-0000-4000-8000-000000000006'
const GOOD = 'Str0ng!Passw0rd#1'
const TOKEN = 'caller.access.token'
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

const actor: StepUpPinActor = {
  auth: { id: AUTH, aal: 'aal2' } as StepUpPinActor['auth'],
  profile: identity,
  sessionId: SESSION,
}
const freshActor: StepUpPinActor = {
  ...actor,
  auth: { id: AUTH, aal: 'aal2', mfaVerifiedAt: Date.now() / 1000 - 60 } as StepUpPinActor['auth'],
}
// The values of the one app_session_end call: subject, target, keep, reason.
const sessionCall = () => tx.$queryRaw.mock.calls[0]?.slice(1)
const service = () => new OwnAccountService({} as PrismaService, {} as PasswordRecoveryService)

describe('own account sign-out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permission = undefined
    state.options = undefined
    state.operations = 0
    tx.$queryRaw.mockResolvedValue([{ n: 1 }])
  })

  it('ends the current session and writes one SIGNED_OUT row for the verified actor', async () => {
    await service().recordSignOut(actor)
    expect(state.permission).toBe('profile.manage')
    expect(sessionCall()).toEqual([AUTH, SESSION, null, 'SIGNED_OUT'])
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

describe('own sessions', () => {
  const recovery = { revokeOtherSessions: vi.fn() }
  const sessionService = () =>
    new OwnAccountService({} as PrismaService, recovery as unknown as PasswordRecoveryService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.operations = 0
    state.options = undefined
    recovery.revokeOtherSessions.mockReset().mockResolvedValue(undefined)
    tx.$queryRaw.mockResolvedValue([{ n: 2 }])
  })

  it('refuses to end sessions without a fresh authenticator step, before any database work', async () => {
    for (const run of [
      () => sessionService().endSession(actor, OTHER),
      () => sessionService().endOtherSessions(actor, TOKEN),
    ]) {
      const error = await run().catch((e: unknown) => e)
      expect((error as HttpException).getStatus()).toBe(403)
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'STEP_UP_TOTP_REQUIRED',
      })
    }
    expect(state.operations).toBe(0)
    expect(recovery.revokeOtherSessions).not.toHaveBeenCalled()
  })

  it('ends one own session and audits it', async () => {
    await sessionService().endSession(freshActor, OTHER.toUpperCase())
    expect(sessionCall()).toEqual([AUTH, OTHER, null, 'USER'])
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SESSION_ENDED', entityId: USER }),
    })
  })

  it('answers 404 without an audit row when no open session of the caller matches', async () => {
    tx.$queryRaw.mockResolvedValue([{ n: 0 }])
    await expect(sessionService().endSession(freshActor, OTHER)).rejects.toMatchObject({
      status: 404,
    })
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('refuses a malformed session id before any database work', async () => {
    await expect(sessionService().endSession(freshActor, 'not-a-uuid')).rejects.toMatchObject({
      status: 404,
    })
    expect(state.operations).toBe(0)
  })

  it('ends every other session, audits it, then revokes the other Supabase sessions in the same transaction', async () => {
    await expect(sessionService().endOtherSessions(freshActor, TOKEN)).resolves.toEqual({
      sessionsEnded: 2,
    })
    expect(sessionCall()).toEqual([AUTH, null, SESSION, 'USER'])
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'OTHER_SESSIONS_ENDED',
        changes: { sessionsEnded: 2 },
      }),
    })
    expect(recovery.revokeOtherSessions).toHaveBeenCalledExactlyOnceWith(TOKEN)
    expect(tx.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      recovery.revokeOtherSessions.mock.invocationCallOrder[0] ?? 0,
    )
    expect(state.options).toEqual({ transactionTimeoutMs: 15_000 })
  })

  it('fails, so the transaction rolls back, when Supabase refuses to revoke the other sessions', async () => {
    recovery.revokeOtherSessions.mockRejectedValue(new Error('refused'))
    await expect(sessionService().endOtherSessions(freshActor, TOKEN)).rejects.toThrow('refused')
  })
})

describe('own password change', () => {
  const recovery = { setPassword: vi.fn(), revokeOtherSessions: vi.fn() }
  const passwordService = () =>
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
    recovery.revokeOtherSessions.mockReset().mockResolvedValue(undefined)
    tx.$queryRaw.mockResolvedValue([{ n: 2 }])
  })

  it('refuses a stale or missing authenticator step before any change', async () => {
    for (const at of [undefined, Date.now() / 1000 - 16 * 60]) {
      const error = await passwordService()
        .changePassword(actorWith(at), GOOD, TOKEN)
        .catch((e: unknown) => e)
      expect((error as HttpException).getStatus()).toBe(403)
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'STEP_UP_TOTP_REQUIRED',
      })
    }
    expect(state.operations).toBe(0)
    expect(recovery.setPassword).not.toHaveBeenCalled()
  })

  it('ends the other sessions, writes OWN_PASSWORD_CHANGED, then sets the password of the caller only', async () => {
    await passwordService().changePassword(actorWith(Date.now() / 1000 - 60), GOOD, TOKEN)
    expect(state.permission).toBe('profile.manage')
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorUserId: USER,
        action: 'OWN_PASSWORD_CHANGED',
        entityType: 'Authentication',
        entityId: USER,
        changes: { sessionsEnded: 2 },
      },
    })
    expect(sessionCall()).toEqual([AUTH, null, SESSION, 'PASSWORD_CHANGED'])
    expect(recovery.setPassword).toHaveBeenCalledWith(AUTH, GOOD)
    expect(tx.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      recovery.setPassword.mock.invocationCallOrder[0] ?? 0,
    )
    expect(state.options).toEqual({ transactionTimeoutMs: 15_000 })
    expect(recovery.revokeOtherSessions).toHaveBeenCalledExactlyOnceWith(TOKEN)
    expect(recovery.setPassword.mock.invocationCallOrder[0]).toBeLessThan(
      recovery.revokeOtherSessions.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('keeps the changed password when revoking the other Supabase sessions fails', async () => {
    recovery.revokeOtherSessions.mockRejectedValue(new Error('refused'))
    await expect(
      passwordService().changePassword(actorWith(Date.now() / 1000), GOOD, TOKEN),
    ).resolves.toBeUndefined()
  })

  it('passes an Auth refusal through as 400', async () => {
    recovery.setPassword.mockRejectedValue(new BadRequestException('The password was not changed.'))
    await expect(
      passwordService().changePassword(actorWith(Date.now() / 1000), GOOD, TOKEN),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(recovery.revokeOtherSessions).not.toHaveBeenCalled()
  })
})
