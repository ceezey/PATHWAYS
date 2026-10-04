import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { AuthDirectoryService } from './auth-directory.service'
import { UsersService } from './users.service'

const state = vi.hoisted(() => ({ tx: {} as Record<string, unknown>, roles: ['PROGRAM_MANAGER'] }))

// The verified-transaction wrapper is replaced so the role checks run against a mocked tx.
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: (
    _prisma: unknown,
    identity: ApplicationIdentity,
    _permission: string,
    run: (tx: unknown, actor: ApplicationIdentity) => unknown,
  ) => run(state.tx, { ...identity, roles: state.roles }),
}))

const id = (n: number) => `75000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actorId = id(1)
const targetId = id(2)
const projectId = id(3)
const identity = {
  userId: actorId,
  organizationId: id(9),
  assignedProjectIds: [projectId],
} as unknown as ApplicationIdentity

const writes = [
  'systemUser.create',
  'systemUser.update',
  'userProjectAssignment.createMany',
  'userProjectAssignment.updateMany',
  'projectActivityAssignment.updateMany',
  'auditLog.create',
]

type Mock = ReturnType<typeof vi.fn>
type Tx = Record<string, Record<string, Mock>>

function buildTx(targetRole: string) {
  const fn = (value?: unknown) => vi.fn().mockResolvedValue(value)
  const tx = {
    systemUser: {
      findFirst: fn({
        id: targetId,
        role: { code: targetRole },
        userProjectAssignment_user: [],
      }),
      create: fn({ id: targetId }),
      update: fn({}),
      findUniqueOrThrow: fn({
        id: targetId,
        authUserId: id(7),
        fullName: 'Synthetic User',
        email: 'synthetic@example.invalid',
        accountStatus: 'ACTIVE',
        createdAt: new Date(),
        lastLoginAt: null,
        role: { code: targetRole, name: 'Role' },
        userProjectAssignment_user: [],
      }),
      count: fn(1),
    },
    userProjectAssignment: { count: fn(1), createMany: fn({}), updateMany: fn({}) },
    projectActivityAssignment: { updateMany: fn({}) },
    project: { findMany: fn([{ id: projectId }]) },
    role: { findFirst: fn({ id: id(5) }) },
    auditLog: { create: fn({}) },
  }
  state.tx = tx
  return tx as Tx
}

function writeCalls(tx: Tx) {
  return writes.filter((path) => {
    const [model, method] = path.split('.')
    return tx[model][method].mock.calls.length > 0
  })
}

const directory = { getExistingVerifiedIdentity: vi.fn() }
const service = new UsersService({} as PrismaService, directory as unknown as AuthDirectoryService)
const update = (userId: string, role: string) =>
  service.update(identity, userId, { role, accountStatus: 'ACTIVE', projectIds: [projectId] })
const authorize = (role: string) =>
  service.authorizeExisting(identity, {
    authUserId: id(7),
    fullName: 'Synthetic User',
    role,
    projectIds: [projectId],
  })

beforeEach(() => {
  directory.getExistingVerifiedIdentity
    .mockReset()
    .mockResolvedValue({ id: id(7), email: 'synthetic@example.invalid' })
})

describe('users service role scope (G-F1-5)', () => {
  it.each([
    ['PROGRAM_MANAGER', 'GRANT_MANAGER'],
    ['PROGRAM_MANAGER', 'SYSTEM_ADMINISTRATOR'],
    ['PROGRAM_MANAGER', 'PROGRAM_MANAGER'],
    ['PROGRAM_MANAGER', 'PROJECT_OFFICER'],
    ['PROJECT_MANAGER', 'PROJECT_MANAGER'],
    ['PROJECT_MANAGER', 'PROGRAM_MANAGER'],
    ['PROJECT_MANAGER', 'GRANT_MANAGER'],
    ['PROJECT_OFFICER', 'PROJECT_OFFICER'],
  ])('authorize-existing: %s cannot grant %s and nothing is written', async (actorRole, target) => {
    state.roles = [actorRole]
    const tx = buildTx('PROJECT_OFFICER')
    await expect(authorize(target)).rejects.toBeInstanceOf(ForbiddenException)
    expect(writeCalls(tx)).toEqual([])
  })

  it.each([
    ['PROGRAM_MANAGER', 'GRANT_MANAGER', 'PROJECT_MANAGER'],
    ['PROGRAM_MANAGER', 'PROJECT_MANAGER', 'GRANT_MANAGER'],
    ['PROGRAM_MANAGER', 'PROJECT_MANAGER', 'SYSTEM_ADMINISTRATOR'],
    ['PROJECT_MANAGER', 'PROJECT_OFFICER', 'PROJECT_MANAGER'],
    ['PROJECT_MANAGER', 'PROJECT_MANAGER', 'PROJECT_OFFICER'],
    ['PROJECT_MANAGER', 'PROGRAM_MANAGER', 'PROJECT_OFFICER'],
  ])(
    'update: %s cannot change a %s into %s and nothing is written',
    async (actorRole, current, next) => {
      state.roles = [actorRole]
      const tx = buildTx(current)
      await expect(update(targetId, next)).rejects.toBeInstanceOf(ForbiddenException)
      expect(writeCalls(tx)).toEqual([])
    },
  )

  it('authorize-existing: Admin assigns a Program Manager with projects', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROJECT_OFFICER')
    tx.systemUser.findFirst.mockResolvedValue(null)
    await authorize('PROGRAM_MANAGER')
    expect(tx.userProjectAssignment.createMany).toHaveBeenCalledTimes(1)
  })

  it('update: Admin saves a Program Manager with no projects and nothing is assigned', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROGRAM_MANAGER')
    await service.update(identity, targetId, {
      role: 'PROGRAM_MANAGER',
      accountStatus: 'ACTIVE',
      projectIds: [],
    })
    expect(tx.userProjectAssignment.createMany).not.toHaveBeenCalled()
    expect(tx.systemUser.update).toHaveBeenCalled()
  })

  it('update: Admin ends the explicit assignments of a Program Manager', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROGRAM_MANAGER')
    tx.systemUser.findFirst.mockResolvedValue({
      id: targetId,
      role: { code: 'PROGRAM_MANAGER' },
      userProjectAssignment_user: [{ id: id(4), projectId }],
    })
    await service.update(identity, targetId, {
      role: 'PROGRAM_MANAGER',
      accountStatus: 'ACTIVE',
      projectIds: [],
    })
    expect(tx.userProjectAssignment.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.userProjectAssignment.createMany).not.toHaveBeenCalled()
  })

  it('update: a Project Manager still needs at least one project', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    buildTx('PROJECT_MANAGER')
    await expect(
      service.update(identity, targetId, {
        role: 'PROJECT_MANAGER',
        accountStatus: 'ACTIVE',
        projectIds: [],
      }),
    ).rejects.toThrow('At least one project assignment is required.')
  })

  it('update: an actor cannot administer their own account', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROJECT_OFFICER')
    await expect(update(actorId.toUpperCase(), 'PROJECT_OFFICER')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(tx.systemUser.findFirst).not.toHaveBeenCalled()
    expect(writeCalls(tx)).toEqual([])
  })

  it('update: a cross-organization or out-of-scope target is unavailable and the lookup is scoped', async () => {
    state.roles = ['PROJECT_MANAGER']
    const tx = buildTx('PROJECT_OFFICER')
    tx.systemUser.findFirst.mockResolvedValue(null)
    await expect(update(targetId, 'PROJECT_OFFICER')).rejects.toBeInstanceOf(NotFoundException)
    const where = tx.systemUser.findFirst.mock.calls[0][0].where
    expect(where).toMatchObject({ id: targetId, organizationId: identity.organizationId })
    expect(where.userProjectAssignment_user.some.status).toBe('ACTIVE')
    expect(writeCalls(tx)).toEqual([])
  })

  it('update: a target also assigned outside the actor project scope is denied', async () => {
    state.roles = ['PROJECT_MANAGER']
    const tx = buildTx('PROJECT_OFFICER')
    tx.userProjectAssignment.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    await expect(update(targetId, 'PROJECT_OFFICER')).rejects.toBeInstanceOf(ForbiddenException)
    expect(writeCalls(tx)).toEqual([])
  })

  it.each([
    ['demote', 'PROJECT_OFFICER', 'ACTIVE'],
    ['deactivate', 'SYSTEM_ADMINISTRATOR', 'DEACTIVATED'],
  ] as const)(
    'update: the last active System Administrator cannot be %s',
    async (_name, role, status) => {
      state.roles = ['SYSTEM_ADMINISTRATOR']
      const tx = buildTx('SYSTEM_ADMINISTRATOR')
      tx.systemUser.count.mockResolvedValue(0)
      await expect(
        service.update(identity, targetId, {
          role,
          accountStatus: status,
          projectIds: [projectId],
        }),
      ).rejects.toThrow('The last active System Administrator cannot be changed.')
      expect(tx.systemUser.count.mock.calls[0][0].where).toMatchObject({
        organizationId: identity.organizationId,
        id: { not: targetId },
        accountStatus: 'ACTIVE',
        archivedAt: null,
      })
      expect(writeCalls(tx)).toEqual([])
    },
  )

  it('update: a System Administrator may be demoted when another active one exists', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('SYSTEM_ADMINISTRATOR')
    tx.systemUser.findUniqueOrThrow.mockResolvedValue({
      id: targetId,
      authUserId: null,
      fullName: 'Synthetic User',
      email: 'synthetic@example.invalid',
      accountStatus: 'ACTIVE',
      createdAt: new Date(0),
      lastLoginAt: null,
      role: { code: 'PROJECT_OFFICER', name: 'Project Officer' },
      userProjectAssignment_user: [],
    })
    await expect(update(targetId, 'PROJECT_OFFICER')).resolves.toMatchObject({ id: targetId })
    expect(tx.systemUser.update).toHaveBeenCalledTimes(1)
  })

  it('update: the last-administrator check does not apply to non-administrator targets', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROJECT_OFFICER')
    tx.systemUser.count.mockResolvedValue(0)
    tx.systemUser.findUniqueOrThrow.mockResolvedValue({
      id: targetId,
      authUserId: null,
      fullName: 'Synthetic User',
      email: 'synthetic@example.invalid',
      accountStatus: 'ACTIVE',
      createdAt: new Date(0),
      lastLoginAt: null,
      role: { code: 'PROJECT_MANAGER', name: 'Project Manager' },
      userProjectAssignment_user: [],
    })
    await update(targetId, 'PROJECT_MANAGER')
    expect(tx.systemUser.count).not.toHaveBeenCalled()
    expect(tx.systemUser.update).toHaveBeenCalledTimes(1)
  })

  it('update: a malformed user id is unavailable before any lookup', async () => {
    state.roles = ['SYSTEM_ADMINISTRATOR']
    const tx = buildTx('PROJECT_OFFICER')
    await expect(update('not-a-uuid', 'PROJECT_OFFICER')).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.systemUser.findFirst).not.toHaveBeenCalled()
  })

  it('update: a Project Manager may change a Project Officer in scope and an audit row is written', async () => {
    state.roles = ['PROJECT_MANAGER']
    const tx = buildTx('PROJECT_OFFICER')
    tx.systemUser.findUniqueOrThrow.mockResolvedValue({
      id: targetId,
      authUserId: null,
      fullName: 'Synthetic User',
      email: 'synthetic@example.invalid',
      accountStatus: 'ACTIVE',
      createdAt: new Date(0),
      lastLoginAt: null,
      role: { code: 'PROJECT_OFFICER', name: 'Project Officer' },
      userProjectAssignment_user: [],
    })
    await expect(update(targetId, 'PROJECT_OFFICER')).resolves.toMatchObject({ id: targetId })
    expect(tx.systemUser.update).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'USER_AUTHORIZATION_UPDATED',
      actorUserId: actorId,
      entityId: targetId,
    })
  })
})
