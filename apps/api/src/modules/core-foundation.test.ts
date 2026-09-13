import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../prisma/prisma.service'
import type { ApplicationIdentity } from './auth/developer-access'
import { ProgramsService } from './programs/programs.service'
import { ProjectsService } from './projects/projects.service'
import type { AuthDirectoryService } from './users/auth-directory.service'
import { UsersService } from './users/users.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))
vi.mock('./auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

const organizationId = '10000000-0000-4000-8000-000000000001'
const actorId = '20000000-0000-4000-8000-000000000002'
const projectId = '30000000-0000-4000-8000-000000000003'
const targetId = '40000000-0000-4000-8000-000000000004'
const authId = '50000000-0000-4000-8000-000000000005'
const roleId = '60000000-0000-4000-8000-000000000006'

const actor = (role: string, assignedProjectIds: string[] = []): ApplicationIdentity => ({
  id: authId,
  aal: 'aal2',
  userId: actorId,
  organizationId,
  fullName: 'Synthetic actor',
  roles: [role],
  permissions: ['projects.read', 'projects.create', 'users.authorize'],
  assignedProjectIds,
})

describe('P01 workspace and project services', () => {
  const now = new Date('2026-09-13T00:00:00.000Z')
  const userRow = {
    id: targetId,
    authUserId: authId,
    fullName: 'Synthetic target',
    email: 'synthetic@example.invalid',
    accountStatus: 'ACTIVE',
    createdAt: now,
    lastLoginAt: null,
    role: { code: 'GRANT_MANAGER', name: 'Grant Manager' },
    userProjectAssignment_user: [],
  }
  const tx = {
    systemUser: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    program: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    userProjectAssignment: {
      create: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  }
  const prisma = {} as PrismaService
  const authDirectory = { getExistingVerifiedIdentity: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx as unknown as Prisma.TransactionClient
    state.actor = actor('SYSTEM_ADMINISTRATOR')
    authDirectory.getExistingVerifiedIdentity.mockResolvedValue({
      id: authId,
      email: userRow.email,
    })
    tx.systemUser.findFirst.mockResolvedValue(null)
    tx.systemUser.create.mockResolvedValue({ id: targetId })
    tx.systemUser.findUniqueOrThrow.mockResolvedValue(userRow)
    tx.role.findFirst.mockResolvedValue({ id: roleId })
    tx.project.findMany.mockResolvedValue([])
    tx.userProjectAssignment.count.mockResolvedValue(0)
  })

  it('links an existing verified Auth identity to a permitted six-role profile and audits atomically', async () => {
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    const result = await service.authorizeExisting(actor('SYSTEM_ADMINISTRATOR'), {
      authUserId: authId,
      fullName: 'Synthetic target',
      role: 'GRANT_MANAGER',
      projectIds: [],
    })
    expect(result.roleCode).toBe('GRANT_MANAGER')
    expect(tx.systemUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId, roleId, authUserId: authId }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_AUTHORIZED',
          changes: { role: 'GRANT_MANAGER', projectCount: 0 },
        }),
      }),
    )
  })

  it('denies Program Manager escalation to Grant Manager before writing a profile', async () => {
    state.actor = actor('PROGRAM_MANAGER')
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    await expect(
      service.authorizeExisting(state.actor, {
        authUserId: authId,
        fullName: 'Synthetic',
        role: 'GRANT_MANAGER',
        projectIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.systemUser.create).not.toHaveBeenCalled()
  })

  it('denies an out-of-scope project assignment without leaking which project failed', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    await expect(
      service.authorizeExisting(state.actor, {
        authUserId: authId,
        fullName: 'Synthetic',
        role: 'PROJECT_OFFICER',
        projectIds: [targetId],
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.userProjectAssignment.createMany).not.toHaveBeenCalled()
  })

  it('scopes manageable-user rows and nested assignments in PostgreSQL before returning them', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.systemUser.findMany.mockResolvedValue([])
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    await service.list(state.actor)
    expect(tx.systemUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId,
          role: {
            code: {
              in: ['MONITORING_AND_EVALUATION_OFFICER', 'PROJECT_OFFICER'],
            },
            isActive: true,
          },
          userProjectAssignment_user: {
            some: expect.objectContaining({
              project: { organizationId, archivedAt: null, id: { in: [projectId] } },
            }),
          },
        }),
        select: expect.objectContaining({
          userProjectAssignment_user: expect.objectContaining({
            where: expect.objectContaining({
              project: { organizationId, archivedAt: null, id: { in: [projectId] } },
            }),
          }),
        }),
      }),
    )
  })

  it('rejects self-administration before account or assignment mutation', async () => {
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    await expect(
      service.update(state.actor as ApplicationIdentity, actorId, {
        role: 'SYSTEM_ADMINISTRATOR',
        accountStatus: 'ACTIVE',
        projectIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.systemUser.update).not.toHaveBeenCalled()
    expect(tx.userProjectAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('rejects global account mutation when any active assignment is outside actor scope', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.systemUser.findFirst.mockResolvedValue({
      id: targetId,
      role: { code: 'PROJECT_OFFICER' },
      userProjectAssignment_user: [{ id: roleId, projectId }],
    })
    tx.userProjectAssignment.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)
    await expect(
      service.update(state.actor, targetId, {
        role: 'PROJECT_OFFICER',
        accountStatus: 'DEACTIVATED',
        projectIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.systemUser.update).not.toHaveBeenCalled()
    expect(tx.userProjectAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('creates a scoped project, assigns its Project Manager, and records a redacted audit event', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.create.mockResolvedValue({ id: targetId })
    tx.project.findUniqueOrThrow.mockResolvedValue({
      id: targetId,
      code: 'PRJ-001',
      title: 'Synthetic project',
      description: null,
      objectives: null,
      implementationArea: null,
      startDate: null,
      endDate: null,
      status: 'PLANNED',
      programId: null,
      updatedAt: now,
      userProjectAssignment_project: [{ user: { fullName: 'Synthetic actor' } }],
    })
    const service = new ProjectsService(prisma)
    await service.create(state.actor, {
      code: 'PRJ-001',
      title: 'Synthetic project',
      status: 'PLANNED',
    })
    expect(tx.userProjectAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: targetId, userId: actorId }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_CREATED',
          changes: { code: 'PRJ-001', status: 'PLANNED' },
        }),
      }),
    )
  })

  it('rejects a stale project update before mutation', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.findFirst.mockResolvedValue({ id: projectId, updatedAt: now })
    const service = new ProjectsService(prisma)
    await expect(
      service.update(state.actor, projectId, {
        code: 'PRJ-001',
        title: 'Synthetic project',
        status: 'ONGOING',
        expectedUpdatedAt: '2026-09-12T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.project.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a nested program from another organization before updating a project', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.findFirst.mockResolvedValue({ id: projectId, updatedAt: now })
    tx.program.findFirst.mockResolvedValue(null)
    const service = new ProjectsService(prisma)
    await expect(
      service.update(state.actor, projectId, {
        code: 'PRJ-001',
        title: 'Synthetic project',
        status: 'ONGOING',
        programId: targetId,
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.program.findFirst).toHaveBeenCalledWith({
      where: { id: targetId, organizationId, archivedAt: null },
      select: { id: true },
    })
    expect(tx.project.updateMany).not.toHaveBeenCalled()
  })

  it('keeps program creation restricted to System Administrator', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    const service = new ProgramsService(prisma)
    await expect(
      service.create(state.actor, { code: 'PGM-01', name: 'Synthetic program', status: 'PLANNED' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.program.create).not.toHaveBeenCalled()
  })
})
