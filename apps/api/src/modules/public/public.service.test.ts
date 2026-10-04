import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity } from '../auth/developer-access'
import { PublicProjectsController } from './public.controller'
import { PublicService } from './public.service'

const state = vi.hoisted(() => ({
  actor: undefined as ApplicationIdentity | undefined,
  tx: undefined as unknown,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _db: unknown,
    _identity: unknown,
    _permission: unknown,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => work(state.tx, state.actor),
}))
const projectId = 'abcdefab-0000-4000-8000-000000000001'
const requestId = 'abcdefab-0000-4000-8000-000000000002'
const actor: ApplicationIdentity = {
  id: requestId,
  userId: requestId,
  organizationId: requestId,
  aal: 'aal2',
  fullName: 'Synthetic publisher',
  roles: ['PROJECT_MANAGER'],
  permissions: ['public.preview'],
  assignedProjectIds: [projectId],
}
const tx = { project: { findFirst: vi.fn() }, $queryRaw: vi.fn(), $executeRaw: vi.fn() }
const service = new PublicService({} as PrismaService)
describe('public published projects', () => {
  it('maps a database or projection failure to a fixed unavailable response', async () => {
    const db = {
      $queryRaw: vi.fn().mockRejectedValue(Error('Core projection provisioning incomplete')),
    }
    const failure = new PublicService(db as unknown as PrismaService).published()
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Public information is temporarily unavailable')
  })
  it('rejects a projection row outside the public allowlist as unavailable', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ projects: [{ id: projectId, budget: 1 }] }]),
    }
    await expect(
      new PublicService(db as unknown as PrismaService).published(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
  it('still reports an unknown public project as not found', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ projects: [] }]) }
    await expect(
      new PublicService(db as unknown as PrismaService).published(projectId),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
let receipt: unknown
const now = new Date('2026-09-27T00:00:00.000Z')
describe('publication canonical request recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    receipt = undefined
    state.actor = actor
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockImplementation((query: { sql?: string } | string[]) => {
      const text = Array.isArray(query) ? query.join('') : (query.sql ?? '')
      if (text.includes('publication_requests')) return receipt ? [receipt] : []
      if (text.includes('INSERT INTO'))
        return [{ revision: 1, state: 'FOR_REVIEW', updatedAt: now }]
      return []
    })
    tx.$executeRaw.mockImplementation((_query: unknown, ...values: unknown[]) => {
      receipt = {
        projectId: values[1],
        operation: values[4],
        hash: values[5],
        revision: values[6],
        state: values[7],
        updatedAt: values[8],
      }
      return 1
    })
  })
  it('recovers the same persisted receipt for mixed-case project and request UUIDs', async () => {
    const body = {
      clientRequestId: requestId.toUpperCase(),
      expectedRevision: 0,
      summary: 'Synthetic approved summary.',
    }
    const first = await service.transition(actor, projectId.toUpperCase(), 'SUBMIT', body)
    const retry = await service.transition(actor, projectId, 'SUBMIT', {
      ...body,
      clientRequestId: requestId,
    })
    expect(retry).toEqual(first)
    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    expect(tx.$executeRaw.mock.calls[0][2]).toBe(projectId)
    expect(tx.$executeRaw.mock.calls[0][4]).toBe(requestId)
    const locks = tx.$queryRaw.mock.calls.filter(
      (call) => Array.isArray(call[0]) && call[0].join('').includes('pg_advisory_xact_lock'),
    )
    expect(locks[0][1]).toBe(locks[1][1])
    expect(
      locks.every((call) =>
        call[0]
          .join('')
          .startsWith('SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock'),
      ),
    ).toBe(true)
  })
  it('still denies a canonical same-key content collision without another write', async () => {
    const body = {
      clientRequestId: requestId,
      expectedRevision: 0,
      summary: 'Synthetic approved summary.',
    }
    await service.transition(actor, projectId, 'SUBMIT', body)
    await expect(
      service.transition(actor, projectId.toUpperCase(), 'SUBMIT', {
        ...body,
        summary: 'Changed content',
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.$executeRaw).toHaveBeenCalledOnce()
  })
})
const otherUser = 'abcdefab-0000-4000-8000-000000000003'
const row = (stateName: string, submittedById = otherUser) => ({
  revision: 2,
  state: stateName,
  summary: 'Synthetic approved summary.',
  snapshot: {},
  submittedById,
  approvedById: null,
  publishedById: null,
  updatedAt: now,
})
describe('publication state machine (QAD-T74, QAD-T75)', () => {
  let current: ReturnType<typeof row> | undefined
  let updates: unknown[][]
  beforeEach(() => {
    vi.resetAllMocks()
    state.actor = actor
    state.tx = tx
    updates = []
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$executeRaw.mockResolvedValue(1)
    tx.$queryRaw.mockImplementation((query: { sql?: string; values?: unknown[] } | string[]) => {
      const text = Array.isArray(query) ? query.join('') : (query.sql ?? '')
      if (text.includes('UPDATE pathways.project_publications')) {
        updates.push((query as { values: unknown[] }).values)
        const values = (query as { values: unknown[] }).values
        return [{ ...current, revision: values[0], state: values[1], updatedAt: now }]
      }
      if (text.includes('FOR UPDATE')) return current ? [current] : []
      return []
    })
  })
  const body = { clientRequestId: requestId, expectedRevision: 2 }
  it('lets a distinct reviewer approve a revision under review', async () => {
    current = row('FOR_REVIEW')
    await expect(service.transition(actor, projectId, 'APPROVE', body)).resolves.toMatchObject({
      state: 'APPROVED',
      revision: 2,
    })
  })
  it('refuses approval by the reviewer who submitted the revision', async () => {
    current = row('FOR_REVIEW', actor.userId)
    await expect(service.transition(actor, projectId, 'APPROVE', body)).rejects.toMatchObject({
      status: 409,
    })
    expect(updates).toHaveLength(0)
  })
  it.each([
    ['PUBLISH', 'FOR_REVIEW'],
    ['APPROVE', 'APPROVED'],
    ['WITHDRAW', 'APPROVED'],
  ] as const)('refuses %s from %s without a write', async (operation, from) => {
    current = row(from)
    await expect(service.transition(actor, projectId, operation, body)).rejects.toMatchObject({
      status: 409,
    })
    expect(updates).toHaveLength(0)
  })
  it('withdraw returns the revision to review, then the public read reports it unavailable', async () => {
    current = row('PUBLISHED')
    await expect(service.transition(actor, projectId, 'WITHDRAW', body)).resolves.toMatchObject({
      state: 'FOR_REVIEW',
      revision: 3,
    })
    // The projection returns only PUBLISHED rows, so a withdrawn project yields an empty page.
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ projects: [] }]) }
    await expect(
      new PublicService(db as unknown as PrismaService).published(projectId),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
describe('anonymous public routes (QAD-A09)', () => {
  it('expose only the project list and project read, with no media route', () => {
    const routes = Object.getOwnPropertyNames(PublicProjectsController.prototype).filter(
      (name) => name !== 'constructor',
    )
    expect(routes.sort()).toEqual(['get', 'list'])
    expect(Reflect.getMetadata('path', PublicProjectsController)).toBe('public/projects')
  })
})
