import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { AUDIT_MODULES, hasAtomicPermission } from '@pathways/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from './audit.service'

const state = vi.hoisted(() => ({ actor: undefined as unknown, tx: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    _caller: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = state.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission as never))
      throw new ForbiddenException('Current audit grant required.')
    return work(state.tx, actor)
  },
}))
const org = '10000000-0000-4000-8000-000000000001'
const projectId = '20000000-0000-4000-8000-000000000002'
const userId = '30000000-0000-4000-8000-000000000003'
const instant = new Date('2026-09-27T00:00:00.123Z')
const identity: ApplicationIdentity = {
  id: userId,
  userId,
  organizationId: org,
  aal: 'aal2',
  fullName: 'Fictional audit reviewer',
  roles: ['SYSTEM_ADMINISTRATOR'],
  permissions: ['audit.read'],
  assignedProjectIds: [projectId],
}
const row = (suffix: string) => ({
  id: `40000000-0000-4000-8000-00000000000${suffix}`,
  occurredAt: instant,
  action: 'PROJECT_UPDATED',
  entityType: 'Project',
  entityId: projectId,
  projectId,
  actorUserId: userId,
  actor: { fullName: 'Fictional audit reviewer' },
})
const tx = { project: { findMany: vi.fn() }, auditLog: { findMany: vi.fn(), create: vi.fn() } }
const service = new AuditService({} as PrismaService)

describe('audit projection and cursor boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = identity
    state.tx = tx
    tx.project.findMany.mockResolvedValue([{ id: projectId }])
    tx.auditLog.findMany.mockResolvedValue([])
  })
  it('keeps an unfiltered administrator organization-scoped without a project-count ceiling', async () => {
    tx.project.findMany.mockImplementation(() => {
      throw Error('Unfiltered administrator must not enumerate projects')
    })
    await expect(service.list(identity, {})).resolves.toEqual({ rows: [], nextCursor: null })
    expect(tx.project.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({ organizationId: org })
  })
  it('scopes a manager before retrieving audit rows and selects only the permitted fields', async () => {
    state.actor = { ...identity, roles: ['PROJECT_MANAGER'] }
    await service.list(identity, { projectId })
    expect(tx.project.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        AND: [
          { organizationId: org, archivedAt: null, id: { in: [projectId] } },
          { id: projectId },
        ],
      },
      select: { id: true },
      take: 1001,
    })
    expect(tx.project.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.findMany.mock.invocationCallOrder[0],
    )
    const query = tx.auditLog.findMany.mock.calls[0][0]
    expect(query.where).toEqual({ organizationId: org, projectId: { in: [projectId] } })
    expect(Object.keys(query.select).sort()).toEqual(
      [
        'id',
        'occurredAt',
        'action',
        'entityType',
        'entityId',
        'projectId',
        'actorUserId',
        'changes',
        'actor',
      ].sort(),
    )
    expect(query.select.actor).toEqual({ select: { fullName: true } })
  })
  it('returns only allowlisted non-personal change keys and never the stored changes', async () => {
    tx.auditLog.findMany.mockResolvedValue([
      {
        ...row('1'),
        action: 'IMPORT_ENROLLMENT_DATE_CONFIRMED',
        changes: { source: 'TYPED', rowNumber: 5, enrollmentDate: '2026-01-12', name: { a: 1 } },
      },
      { ...row('2'), changes: { fullName: 'Fictional participant' } },
      { ...row('3'), action: 'constructor', changes: { source: 'x' } },
      { ...row('4'), action: 'IMPORT_ENROLLMENT_DATE_CONFIRMED', changes: null },
      {
        ...row('5'),
        action: 'IMPORT_ENROLLMENT_DATE_CONFIRMED',
        changes: { source: { fullName: 'Fictional participant' }, rowNumber: [5] },
      },
    ])
    const result = await service.list(identity, {})
    expect(result.rows.map((item) => item.details)).toStrictEqual([
      { source: 'TYPED', rowNumber: 5 },
      {},
      {},
      {},
      {},
    ])
    expect(result.rows[0]).not.toHaveProperty('changes')
  })
  it('resolves the actor name from the same organization-scoped relation', async () => {
    tx.auditLog.findMany.mockResolvedValue([row('1')])
    const result = await service.list(identity, {})
    expect(result.rows[0].actorName).toBe('Fictional audit reviewer')
    expect(result.rows[0].actorUserId).toBe(userId)
    expect(result.rows[0]).not.toHaveProperty('actor')
  })
  it('returns a null actor name for a system-originated event', async () => {
    tx.auditLog.findMany.mockResolvedValue([{ ...row('1'), actorUserId: null, actor: null }])
    const result = await service.list(identity, {})
    expect(result.rows[0].actorName).toBeNull()
    expect(result.rows[0].actorUserId).toBeNull()
  })
  it('an actor lookup that cannot resolve in scope (e.g. deleted user) yields no name', async () => {
    tx.auditLog.findMany.mockResolvedValue([{ ...row('1'), actor: null }])
    const result = await service.list(identity, {})
    expect(result.rows[0].actorName).toBeNull()
  })
  it('the actor relation is composite-keyed on organizationId so a cross-org actor can never join', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
      'utf8',
    )
    expect(schema).toMatch(
      /actor\s+SystemUser\?\s+@relation\("AuditActor",\s*fields:\s*\[organizationId,\s*actorUserId\],\s*references:\s*\[organizationId,\s*id\]/,
    )
  })
  it('bounds the audit page to the requested limit regardless of actor name resolution', async () => {
    tx.auditLog.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, index) => row(String(index + 1))),
    )
    const result = await service.list(identity, { limit: 2 })
    expect(result.rows).toHaveLength(2)
    expect(tx.auditLog.findMany.mock.calls[0][0].take).toBe(3)
  })
  it('an inaccessible project produces an empty database predicate instead of broad retrieval', async () => {
    state.actor = { ...identity, roles: ['PROJECT_MANAGER'] }
    tx.project.findMany.mockResolvedValue([])
    await service.list(identity, { projectId })
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      projectId: { in: [] },
    })
  })
  it('rejects an oversized assigned project scope before retrieving audit data', async () => {
    state.actor = { ...identity, roles: ['PROJECT_MANAGER'] }
    tx.project.findMany.mockResolvedValue(Array.from({ length: 1001 }, () => ({ id: projectId })))
    await expect(service.list(identity, {})).rejects.toThrow(BadRequestException)
    expect(tx.auditLog.findMany).not.toHaveBeenCalled()
  })
  it('continues equal-millisecond rows by descending UUID without repeating the boundary row', async () => {
    const rows = [row('3'), row('2'), row('1')]
    tx.auditLog.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[2]])
    const first = await service.list(identity, { limit: 2 })
    expect(first.nextCursor).toBe(`${instant.toISOString()}|${rows[1].id}`)
    const next = await service.list(identity, { limit: 2, cursor: first.nextCursor })
    expect([...first.rows, ...next.rows].map((item) => item.id)).toEqual(
      rows.map((item) => item.id),
    )
    expect(next.nextCursor).toBeNull()
    expect(tx.auditLog.findMany.mock.calls[1][0]).toMatchObject({
      where: {
        organizationId: org,
        OR: [{ occurredAt: { lt: instant } }, { occurredAt: instant, id: { lt: rows[1].id } }],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 3,
    })
  })
  it.each([`2026-99-99T00:00:00.123Z|${row('1').id}`, '2026-09-27T00:00:00.123Z|not-a-uuid'])(
    'rejects malformed cursor %s before querying audit rows',
    async (cursor) => {
      await expect(async () => service.list(identity, { cursor })).rejects.toThrow(
        BadRequestException,
      )
      expect(tx.auditLog.findMany).not.toHaveBeenCalled()
    },
  )
  it('a revoked current audit grant rejects a previously authorized caller before data access', async () => {
    state.actor = { ...identity, permissions: [] }
    await expect(service.list(identity, {})).rejects.toThrow(ForbiddenException)
    expect(tx.project.findMany).not.toHaveBeenCalled()
    expect(tx.auditLog.findMany).not.toHaveBeenCalled()
  })
})

describe('audit server filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = identity
    state.tx = tx
    tx.project.findMany.mockResolvedValue([{ id: projectId }])
    tx.auditLog.findMany.mockResolvedValue([])
  })
  it('narrows to a readable module on the server', async () => {
    await service.list(identity, { module: 'projects' })
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      entityType: {
        in: ['Project', 'Program', 'ProjectMilestone', 'ProjectMapPin', 'ProjectPublication'],
      },
    })
  })
  it('Other means every entity type no module lists', async () => {
    await service.list(identity, { module: 'other' })
    const where = tx.auditLog.findMany.mock.calls[0][0].where
    expect(where.entityType.notIn).toContain('Project')
    expect(where.entityType.notIn).toHaveLength(
      AUDIT_MODULES.flatMap((m) => [...m.entityTypes]).length,
    )
  })
  it('turns Manila business dates into an inclusive day range', async () => {
    await service.list(identity, { from: '2026-09-28', to: '2026-09-28' })
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      occurredAt: {
        gte: new Date('2026-09-27T16:00:00.000Z'),
        lt: new Date('2026-09-28T16:00:00.000Z'),
      },
    })
  })
  it.each([
    [{ from: '2026-09-28' }, { gte: new Date('2026-09-27T16:00:00.000Z') }],
    [{ to: '2026-09-28' }, { lt: new Date('2026-09-28T16:00:00.000Z') }],
  ])('applies a one-sided date range %o', async (input, occurredAt) => {
    await service.list(identity, input)
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      occurredAt,
    })
  })
  it('searches action, target and actor name case-insensitively', async () => {
    await service.list(identity, { q: ' project_upd ' })
    const c = { contains: 'project_upd', mode: 'insensitive' }
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      AND: [{ OR: [{ action: c }, { entityId: c }, { actor: { is: { fullName: c } } }] }],
    })
  })
  it('matches an event or actor id exactly when the keyword is a UUID', async () => {
    await service.list(identity, { q: userId.toUpperCase() })
    const or = tx.auditLog.findMany.mock.calls[0][0].where.AND[0].OR
    expect(or).toContainEqual({ id: userId })
    expect(or).toContainEqual({ actorUserId: userId })
  })
  it('keeps cursor pagination when filters are set', async () => {
    const cursor = `${instant.toISOString()}|${row('2').id}`
    await service.list(identity, { module: 'projects', q: 'PROJECT', cursor, limit: 2 })
    expect(tx.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: org,
        entityType: { in: expect.any(Array) },
        AND: [{ OR: expect.any(Array) }],
        OR: [{ occurredAt: { lt: instant } }, { occurredAt: instant, id: { lt: row('2').id } }],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 3,
    })
  })
  it('keeps a manager project scope under a module filter', async () => {
    state.actor = { ...identity, roles: ['PROJECT_MANAGER'] }
    await service.list(identity, { module: 'users' })
    expect(tx.auditLog.findMany.mock.calls[0][0].where).toEqual({
      organizationId: org,
      projectId: { in: [projectId] },
      entityType: { in: ['SystemUser', 'Authentication'] },
    })
  })
  it.each([
    { from: '2026-09-29', to: '2026-09-28' },
    { module: 'Project' },
    { q: '   ' },
    { q: 'x'.repeat(101) },
    { from: '2026-02-30' },
  ])('rejects invalid filters %o before reading', async (input) => {
    await expect(async () => service.list(identity, input)).rejects.toThrow(BadRequestException)
    expect(tx.auditLog.findMany).not.toHaveBeenCalled()
  })
})

describe('audit log viewing is itself recorded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = identity
    state.tx = tx
    tx.project.findMany.mockResolvedValue([{ id: projectId }])
    tx.auditLog.findMany.mockResolvedValue([])
  })
  it('records one AUDIT_LOG_VIEWED after reading the first page', async () => {
    await service.list(identity, {})
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: org,
        actorUserId: userId,
        projectId: null,
        action: 'AUDIT_LOG_VIEWED',
        entityType: 'AuditLog',
      },
    })
    expect(tx.auditLog.findMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.auditLog.create.mock.invocationCallOrder[0],
    )
  })
  it('records the project filter of a first-page search', async () => {
    await service.list(identity, { projectId, module: 'projects' })
    expect(tx.auditLog.create.mock.calls[0][0].data.projectId).toBe(projectId)
  })
  it('records the project filter only when the project is in the caller scope', async () => {
    tx.project.findMany.mockResolvedValue([])
    await service.list(identity, { projectId })
    expect(tx.auditLog.create.mock.calls[0][0].data.projectId).toBeNull()
  })
  it('writes nothing for Load older events, invalid filters or a revoked grant', async () => {
    await service.list(identity, {
      module: 'projects',
      cursor: `${instant.toISOString()}|${row('1').id}`,
    })
    await expect(async () => service.list(identity, { limit: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    state.actor = { ...identity, permissions: [] }
    await expect(service.list(identity, {})).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
