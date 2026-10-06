import 'reflect-metadata'
import { type ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard'
import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity, AuthenticatedRequest } from '../auth/developer-access'
import type { ReceiptPdfRenderer } from '../report-pdf/receipt-pdf.renderer'
import type { StorageService } from '../storage/storage.service'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'

const state = vi.hoisted(() => ({ actor: undefined as unknown, tx: undefined as unknown }))
vi.mock('../auth/authorized-operation', () => ({
  withAuthorizedOperation: (
    _db: unknown,
    _identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    const actor = state.actor as ApplicationIdentity
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, permission as never))
      throw new ForbiddenException('Current decision permission required.')
    return work(state.tx, actor)
  },
}))
const projectId = '10000000-0000-4000-8000-000000000001'
const expenseId = '20000000-0000-4000-8000-000000000002'
const org = '30000000-0000-4000-8000-000000000003'
const tx = { project: { findFirst: vi.fn() }, $queryRaw: vi.fn() }
const service = new FinanceService(
  {} as PrismaService,
  {} as StorageService,
  {
    render: () => Promise.reject(new Error('Receipt renderer disabled.')),
  } as unknown as ReceiptPdfRenderer,
)
const controller = new FinanceController(service)
let actor: ApplicationIdentity
const identity = (role: string, permissions: string[]): ApplicationIdentity => ({
  id: expenseId,
  aal: 'aal2',
  userId: expenseId,
  organizationId: org,
  fullName: 'Fictional reviewer',
  roles: [role],
  permissions,
  assignedProjectIds: [projectId],
})
const request: AuthenticatedRequest = { headers: { authorization: 'Bearer synthetic-local-token' } }
const guard = new SupabaseAuthGuard(
  new Reflector(),
  {
    verifyCurrent: async () => ({
      identity: { id: expenseId, aal: 'aal2' },
      sessionId: expenseId,
      stageTimings: { claimsMs: 0, currentUserMs: 0 },
    }),
    assertSessionLive: async () => {},
  } as never,
  { resolveSelection: async () => actor } as never,
  { enter: () => null } as never,
  { enforce: async () => {} } as never,
)
const context = {
  getHandler: () => FinanceController.prototype.review,
  getClass: () => FinanceController,
  switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader: () => {} }) }),
} as unknown as ExecutionContext
describe('finance review handler and global admission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.$queryRaw.mockResolvedValue([{ value: { id: expenseId, projectId, status: 'VERIFIED' } }])
    state.tx = tx
  })
  it.each([
    ['MONITORING_AND_EVALUATION_OFFICER', 'expenses.verify', 'VERIFY'],
    ['PROJECT_MANAGER', 'expenses.approve', 'APPROVE'],
  ])(
    'admits canonical %s stage and invokes the actual decision service',
    async (role, permission, stage) => {
      actor = identity(role, ['expenses.read', permission])
      state.actor = actor
      expect(await guard.canActivate(context)).toBe(true)
      await expect(
        controller.review(request, projectId, expenseId, {
          stage,
          decision: stage,
          expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
        }),
      ).resolves.toMatchObject({ id: expenseId })
      expect(tx.$queryRaw).toHaveBeenCalledOnce()
    },
  )
  it('denies a submitter even when the caller forges reviewer permissions', async () => {
    actor = identity('PROJECT_OFFICER', ['expenses.read', 'expenses.verify', 'expenses.approve'])
    state.actor = actor
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('requires the fresh decision grant after common read admission', async () => {
    actor = identity('PROJECT_MANAGER', ['expenses.read'])
    state.actor = actor
    expect(await guard.canActivate(context)).toBe(true)
    expect(() =>
      controller.review(request, projectId, expenseId, {
        stage: 'APPROVE',
        decision: 'APPROVE',
        expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
      }),
    ).toThrow(ForbiddenException)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('a verifier cannot use the approval stage', async () => {
    actor = identity('MONITORING_AND_EVALUATION_OFFICER', [
      'expenses.read',
      'expenses.verify',
      'expenses.approve',
    ])
    state.actor = actor
    expect(await guard.canActivate(context)).toBe(true)
    expect(() =>
      controller.review(request, projectId, expenseId, {
        stage: 'APPROVE',
        decision: 'APPROVE',
        expectedUpdatedAt: '2026-09-27T00:00:00.000Z',
      }),
    ).toThrow(ForbiddenException)
  })
})
