import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
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
  operationOptions: [] as unknown[],
}))
vi.mock('./auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work, options) => {
    state.operationOptions.push(options)
    return work(state.tx, state.actor)
  }),
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
    projectActivityAssignment: {
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  }
  const prisma = {} as PrismaService
  const authDirectory = { getExistingVerifiedIdentity: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    state.operationOptions = []
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
    const createInput = tx.systemUser.create.mock.calls[0]?.[0] as {
      data: { invitedAt: Date; activatedAt: Date }
    }
    expect(createInput.data.invitedAt).toBeInstanceOf(Date)
    expect(createInput.data.activatedAt).toBeInstanceOf(Date)
    expect(createInput.data.activatedAt.getTime()).toBe(createInput.data.invitedAt.getTime())
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'USER_AUTHORIZED',
          changes: { role: 'GRANT_MANAGER', projectCount: 0 },
        }),
      }),
    )
    expect(state.operationOptions).toEqual([{ transactionTimeoutMs: 20_000 }])
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
    expect(state.operationOptions).toEqual([undefined])
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
    expect(state.operationOptions).toEqual([{ transactionTimeoutMs: 20_000 }])
  })

  it('ends active activity assignments before ending a revoked project assignment', async () => {
    const projectAssignmentId = '70000000-0000-4000-8000-000000000007'
    const replacementProjectId = '80000000-0000-4000-8000-000000000008'

    tx.systemUser.findFirst.mockResolvedValue({
      id: targetId,
      role: { code: 'PROJECT_OFFICER' },
      userProjectAssignment_user: [{ id: projectAssignmentId, projectId }],
    })

    tx.project.findMany.mockResolvedValue([{ id: replacementProjectId }])

    tx.projectActivityAssignment.updateMany.mockResolvedValue({ count: 2 })

    tx.userProjectAssignment.updateMany.mockImplementation(async () => {
      expect(tx.projectActivityAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          projectAssignmentId: { in: [projectAssignmentId] },
          status: 'ACTIVE',
        },
        data: {
          status: 'REMOVED',
          endedAt: expect.any(Date),
          endReason: 'Project assignment ended.',
        },
      })

      return { count: 1 }
    })

    tx.userProjectAssignment.createMany.mockResolvedValue({ count: 1 })

    tx.systemUser.findUniqueOrThrow.mockResolvedValue({
      ...userRow,
      role: {
        code: 'PROJECT_OFFICER',
        name: 'Project Officer',
      },
      userProjectAssignment_user: [
        {
          projectId: replacementProjectId,
          project: { title: 'Replacement Project' },
        },
      ],
    })

    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)

    const result = await service.update(state.actor as ApplicationIdentity, targetId, {
      role: 'PROJECT_OFFICER',
      accountStatus: 'ACTIVE',
      projectIds: [replacementProjectId],
    })

    expect(tx.userProjectAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [projectAssignmentId] },
        organizationId,
        status: 'ACTIVE',
      },
      data: {
        status: 'ENDED',
        endedAt: expect.any(Date),
        endReason: 'Account authorization updated',
      },
    })

    expect(tx.userProjectAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId,
          projectId: replacementProjectId,
          userId: targetId,
          assignedById: actorId,
        },
      ],
    })

    expect(result.projectIds).toEqual([replacementProjectId])
  })

  it('reactivates a project-scoped profile before recreating active project membership', async () => {
    tx.systemUser.findFirst.mockResolvedValue({
      id: targetId,
      role: { code: 'PROJECT_OFFICER' },
      userProjectAssignment_user: [],
    })

    tx.project.findMany.mockResolvedValue([{ id: projectId }])

    tx.userProjectAssignment.createMany.mockImplementation(async () => {
      expect(tx.systemUser.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: expect.objectContaining({
          roleId,
          accountStatus: 'ACTIVE',
          activatedAt: expect.any(Date),
          deactivatedAt: null,
        }),
      })

      return { count: 1 }
    })

    tx.systemUser.findUniqueOrThrow.mockResolvedValue({
      ...userRow,
      accountStatus: 'ACTIVE',
      role: {
        code: 'PROJECT_OFFICER',
        name: 'Project Officer',
      },
      userProjectAssignment_user: [
        {
          projectId,
          project: { title: 'Synthetic project' },
        },
      ],
    })

    const service = new UsersService(prisma, authDirectory as unknown as AuthDirectoryService)

    const result = await service.update(state.actor as ApplicationIdentity, targetId, {
      role: 'PROJECT_OFFICER',
      accountStatus: 'ACTIVE',
      projectIds: [projectId],
    })

    expect(tx.userProjectAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId,
          projectId,
          userId: targetId,
          assignedById: actorId,
        },
      ],
    })

    expect(result.projectIds).toEqual([projectId])
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
      targetGoal: '75',
      programId: null,
      updatedAt: now,
      userProjectAssignment_project: [{ user: { fullName: 'Synthetic actor' } }],
    })
    const service = new ProjectsService(prisma)
    await service.create(state.actor, {
      code: 'PRJ-001',
      title: 'Synthetic project',
      status: 'PLANNED',
      targetGoal: '75',
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
          changes: {
            code: 'PRJ-001',
            status: 'PLANNED',
            targetGoal: { old: null, new: '75' },
          },
        }),
      }),
    )
  })

  it('assigns a unique internal project code when the accepted UI omits one', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.create.mockImplementation(async ({ data }) => ({ id: data.id }))
    tx.project.findUniqueOrThrow.mockImplementation(async () => {
      const create = tx.project.create.mock.calls[0]?.[0] as { data: { code: string; id: string } }
      return {
        id: create.data.id,
        code: create.data.code,
        title: 'Generated-code project',
        description: 'Synthetic description',
        objectives: 'Synthetic objectives',
        implementationArea: 'Navotas',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'PLANNED',
        targetGoal: '62.5',
        programId: null,
        updatedAt: now,
        userProjectAssignment_project: [{ user: { fullName: 'Synthetic actor' } }],
      }
    })
    const service = new ProjectsService(prisma)

    const result = await service.create(state.actor, {
      title: 'Generated-code project',
      description: 'Synthetic description',
      objectives: 'Synthetic objectives',
      implementationArea: 'Navotas',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'PLANNED',
      targetGoal: '62.5',
    })

    const create = tx.project.create.mock.calls[0]?.[0] as { data: { code: string; id: string } }
    expect(create.data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(create.data.code).toBe(`PRJ-${create.data.id.toUpperCase()}`)
    expect(result.code).toBe(create.data.code)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: {
            code: create.data.code,
            status: 'PLANNED',
            targetGoal: { old: null, new: '62.5' },
          },
        }),
      }),
    )
  })

  it('rejects a missing or zero target goal before creating a project', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    const service = new ProjectsService(prisma)

    await expect(
      service.create(state.actor, {
        title: 'Missing target project',
        status: 'PLANNED',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.create(state.actor, {
        title: 'Zero target project',
        status: 'PLANNED',
        targetGoal: '0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.project.create).not.toHaveBeenCalled()
  })

  it('updates supported core fields in scope, preserves the program link, and audits the write', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.findFirst.mockResolvedValue({
      id: projectId,
      code: 'PRJ-001',
      targetGoal: '75',
      updatedAt: now,
    })
    tx.project.updateMany.mockResolvedValue({ count: 1 })
    tx.project.findUniqueOrThrow.mockResolvedValue({
      id: projectId,
      code: 'PRJ-001',
      title: 'Updated project',
      description: 'Updated description',
      objectives: 'Updated objectives',
      implementationArea: 'Navotas',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      status: 'ONGOING',
      targetGoal: '80.25',
      programId: targetId,
      updatedAt: new Date('2026-09-23T01:00:00.000Z'),
      userProjectAssignment_project: [{ user: { fullName: 'Synthetic actor' } }],
    })
    tx.program.findFirst.mockResolvedValue({ id: targetId })
    const service = new ProjectsService(prisma)

    await expect(
      service.update(state.actor, projectId, {
        code: 'PRJ-001',
        title: 'Updated project',
        description: 'Updated description',
        objectives: 'Updated objectives',
        implementationArea: 'Navotas',
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        status: 'ONGOING',
        targetGoal: '80.25',
        programId: targetId,
        expectedUpdatedAt: now.toISOString(),
      }),
    ).resolves.toMatchObject({ title: 'Updated project', programId: targetId })
    expect(tx.project.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'PRJ-001',
          objectives: 'Updated objectives',
          implementationArea: 'Navotas',
          programId: targetId,
          targetGoal: expect.objectContaining({}),
        }),
        where: expect.objectContaining({ organizationId, id: projectId, updatedAt: now }),
      }),
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROJECT_UPDATED',
          projectId,
          changes: {
            code: 'PRJ-001',
            status: 'ONGOING',
            targetGoal: { old: '75', new: '80.25' },
          },
        }),
      }),
    )
  })

  it('denies an unassigned Project Manager update without writing', async () => {
    state.actor = actor('PROJECT_MANAGER', [])
    tx.project.findFirst.mockResolvedValue(null)
    const service = new ProjectsService(prisma)

    await expect(
      service.update(state.actor, projectId, {
        code: 'PRJ-001',
        title: 'Out-of-scope update',
        status: 'ONGOING',
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [expect.objectContaining({ organizationId, id: { in: [] } }), { id: projectId }],
        },
      }),
    )
    expect(tx.project.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('loads the bounded project directory and manager relation in one database query', async () => {
    state.actor = actor('PROJECT_MANAGER', [projectId])
    tx.project.findMany.mockResolvedValue([])
    const service = new ProjectsService(prisma)

    await expect(service.list(state.actor)).resolves.toEqual([])
    expect(tx.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        relationLoadStrategy: 'join',
        take: 100,
        where: expect.objectContaining({ id: { in: [projectId] }, organizationId }),
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
