import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { ApplicationProfileService } from './application-profile.service'

const subject = 'a5000000-0000-4000-8000-000000000001'
const organizationId = 'a5000000-0000-4000-8000-000000000002'
const userId = 'a5000000-0000-4000-8000-000000000003'
const projectId = 'a5000000-0000-4000-8000-000000000004'

function setup() {
  const profile = {
    id: userId,
    organizationId,
    fullName: 'Synthetic application user',
    role: {
      code: 'PROJECT_OFFICER',
      rolePermissions: [{ permission: { code: 'PROJECT_READ' } }],
    },
  }
  const transaction = {
    systemUser: { findFirst: vi.fn().mockResolvedValue(profile) },
    userProjectAssignment: { findMany: vi.fn().mockResolvedValue([{ projectId }]) },
  }
  const withVerifiedContext = vi.fn(
    async (_context: unknown, callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      callback(transaction as unknown as Prisma.TransactionClient),
  )
  const service = new ApplicationProfileService({ withVerifiedContext } as unknown as PrismaService)
  return { service, transaction, withVerifiedContext, profile }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ApplicationProfileService', () => {
  it.each([
    [undefined, userId],
    [organizationId, undefined],
    ['', userId],
    ['not-a-uuid', userId],
    [organizationId, 'not-a-uuid'],
    [[organizationId], userId],
    [organizationId, [userId]],
    [{ id: organizationId }, userId],
  ])('rejects malformed selectors before database access (%j, %j)', async (org, user) => {
    const { service, withVerifiedContext } = setup()
    await expect(service.resolve(subject, org, user)).rejects.toBeInstanceOf(ForbiddenException)
    expect(withVerifiedContext).not.toHaveBeenCalled()
  })

  it('binds all three identifiers and requires a current active database profile', async () => {
    const { service, transaction, withVerifiedContext } = setup()
    await service.resolve(subject, organizationId.toUpperCase(), userId.toUpperCase())
    expect(withVerifiedContext).toHaveBeenCalledWith(
      { authSubject: subject, organizationId, userId },
      expect.any(Function),
    )
    expect(transaction.systemUser.findFirst).toHaveBeenCalledWith({
      where: {
        id: userId,
        authUserId: subject,
        organizationId,
        accountStatus: 'ACTIVE',
        archivedAt: null,
        organization: { status: 'ACTIVE', archivedAt: null },
        role: { isActive: true },
      },
      select: {
        id: true,
        organizationId: true,
        fullName: true,
        role: {
          select: {
            code: true,
            rolePermissions: {
              where: { permission: { isActive: true } },
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
    })
  })

  it('requires active, started, unended assignments to unarchived same-organization projects', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-09-05T12:00:00.000Z')
    vi.setSystemTime(now)
    const { service, transaction } = setup()
    await service.resolve(subject, organizationId, userId)
    expect(transaction.userProjectAssignment.findMany).toHaveBeenCalledWith({
      where: {
        organizationId,
        userId,
        status: 'ACTIVE',
        endedAt: null,
        assignedAt: { lte: now },
        project: { organizationId, archivedAt: null },
      },
      select: { projectId: true },
    })
  })

  it('returns only database authority, without merging token or profile metadata', async () => {
    const { service, transaction, profile } = setup()
    transaction.systemUser.findFirst.mockResolvedValue({
      ...profile,
      app_metadata: { roles: ['SYSTEM_ADMINISTRATOR'], permissions: ['EVERYTHING'] },
      user_metadata: { organizationId: 'attacker-controlled', assignedProjectIds: ['other'] },
    })
    transaction.userProjectAssignment.findMany.mockResolvedValue([{ projectId }, { projectId }])
    await expect(service.resolve(subject, organizationId, userId)).resolves.toEqual({
      id: subject,
      aal: 'aal2',
      userId,
      organizationId,
      fullName: 'Synthetic application user',
      roles: ['PROJECT_OFFICER'],
      permissions: ['PROJECT_READ'],
      assignedProjectIds: [projectId],
    })
  })

  it('does not invent permission or assignment grants for an empty database result', async () => {
    const { service, transaction, profile } = setup()
    transaction.systemUser.findFirst.mockResolvedValue({
      ...profile,
      role: { code: 'SYSTEM_ADMINISTRATOR', rolePermissions: [] },
    })
    transaction.userProjectAssignment.findMany.mockResolvedValue([])
    await expect(service.resolve(subject, organizationId, userId)).resolves.toMatchObject({
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: [],
      assignedProjectIds: [],
    })
  })

  it.each([null, { code: 'UNKNOWN_ROLE', rolePermissions: [] }])(
    'denies missing profiles and non-canonical database roles',
    async (role) => {
      const { service, transaction, profile } = setup()
      transaction.systemUser.findFirst.mockResolvedValue(role ? { ...profile, role } : null)
      await expect(service.resolve(subject, organizationId, userId)).rejects.toThrow(
        'Application access is unavailable for this identity and context.',
      )
      expect(transaction.userProjectAssignment.findMany).not.toHaveBeenCalled()
    },
  )

  it('sanitizes context, profile, and assignment failures without returning partial authority', async () => {
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    for (const stage of ['context', 'profile', 'assignments']) {
      const { service, transaction, withVerifiedContext } = setup()
      const error = new Error('Synthetic sensitive provider diagnostics must not be returned')
      if (stage === 'context') withVerifiedContext.mockRejectedValue(error)
      if (stage === 'profile') transaction.systemUser.findFirst.mockRejectedValue(error)
      if (stage === 'assignments')
        transaction.userProjectAssignment.findMany.mockRejectedValue(error)
      await expect(service.resolve(subject, organizationId, userId)).rejects.toThrow(
        /^Application access is unavailable for this identity and context\.$/,
      )
    }
    expect(warning.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        {
          event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
          reason: 'CONTEXT_OR_PROFILE_UNAVAILABLE',
        },
      ]),
    )
  })

  it('records only a recognized Prisma code, never provider diagnostics', async () => {
    const { service, withVerifiedContext } = setup()
    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    withVerifiedContext.mockRejectedValue({
      code: 'P2028',
      message: 'private-database-detail',
      meta: { query: 'private-sql' },
    })
    await expect(service.resolve(subject, organizationId, userId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(warning).toHaveBeenCalledExactlyOnceWith({
      event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
      reason: 'P2028',
    })
    withVerifiedContext.mockRejectedValue({ code: 'private-unrecognized-code' })
    await expect(service.resolve(subject, organizationId, userId)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(warning).toHaveBeenLastCalledWith({
      event: 'PATHWAYS_PROFILE_LOOKUP_DENIED',
      reason: 'CONTEXT_OR_PROFILE_UNAVAILABLE',
    })
  })
})
