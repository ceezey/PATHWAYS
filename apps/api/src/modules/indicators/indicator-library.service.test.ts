import type { ApplicationIdentity } from '@app/modules/auth/developer-access'
import type { PrismaService } from '@app/prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndicatorLibraryService } from './indicator-library.service'
import type { IndicatorsService } from './indicators.service'

const boundary = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('@app/modules/auth/authorized-operation', () => ({ withAuthorizedOperation: boundary.run }))
vi.mock('@pathways/config', () => ({ readApiEnv: () => ({ BUSINESS_TIME_ZONE: 'Asia/Manila' }) }))

const orgA = '78000000-0000-4000-8000-000000000001'
const orgB = '78000000-0000-4000-8000-000000000002'
const projectId = '78000000-0000-4000-8000-000000000003'
const entryId = '78000000-0000-4000-8000-000000000004'
const key = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`
const actor = (organizationId: string, permissions: string[]): ApplicationIdentity => ({
  id: '78000000-0000-4000-8000-000000000005',
  aal: 'aal2',
  organizationId,
  userId: '78000000-0000-4000-8000-000000000006',
  fullName: 'Synthetic M&E',
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions,
  assignedProjectIds: [projectId],
})
const manager = actor(orgA, [
  'indicators.library.read',
  'indicators.library.create',
  'indicators.library.archive',
  'indicators.create',
])
const definition = {
  code: 'WORKSHOP_ATTENDEES',
  name: 'Workshop attendees',
  unitLabel: 'people',
  dataSource: 'Attendance sheet',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
}
const stored = {
  id: entryId,
  organizationId: orgA,
  code: definition.code,
  name: definition.name,
  description: null,
  unitLabel: definition.unitLabel,
  dataSource: definition.dataSource,
  measurementMode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  recipe: null,
  clientMutationId: key(1),
  createdById: manager.userId,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  archivedAt: null as Date | null,
}
type Where = { organizationId?: string; id?: string; archivedAt?: null; clientMutationId?: string }
let rows: Array<typeof stored>
const matches = (row: typeof stored, where: Where) =>
  (!where.organizationId || row.organizationId === where.organizationId) &&
  (!where.id || row.id === where.id) &&
  (where.archivedAt !== null || row.archivedAt === null) &&
  (!where.clientMutationId || row.clientMutationId === where.clientMutationId)
const tx = {
  indicatorLibraryEntry: {
    findMany: vi.fn(async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where))),
    findFirst: vi.fn(async ({ where }: { where: Where }) => rows.find((r) => matches(r, where))),
    count: vi.fn(
      async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length,
    ),
    create: vi.fn(async ({ data }: { data: Partial<typeof stored> }) => ({ ...stored, ...data })),
    updateMany: vi.fn(async ({ where }: { where: Where }) => {
      const hit = rows.filter((r) => matches(r, where))
      for (const row of hit) row.archivedAt = new Date()
      return { count: hit.length }
    }),
  },
  auditLog: { create: vi.fn() },
}
const create = vi.fn()
const indicators = { create } as unknown as IndicatorsService

describe('IndicatorLibraryService', () => {
  const service = new IndicatorLibraryService({} as PrismaService, indicators)
  beforeEach(() => {
    vi.clearAllMocks()
    rows = [{ ...stored }]
    boundary.run.mockImplementation(
      async (
        _prisma: PrismaService,
        identity: ApplicationIdentity,
        permission: string,
        work: (client: Prisma.TransactionClient, current: ApplicationIdentity) => Promise<unknown>,
      ) => {
        if (!identity.permissions.includes(permission)) throw new ForbiddenException()
        return work(tx as unknown as Prisma.TransactionClient, identity)
      },
    )
  })

  describe('happy path', () => {
    it('lists active entries of the actor organization only', async () => {
      rows.push({ ...stored, id: 'x', code: 'OTHER_ORG', organizationId: orgB })
      rows.push({ ...stored, id: 'y', code: 'GONE', archivedAt: new Date() })
      const list = await service.list(manager)
      expect(list.map((entry) => entry.code)).toEqual([definition.code])
      expect(list[0]).not.toHaveProperty('organizationId')
    })
    it('creates an entry and writes an audit event', async () => {
      rows = []
      const result = await service.create(manager, { ...definition, clientMutationId: key(1) })
      expect(result.code).toBe(definition.code)
      expect(tx.indicatorLibraryEntry.create.mock.calls[0][0].data).toMatchObject({
        organizationId: orgA,
        createdById: manager.userId,
      })
      expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe(
        'INDICATOR_LIBRARY_ENTRY_CREATED',
      )
    })
    it('replays the same key and definition without a second insert', async () => {
      const result = await service.create(manager, { ...definition, clientMutationId: key(1) })
      expect(result.id).toBe(entryId)
      expect(tx.indicatorLibraryEntry.create).not.toHaveBeenCalled()
    })
    it('archives an entry', async () => {
      await expect(service.archive(manager, entryId)).resolves.toEqual({
        id: entryId,
        archived: true,
      })
      expect(rows[0].archivedAt).not.toBeNull()
    })
    it('copies the definition into a project indicator with no live link', async () => {
      create.mockResolvedValue({ id: 'new' })
      const values = {
        libraryEntryId: entryId,
        clientMutationId: key(2),
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        baseline: '0',
        target: '100',
      }
      await service.createProjectIndicator(manager, projectId, values)
      const [, project, body] = create.mock.calls[0]
      expect(project).toBe(projectId)
      expect(body).toMatchObject({
        ...definition,
        baseline: '0',
        target: '100',
        binding: undefined,
      })
      expect(body).not.toHaveProperty('libraryEntryId')
    })
    it('carries a derived recipe as the binding', async () => {
      rows[0].measurementMode = 'DERIVED'
      rows[0].recipe = 'PARTICIPATION_RECORD_COUNT'
      create.mockResolvedValue({ id: 'new' })
      await service.createProjectIndicator(manager, projectId, {
        libraryEntryId: entryId,
        clientMutationId: key(2),
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        baseline: null,
        target: null,
      })
      expect(create.mock.calls[0][2]).toMatchObject({
        mode: 'DERIVED',
        binding: { recipe: 'PARTICIPATION_RECORD_COUNT' },
      })
    })
  })

  describe('sad path', () => {
    it('rejects invalid definitions before any database work', async () => {
      for (const bad of [
        { ...definition, code: 'lower', clientMutationId: key(1) },
        { ...definition, numericKind: 'COUNT', displayPrecision: 2, clientMutationId: key(1) },
        { ...definition, mode: 'DERIVED', clientMutationId: key(1) },
        { ...definition, recipe: 'FORM_NUMERIC_SUM', clientMutationId: key(1) },
        { ...definition, recipe: 'PARTICIPATION_RECORD_COUNT', clientMutationId: key(1) },
      ])
        await expect(service.create(manager, bad)).rejects.toBeInstanceOf(BadRequestException)
      expect(boundary.run).not.toHaveBeenCalled()
    })
    it('rejects the same key with a different definition', async () => {
      await expect(
        service.create(manager, { ...definition, name: 'Changed', clientMutationId: key(1) }),
      ).rejects.toBeInstanceOf(ConflictException)
    })
    it('returns not found for a missing, archived or malformed entry', async () => {
      rows[0].archivedAt = new Date()
      await expect(service.archive(manager, entryId)).rejects.toBeInstanceOf(NotFoundException)
      await expect(service.archive(manager, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        service.createProjectIndicator(manager, projectId, {
          libraryEntryId: entryId,
          clientMutationId: key(2),
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          baseline: null,
          target: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(create).not.toHaveBeenCalled()
    })
    it('refuses unauthorized roles for every operation', async () => {
      const outsider = actor(orgA, ['indicators.read'])
      await expect(service.list(outsider)).rejects.toBeInstanceOf(ForbiddenException)
      await expect(
        service.create(outsider, { ...definition, clientMutationId: key(1) }),
      ).rejects.toBeInstanceOf(ForbiddenException)
      await expect(service.archive(outsider, entryId)).rejects.toBeInstanceOf(ForbiddenException)
    })
  })

  describe('abuse cases', () => {
    const otherOrg = actor(orgB, [...manager.permissions])
    it('denies another organization reading, using or archiving the entry', async () => {
      expect(await service.list(otherOrg)).toEqual([])
      await expect(service.archive(otherOrg, entryId)).rejects.toBeInstanceOf(NotFoundException)
      await expect(
        service.createProjectIndicator(otherOrg, projectId, {
          libraryEntryId: entryId,
          clientMutationId: key(2),
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          baseline: null,
          target: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(create).not.toHaveBeenCalled()
      expect(rows[0].archivedAt).toBeNull()
    })
    it('does not replay another organization key as its own entry', async () => {
      const result = await service.create(otherOrg, { ...definition, clientMutationId: key(1) })
      expect(tx.indicatorLibraryEntry.create).toHaveBeenCalledOnce()
      expect(result.id).toBe(entryId)
      expect(tx.indicatorLibraryEntry.create.mock.calls[0][0].data.organizationId).toBe(orgB)
    })
    it('ignores smuggled organization, project and creator fields', async () => {
      await expect(
        service.create(manager, {
          ...definition,
          clientMutationId: key(3),
          organizationId: orgB,
          createdById: 'x',
          binding: { recipe: 'FORM_NUMERIC_SUM', formId: projectId },
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        service.createProjectIndicator(manager, projectId, {
          libraryEntryId: entryId,
          clientMutationId: key(2),
          periodStart: '2026-01-01',
          periodEnd: '2026-12-31',
          baseline: null,
          target: null,
          code: 'OVERRIDE',
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
    it('caps active entries per organization', async () => {
      tx.indicatorLibraryEntry.count.mockResolvedValueOnce(200)
      await expect(
        service.create(manager, { ...definition, code: 'NEW_ONE', clientMutationId: key(4) }),
      ).rejects.toBeInstanceOf(ConflictException)
    })
  })
})
