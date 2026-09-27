import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../../prisma/prisma.service'
import type { ApplicationIdentity, AuthenticatedRequest } from '../auth/developer-access'
const state = vi.hoisted(() => ({
  permission: undefined as string | undefined,
  tx: { $queryRaw: vi.fn() },
  current: undefined as ApplicationIdentity | undefined,
}))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: async (
    _prisma: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown) => Promise<unknown>,
  ) => {
    state.permission = permission
    if (!state.current?.permissions.includes(permission))
      throw Error('Current permission unavailable')
    return work(state.tx)
  },
}))
import { RulesSourceOperationsController } from './rules-source-operations.controller'
import { RulesSourceOperationsService } from './rules-source-operations.service'
const project = '10000000-0000-4000-8000-000000000001'
const source = '20000000-0000-4000-8000-000000000002'
const request = '30000000-0000-4000-8000-000000000003'
const service = new RulesSourceOperationsService({} as PrismaService)
const controller = new RulesSourceOperationsController(service)
const value = {
  operation: 'PROJECT_UPDATE',
  sourceId: project,
  requestId: request,
  body: {
    title: 'Synthetic project',
    status: 'ONGOING',
    expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
  },
}
beforeEach(() => {
  vi.resetAllMocks()
  state.permission = undefined
  state.current = {
    permissions: ['projects.update', 'activities.create', 'indicators.archive'],
    organizationId: '40000000-0000-4000-8000-000000000004',
    userId: source,
  } as ApplicationIdentity
  state.tx.$queryRaw.mockResolvedValue([{ result: { requestId: request, abandoned: true } }])
})
describe('explicit source ticket recovery current scope and fixed operation authority', () => {
  it('uses fresh original mutation permission and fixed purpose; does not accept client authority', async () => {
    expect(await service.abandon(state.current as ApplicationIdentity, project, value)).toEqual({
      requestId: request,
      abandoned: true,
    })
    expect(state.permission).toBe('projects.update')
    const [sql, ...args] = state.tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(sql.join('')).toContain('pathways.f10_abandon_source_operation(')
    expect(args).toEqual([
      'PROJECT_UPDATE',
      project,
      project,
      'CLIENT_MUTATION',
      request,
      'MUTATION',
      JSON.stringify(value.body),
    ])
  })
  it('allows own committed acknowledgement under current permission without exposing raw DTO', async () => {
    state.tx.$queryRaw.mockResolvedValueOnce([
      { result: { requestId: request, committed: true, replayed: true } },
    ])
    expect(await service.abandon(state.current as ApplicationIdentity, project, value)).toEqual({
      requestId: request,
      committed: true,
      replayed: true,
    })
  })
  it('denies current grant withdrawal even if the captured caller profile still has that grant', async () => {
    const prior = structuredClone(state.current as ApplicationIdentity)
    state.current = { ...prior, permissions: [] }
    await expect(service.abandon(prior, project, value)).rejects.toThrow(
      'Current permission unavailable',
    )
    expect(state.tx.$queryRaw).not.toHaveBeenCalled()
  })
  it.each([
    { ...value, organizationId: source },
    { ...value, permission: 'system.override' },
    { ...value, phase: 'FINALIZE' },
    { ...value, sourceId: null },
    { ...value, sourceId: source },
    { ...value, requestId: 'malformed' },
    { ...value, operation: 'PROJECT_CREATE' },
    { ...value, body: { ...value.body, clientMutationId: request } },
    { ...value, body: null },
  ])(
    'rejects malformed or client-authority recovery input before database work %j',
    async (input) => {
      expect(() => service.abandon(state.current as ApplicationIdentity, project, input)).toThrow(
        'Invalid mutation recovery',
      )
      expect(state.tx.$queryRaw).not.toHaveBeenCalled()
    },
  )
  it('keeps private proof finalization outside generic abandonment and requires identical multipart retry', () => {
    expect(() =>
      service.abandon(state.current as ApplicationIdentity, project, {
        ...value,
        operation: 'ACTIVITY_PROOF_FINALIZE',
        sourceId: source,
      }),
    ).toThrow('same update id and identical files')
    expect(state.tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('requires a verified linked human profile at controller entry', () => {
    expect(() => controller.abandon({} as AuthenticatedRequest, project, value)).toThrow(
      'Application profile is required.',
    )
    expect(state.tx.$queryRaw).not.toHaveBeenCalled()
  })
})
