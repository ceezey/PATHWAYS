import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { PrismaService } from '../../prisma/prisma.service'
import { privateStorageFactories } from '../storage/private-storage-factories'
import type { StorageService } from '../storage/storage.service'
import { FinanceService } from './finance.service'
import type { ReceiptPdfRenderer } from './receipt-pdf.renderer'

const state = vi.hoisted(() => ({ permissions: [] as string[], tx: undefined as unknown }))
vi.mock('../../common/authz/authorized-operation', () => ({
  withAuthorizedOperation: (
    _db: unknown,
    identity: unknown,
    permission: string,
    work: (tx: unknown, actor: unknown) => unknown,
  ) => {
    state.permissions.push(permission)
    return work(state.tx, identity)
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const budgetId = '20000000-0000-4000-8000-000000000002'
const org = '30000000-0000-4000-8000-000000000003'
const requestId = '40000000-0000-4000-8000-000000000004'
const updatedAt = '2026-09-27T00:00:00.000Z'
const actor: ApplicationIdentity = {
  id: org,
  aal: 'aal2',
  userId: org,
  organizationId: org,
  fullName: 'Fictional finance user',
  roles: ['PROJECT_MANAGER'],
  permissions: [],
  assignedProjectIds: [projectId],
}
const tx = {
  project: { findFirst: vi.fn() },
  projectBudgetRecord: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
}
const service = new FinanceService(
  {} as PrismaService,
  {} as StorageService,
  {} as ReceiptPdfRenderer,
  privateStorageFactories,
)
const budget = { category: 'Training', plannedBudget: '1000.00' }
const expense = {
  clientRequestId: requestId,
  budgetRecordId: budgetId,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-06-15',
}
const pdf = Buffer.from('%PDF-synthetic')

// Calls a service method and returns its 400 message, or null when the body passed validation.
async function rejection(call: () => unknown): Promise<string | null> {
  try {
    await call()
    return null
  } catch (error) {
    if (error instanceof BadRequestException) return error.message
    return null
  }
}

describe('finance request validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permissions = []
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectBudgetRecord.create.mockResolvedValue({
      id: budgetId,
      updatedAt: new Date(updatedAt),
    })
    tx.projectBudgetRecord.findFirst.mockResolvedValue({
      id: budgetId,
      updatedAt: new Date(updatedAt),
    })
    tx.projectBudgetRecord.updateMany.mockResolvedValue({ count: 1 })
    tx.$queryRaw.mockResolvedValue([{ value: { id: budgetId } }])
  })

  it('stores a trimmed budget line with its optional fields', async () => {
    await service.createBudget(actor, projectId, {
      category: '  Training  ',
      plannedBudget: '0',
      activityId: null,
      remarks: '  Venue  ',
    })
    expect(tx.projectBudgetRecord.create.mock.calls[0]?.[0].data).toMatchObject({
      category: 'Training',
      plannedBudget: '0',
      activityId: null,
      remarks: 'Venue',
    })
  })

  it.each([
    [{}],
    [{ ...budget, category: '   ' }],
    [{ ...budget, plannedBudget: '1000.001' }],
    [{ ...budget, plannedBudget: '01' }],
    [{ ...budget, plannedBudget: 1000 }],
    [{ ...budget, activityId: 'not-a-uuid' }],
    [{ ...budget, extra: true }],
    [{ ...budget, expectedUpdatedAt: updatedAt }],
  ])('refuses budget body %j with the fixed message', async (body) => {
    expect(await rejection(() => service.createBudget(actor, projectId, body))).toBe(
      'Invalid budget record.',
    )
    expect(state.permissions).toEqual([])
  })

  it('replaces a budget without storing the expected revision', async () => {
    await service.replaceBudget(actor, projectId, budgetId, {
      ...budget,
      expectedUpdatedAt: updatedAt,
    })
    expect(tx.projectBudgetRecord.create.mock.calls[0]?.[0].data).not.toHaveProperty(
      'expectedUpdatedAt',
    )
  })

  it.each([
    [budget],
    [{ ...budget, expectedUpdatedAt: '2026-09-27' }],
    [{ ...budget, expectedUpdatedAt: updatedAt, extra: 1 }],
  ])('refuses budget replacement %j with the fixed message', async (body) => {
    expect(await rejection(() => service.replaceBudget(actor, projectId, budgetId, body))).toBe(
      'Invalid budget replacement.',
    )
    expect(state.permissions).toEqual([])
  })

  it('submits a trimmed expense with its values in order', async () => {
    await service.submit(actor, projectId, { ...expense, description: '  Venue  ' })
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      projectId,
      requestId,
      budgetId,
      'Venue',
      '250.00',
      '2026-06-15',
    ])
  })

  it('passes the smallest positive amount to the database unchanged', async () => {
    await service.submit(actor, projectId, { ...expense, amount: '0.01' })
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toContain('0.01')
  })

  it.each([
    [{ ...expense, amount: '0' }],
    [{ ...expense, amount: '0.00' }],
    [{ ...expense, amount: '1e5' }],
    [{ ...expense, amount: '-1' }],
    [{ ...expense, amount: 250 }],
    [{ ...expense, expenseDate: '2026-02-30' }],
    [{ ...expense, expenseDate: '2026-6-15' }],
    [{ ...expense, description: '' }],
    [{ ...expense, clientRequestId: 'x' }],
    [{ ...expense, extra: true }],
  ])('refuses expense %j with the fixed message', async (body) => {
    expect(await rejection(() => service.submit(actor, projectId, body))).toBe(
      'Invalid expense submission.',
    )
    expect(state.permissions).toEqual([])
  })

  // These amounts made the old Prisma.Decimal refinement throw, which answered 500.
  it.each([['abc'], [''], [' 1']])('refuses amount %j with the fixed message', async (amount) => {
    expect(await rejection(() => service.submit(actor, projectId, { ...expense, amount }))).toBe(
      'Invalid expense submission.',
    )
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'VERIFY' }, 'expenses.verify', 'VERIFY', null],
    [{ decision: 'APPROVE', stage: 'APPROVE' }, 'expenses.approve', 'APPROVE', null],
    [
      { decision: 'REJECT', stage: 'VERIFY', reason: ' Duplicate ' },
      'expenses.verify',
      'REJECT',
      'Duplicate',
    ],
  ])('reviews %j under the stage permission', async (body, permission, decision, reason) => {
    await service.review(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt, ...body })
    expect(state.permissions).toEqual([permission])
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toEqual([
      projectId,
      budgetId,
      new Date(updatedAt),
      decision,
      reason,
    ])
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'APPROVE' }],
    [{ decision: 'VERIFY', stage: 'VERIFY', reason: 'Not allowed' }],
    [{ decision: 'REJECT', stage: 'APPROVE' }],
    [{ decision: 'REJECT', stage: 'APPROVE', reason: '   ' }],
    [{ decision: 'SKIP', stage: 'VERIFY' }],
  ])('refuses review %j with the fixed message', async (body) => {
    expect(
      await rejection(() =>
        service.review(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt, ...body }),
      ),
    ).toBe('Invalid expense review.')
    expect(state.permissions).toEqual([])
  })

  it('passes a receipt body that holds only the expected revision', async () => {
    const file = { buffer: pdf, size: pdf.length, mimetype: 'image/png' }
    expect(
      await rejection(() =>
        service.uploadReceipt(actor, projectId, budgetId, { expectedUpdatedAt: updatedAt }, file),
      ),
    ).toBe('Receipt content does not match its supported format.')
  })

  it.each([
    [{}],
    [{ expectedUpdatedAt: 'yesterday' }],
    [{ expectedUpdatedAt: updatedAt, note: 'x' }],
  ])('refuses receipt body %j with the fixed message', async (body) => {
    const file = { buffer: pdf, size: pdf.length, mimetype: 'application/pdf' }
    expect(
      await rejection(() => service.uploadReceipt(actor, projectId, budgetId, body, file)),
    ).toBe('Invalid private receipt upload.')
    expect(state.permissions).toEqual([])
  })
})
