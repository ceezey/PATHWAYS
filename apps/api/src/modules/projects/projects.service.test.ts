import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as Prisma.TransactionClient | undefined,
}))

vi.mock('@app/modules/auth/authorized-operation', () => ({
  withAuthorizedOperation: vi.fn(async (_prisma, _identity, _permission, work) =>
    work(state.tx, state.actor),
  ),
}))

import { ProjectsService } from './projects.service'

const organizationId = '11000000-0000-4000-8000-000000000001'
const projectId = '22000000-0000-4000-8000-000000000002'
const managerId = '33000000-0000-4000-8000-000000000003'
const officerId = '44000000-0000-4000-8000-000000000004'
const foreignProjectId = '55000000-0000-4000-8000-000000000005'
const now = new Date('2026-09-25T00:00:00.000Z')

const manager: ApplicationIdentity = {
  id: '66000000-0000-4000-8000-000000000006',
  aal: 'aal2',
  userId: managerId,
  organizationId,
  fullName: 'Synthetic Project Manager',
  roles: ['PROJECT_MANAGER'],
  permissions: [
    'projects.read',
    'projects.create',
    'budgets.read',
    'budgets.create',
    'budgets.update',
  ],
  assignedProjectIds: [projectId],
}

const project = {
  id: projectId,
  code: 'PRJ-P08',
  title: 'Synthetic repaired project',
  description: 'Description',
  objectives: 'Objectives',
  implementationArea: 'Area',
  implementingPartners: 'Partner',
  sector: 'Livelihood',
  targetBeneficiaries: 250,
  targetGoal: new Prisma.Decimal('75.5'),
  programManagerId: null,
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  status: 'PLANNED',
  programId: null,
  updatedAt: now,
  programManager: null,
  userProjectAssignment_project: [
    {
      user: {
        id: managerId,
        fullName: manager.fullName,
        email: 'manager@example.invalid',
        role: { code: 'PROJECT_MANAGER' },
      },
    },
    {
      user: {
        id: officerId,
        fullName: 'Synthetic Project Officer',
        email: 'officer@example.invalid',
        role: { code: 'PROJECT_OFFICER' },
      },
    },
  ],
}

const tx = {
  program: { findFirst: vi.fn() },
  systemUser: { findFirst: vi.fn(), findMany: vi.fn() },
  project: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  userProjectAssignment: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
  projectActivityAssignment: { updateMany: vi.fn() },
  projectBudgetRecord: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn() },
}

describe('Project creation contract', () => {
  const service = new ProjectsService({} as PrismaService)

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = manager
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.create.mockResolvedValue({ id: projectId })
    tx.systemUser.findMany.mockResolvedValue([
      { id: managerId, role: { code: 'PROJECT_MANAGER' } },
      { id: officerId, role: { code: 'PROJECT_OFFICER' } },
    ])
    tx.userProjectAssignment.findMany.mockResolvedValue([])
    tx.projectBudgetRecord.findFirst.mockResolvedValue(null)
    tx.projectBudgetRecord.findMany.mockResolvedValue([
      { projectId, plannedBudget: new Prisma.Decimal('125000.50') },
    ])
    tx.project.findUniqueOrThrow.mockResolvedValue(project)
    tx.project.findFirst.mockResolvedValue(project)
  })

  it('persists and returns the repaired fields, normalized team, and decimal budget', async () => {
    const input = {
      code: 'PRJ-P08',
      title: project.title,
      description: project.description,
      objectives: project.objectives,
      implementationArea: project.implementationArea,
      implementingPartners: project.implementingPartners,
      sector: project.sector,
      targetBeneficiaries: 250,
      projectBudget: '125000.50',
      targetGoal: '75.5000',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'PLANNED' as const,
      projectOfficerIds: [officerId],
    }

    const created = await service.create(manager, input)
    expect(created).toMatchObject({
      id: projectId,
      implementingPartners: 'Partner',
      sector: 'Livelihood',
      targetBeneficiaries: 250,
      projectBudget: '125000.50',
      targetGoal: '75.5',
      projectManagerId: managerId,
      projectOfficerIds: [officerId],
    })
    await expect(service.get(manager, projectId)).resolves.toEqual(created)
    expect(tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId,
          implementingPartners: 'Partner',
          sector: 'Livelihood',
          targetBeneficiaries: 250,
          targetGoal: expect.any(Prisma.Decimal),
        }),
      }),
    )
    expect(tx.userProjectAssignment.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ projectId, userId: managerId }),
        expect.objectContaining({ projectId, userId: officerId }),
      ]),
    })
    expect(tx.projectBudgetRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId,
        category: 'PROJECT_PROFILE_TOTAL',
        currency: 'PHP',
        plannedBudget: expect.any(Prisma.Decimal),
      }),
    })
  })

  it('rejects unavailable or cross-organization team selections', async () => {
    tx.systemUser.findMany.mockResolvedValueOnce([
      { id: managerId, role: { code: 'PROJECT_MANAGER' } },
    ])
    await expect(
      service.create(manager, {
        title: project.title,
        targetGoal: '75',
        status: 'PLANNED',
        projectOfficerIds: [officerId],
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('rejects Project creation for a read-only canonical role', async () => {
    state.actor = {
      ...manager,
      roles: ['PROGRAM_MANAGER'],
      permissions: ['projects.read'],
    }
    await expect(
      service.create(state.actor, {
        title: project.title,
        targetGoal: '75',
        status: 'PLANNED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.create).not.toHaveBeenCalled()
  })

  it('does not disclose an unscoped Project on reload', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(manager, foreignProjectId)).rejects.toBeInstanceOf(NotFoundException)
  })
})
