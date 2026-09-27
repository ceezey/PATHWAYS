import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import { AuditService } from './audit.service'

const state = vi.hoisted(() => ({ actor: undefined as unknown, tx: undefined as unknown }))
vi.mock('../auth/authorized-operation', () => ({
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
})
const tx = { project: { findMany: vi.fn() }, auditLog: { findMany: vi.fn() } }
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
  it('scopes a manager before retrieving audit rows and exposes only the seven permitted fields', async () => {
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
      ['id', 'occurredAt', 'action', 'entityType', 'entityId', 'projectId', 'actorUserId'].sort(),
    )
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
