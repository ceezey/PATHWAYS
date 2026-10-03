// These existing domain tests isolate receipt transport; dedicated source tests cover its boundary.
vi.mock('../rules/rules-source-operation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rules/rules-source-operation')>()),
  beginRuleSourceOperation: async (
    _tx: unknown,
    operation: string,
    projectId: string,
    sourceId: string | null,
    _key: unknown,
    body: Record<string, unknown>,
  ) => ({
    kind: 'NEW',
    operationHandle: 'f0000000-0000-4000-8000-000000000001',
    reservedRecordId: ['ACTIVITY_CREATE', 'INDICATOR_CREATE', 'INDICATOR_MEASUREMENT'].includes(
      operation,
    )
      ? 'f0000000-0000-4000-8000-000000000002'
      : null,
    generatedValues: {
      timestamp: '2026-09-27T00:00:00.001Z',
      businessDate: '2026-09-27',
      normalizedValue: operation === 'INDICATOR_MEASUREMENT' ? body.value : null,
      requestHash:
        operation === 'INDICATOR_MEASUREMENT'
          ? (await import('node:crypto'))
              .createHash('sha256')
              .update(
                JSON.stringify({
                  projectId,
                  indicatorId: sourceId,
                  periodStart: body.periodStart,
                  periodEnd: body.periodEnd,
                  value: body.value,
                  source: body.source,
                  note: body.note ?? null,
                  correctsMeasurementId: body.correctsMeasurementId ?? null,
                  correctionReason: body.correctionReason ?? null,
                }),
              )
              .digest('hex')
          : null,
    },
  }),
  finishRuleSourceOperation: async (_tx: unknown, _handle: string, requestId: string) => ({
    requestId,
    committed: true,
    replayed: false,
  }),
  readRuleSourceAcknowledgement: async () => null,
  bootstrapRuleSourceProject: async () => undefined,
}))
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
  implementingPartnerLinks: [
    { partner: { id: '77000000-0000-4000-8000-000000000007', name: 'Synthetic Partner' } },
  ],
  sector: 'Livelihood',
  targetBeneficiaries: 250,

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
    updateMany: vi.fn(),
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
  $queryRaw: vi.fn().mockResolvedValue([]),
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
      sector: project.sector,
      targetBeneficiaries: 250,
      projectBudget: '125000.50',

      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'PLANNED' as const,
      projectOfficerIds: [officerId],
    }

    const created = await service.create(manager, input)
    expect(created).toMatchObject({
      id: projectId,
      implementingPartners: 'Partner',
      implementingPartnerRecords: [
        { id: '77000000-0000-4000-8000-000000000007', name: 'Synthetic Partner' },
      ],
      sector: 'Livelihood',
      targetBeneficiaries: 250,
      projectBudget: '125000.50',

      projectManagerId: managerId,
      projectOfficerIds: [officerId],
      team: [
        { userId: managerId, fullName: manager.fullName, role: 'PROJECT_MANAGER' },
        { userId: officerId, fullName: 'Synthetic Project Officer', role: 'PROJECT_OFFICER' },
      ],
    })
    expect(created).not.toHaveProperty('targetGoal')
    expect(tx.project.create.mock.calls[0]?.[0].data).not.toHaveProperty('targetGoal')
    // The deprecated legacy column is never written (migration 0039).
    expect(tx.project.create.mock.calls[0]?.[0].data).not.toHaveProperty('implementingPartners')
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.changes).not.toHaveProperty('targetGoal')
    await expect(service.get(manager, projectId)).resolves.toEqual(created)
    expect(tx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId,
          sector: 'Livelihood',
          targetBeneficiaries: 250,
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

  it.each([new Prisma.Decimal('75.1234'), null])(
    'preserves stored historical target %s by omitting it from update data',
    async (historical) => {
      const stored = { ...project, targetGoal: historical }
      tx.project.findFirst.mockImplementation(async () => stored)
      tx.project.findUniqueOrThrow.mockImplementation(async () => stored)
      tx.project.updateMany.mockImplementation(async ({ data }) => {
        Object.assign(stored, data)
        return { count: 1 }
      })
      const result = await service.update(manager, projectId, {
        title: 'Updated scope',
        status: 'ONGOING',
        clientMutationId: 'e0000000-0000-4000-8000-000000000001',
        expectedUpdatedAt: now.toISOString(),
        targetBeneficiaries: 350,
      })
      const update = tx.project.updateMany.mock.calls[0]?.[0]
      expect(update.where).toMatchObject({ organizationId, id: projectId, updatedAt: now })
      expect(update.data).not.toHaveProperty('targetGoal')
      expect(stored.targetGoal).toBe(historical)
      if (stored.targetGoal !== null) expect(stored.targetGoal.toFixed(4)).toBe('75.1234')
      expect(stored.targetBeneficiaries).toBe(350)
      expect(result).not.toHaveProperty('targetGoal')
      expect(tx.auditLog.create.mock.calls[0]?.[0].data.changes).not.toHaveProperty('targetGoal')
    },
  )

  it('rejects unavailable or cross-organization team selections', async () => {
    tx.systemUser.findMany.mockResolvedValueOnce([
      { id: managerId, role: { code: 'PROJECT_MANAGER' } },
    ])
    await expect(
      service.create(manager, {
        title: project.title,

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

        status: 'PLANNED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.create).not.toHaveBeenCalled()
  })

  it('rejects Project creation for System Administrator even with a forged create grant', async () => {
    state.actor = {
      ...manager,
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: ['projects.read', 'projects.create'],
    }
    await expect(
      service.create(state.actor, { title: project.title, status: 'PLANNED' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.project.create).not.toHaveBeenCalled()
  })

  it('does not disclose an unscoped Project on reload', async () => {
    tx.project.findFirst.mockResolvedValueOnce(null)
    await expect(service.get(manager, foreignProjectId)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('Project archive contract', () => {
  const service = new ProjectsService({} as PrismaService)
  const archiver = { ...manager, permissions: [...manager.permissions, 'projects.archive'] }

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = archiver
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId, archivedAt: null })
    tx.project.updateMany.mockResolvedValue({ count: 1 })
  })

  it('sets archivedAt in the actor organization and audits it', async () => {
    const result = await service.archive(archiver, projectId)
    expect(result.id).toBe(projectId)
    expect(tx.project.updateMany).toHaveBeenCalledWith({
      where: { id: projectId, organizationId, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'PROJECT_ARCHIVED', organizationId, projectId }),
    })
  })

  it('is idempotent for an already archived project', async () => {
    tx.project.findFirst.mockResolvedValue({ id: projectId, archivedAt: now })
    await expect(service.archive(archiver, projectId)).resolves.toEqual({
      id: projectId,
      archivedAt: now.toISOString(),
    })
    expect(tx.project.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('denies a cross-organization or unscoped project without writing', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.archive(archiver, foreignProjectId)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.project.updateMany).not.toHaveBeenCalled()
  })
})
