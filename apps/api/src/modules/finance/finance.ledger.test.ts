import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { ReceiptPdfRenderer } from '../report-pdf/receipt-pdf.renderer'
import type { StorageService } from '../storage/storage.service'
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
      throw new ForbiddenException('Permission required.')
    return work(state.tx, actor)
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const budgetId = '20000000-0000-4000-8000-000000000002'
const requestId = '40000000-0000-4000-8000-000000000004'
const org = '30000000-0000-4000-8000-000000000003'
const updatedAt = new Date('2026-09-27T00:00:00.000Z')

const tx = {
  project: { findFirst: vi.fn() },
  projectBudgetRecord: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  budgetExpenseEntry: { findMany: vi.fn(), findFirst: vi.fn() },
  evidenceMedia: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $queryRaw: vi.fn(),
}
const receipts = { render: vi.fn() }
const service = new FinanceService(
  {} as PrismaService,
  {} as StorageService,
  receipts as unknown as ReceiptPdfRenderer,
)
const identity = (role: string, permissions: string[]): ApplicationIdentity => ({
  id: org,
  aal: 'aal2',
  userId: org,
  organizationId: org,
  fullName: 'Fictional finance user',
  roles: [role],
  permissions,
  assignedProjectIds: [projectId],
})
const budget = { category: 'Training', plannedBudget: '1000.00' }
const expense = {
  clientRequestId: requestId,
  budgetRecordId: budgetId,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-06-15',
}

describe('F2 budget and expense ledger gates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.tx = tx
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.projectBudgetRecord.create.mockResolvedValue({ id: budgetId, updatedAt })
    tx.projectBudgetRecord.findFirst.mockResolvedValue({ id: budgetId, updatedAt })
    tx.projectBudgetRecord.updateMany.mockResolvedValue({ count: 1 })
  })

  it('G-F2-14 creates a budget record with an audit entry', async () => {
    state.actor = identity('PROJECT_MANAGER', ['budgets.create'])
    await service.createBudget({} as ApplicationIdentity, projectId, budget)
    expect(tx.projectBudgetRecord.create.mock.calls[0]?.[0].data).toMatchObject({
      projectId,
      currency: 'PHP',
    })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.action).toBe('BUDGET_CREATED')
  })

  it('G-F2-14 replaces a budget by archiving the loaded revision and writing a new row', async () => {
    state.actor = identity('PROJECT_MANAGER', ['budgets.update'])
    await service.replaceBudget({} as ApplicationIdentity, projectId, budgetId, {
      ...budget,
      expectedUpdatedAt: updatedAt.toISOString(),
    })
    expect(tx.projectBudgetRecord.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: budgetId,
      updatedAt,
    })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.action).toBe('BUDGET_REPLACED')
  })

  it('G-F2-14 rejects a stale revision without archiving or writing', async () => {
    state.actor = identity('PROJECT_MANAGER', ['budgets.update'])
    await expect(
      service.replaceBudget({} as ApplicationIdentity, projectId, budgetId, {
        ...budget,
        expectedUpdatedAt: '2026-09-26T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.projectBudgetRecord.updateMany).not.toHaveBeenCalled()
    expect(tx.projectBudgetRecord.create).not.toHaveBeenCalled()
  })

  it('G-F2-14 rejects a replacement that lost the archive race', async () => {
    state.actor = identity('PROJECT_MANAGER', ['budgets.update'])
    tx.projectBudgetRecord.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      service.replaceBudget({} as ApplicationIdentity, projectId, budgetId, {
        ...budget,
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.projectBudgetRecord.create).not.toHaveBeenCalled()
  })

  it('G-F2-14 abuse: a caller without the budget grant or outside project scope writes nothing', async () => {
    state.actor = identity('PROJECT_OFFICER', ['budgets.read'])
    expect(() => service.createBudget({} as ApplicationIdentity, projectId, budget)).toThrow(
      ForbiddenException,
    )
    expect(() =>
      service.replaceBudget({} as ApplicationIdentity, projectId, budgetId, {
        ...budget,
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).toThrow(ForbiddenException)
    state.actor = identity('PROJECT_MANAGER', ['budgets.create'])
    tx.project.findFirst.mockResolvedValue(null)
    await expect(
      service.createBudget({} as ApplicationIdentity, projectId, budget),
    ).rejects.toThrow()
    expect(tx.projectBudgetRecord.create).not.toHaveBeenCalled()
  })

  it('G-F2-15 submits with the client request id so the database function can replay it', async () => {
    state.actor = identity('PROJECT_OFFICER', ['expenses.submit'])
    tx.$queryRaw.mockResolvedValue([{ value: { id: 'expense', status: 'PENDING' } }])
    await expect(service.submit({} as ApplicationIdentity, projectId, expense)).resolves.toEqual({
      id: 'expense',
      status: 'PENDING',
    })
    expect(tx.$queryRaw.mock.calls[0]?.slice(1)).toContain(requestId)
  })

  it('G-F2-15 refuses a submission without a client request id before any database work', () => {
    state.actor = identity('PROJECT_OFFICER', ['expenses.submit'])
    const { clientRequestId: _, ...withoutId } = expense
    expect(() => service.submit({} as ApplicationIdentity, projectId, withoutId)).toThrow(
      BadRequestException,
    )
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('names every reviewer on the ledger read and never exposes the rest of their record', async () => {
    const expenseId = '50000000-0000-4000-8000-000000000005'
    state.actor = identity('PROJECT_MANAGER', ['expenses.read'])
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.budgetExpenseEntry.findMany.mockResolvedValue([
      {
        id: expenseId,
        budgetRecordId: budgetId,
        description: 'Venue',
        amount: { toFixed: () => '250.00' },
        expenseDate: new Date('2026-06-15T00:00:00.000Z'),
        status: 'APPROVED',
        receiptEvidenceId: null,
        submittedById: org,
        verifiedById: org,
        approvedById: null,
        updatedAt,
        submittedBy: { fullName: 'Ron Perez' },
        verifiedBy: { fullName: 'Leah Sy' },
        approvedBy: null,
      },
    ])
    tx.$queryRaw.mockResolvedValue([
      { expenseId, signedOffById: org, signedOffAt: updatedAt, fullName: 'Jan Pascual' },
    ])
    const [row] = await service.expenses({} as ApplicationIdentity, projectId)
    expect(row).toMatchObject({
      submittedByName: 'Ron Perez',
      verifiedByName: 'Leah Sy',
      approvedByName: null,
      signedOffByName: 'Jan Pascual',
    })
    // Only the display name crosses over; the rest of the user record never leaves the read.
    expect(row).not.toHaveProperty('submittedBy')
    expect(row).not.toHaveProperty('verifiedBy')
    expect(row).not.toHaveProperty('approvedBy')
    expect(tx.budgetExpenseEntry.findMany.mock.calls[0]?.[0].select.submittedBy).toEqual({
      select: { fullName: true },
    })
  })

  it('builds the disbursement receipt from the expense, its budget line and its proof', async () => {
    const expenseId = '50000000-0000-4000-8000-000000000005'
    state.actor = identity('PROJECT_MANAGER', ['expenses.read'])
    tx.project.findFirst.mockResolvedValue({ id: projectId })
    tx.budgetExpenseEntry.findFirst.mockResolvedValue({
      id: expenseId,
      description: 'Partial payment to supplier for 150 school bags',
      amount: { toFixed: () => '96000.00' },
      expenseDate: new Date('2026-09-20T00:00:00.000Z'),
      status: 'APPROVED',
      receiptEvidenceId: '60000000-0000-4000-8000-000000000006',
      submittedAt: updatedAt,
      verifiedAt: updatedAt,
      approvedAt: null,
      submittedBy: { fullName: 'Ron Perez' },
      verifiedBy: { fullName: 'Leah Sy' },
      approvedBy: null,
      budgetRecord: {
        category: 'ACTIVITY_PROFILE_TOTAL',
        currency: 'PHP',
        plannedBudget: { toFixed: () => '150000.00' },
        activity: { code: 'SSG-05', title: 'School supply distribution' },
      },
      project: { code: 'SSG', title: 'Safe Schools for Girls' },
      organization: { name: 'Plan International Pilipinas' },
    })
    tx.evidenceMedia.findFirst.mockResolvedValue({
      fileName: 'supplier-invoice.pdf',
      sha256: 'a'.repeat(64),
      byteSize: 184320n,
    })
    tx.$queryRaw.mockResolvedValue([])
    receipts.render.mockResolvedValue(Buffer.from('%PDF-receipt'))
    const result = await service.officialReceipt({} as ApplicationIdentity, projectId, expenseId)
    expect(result.bytes.toString()).toBe('%PDF-receipt')
    const [renderedId, snapshot] = receipts.render.mock.calls[0] ?? []
    expect(renderedId).toBe(expenseId)
    expect(snapshot).toMatchObject({
      organization: 'Plan International Pilipinas',
      activity: { code: 'SSG-05', title: 'School supply distribution' },
      allocated: '150000.00',
      expense: { amount: '96000.00', currency: 'PHP', date: '2026-09-20' },
      people: { submitted: { name: 'Ron Perez' }, approved: { name: null } },
      attachment: { fileName: 'supplier-invoice.pdf', byteSize: '184320' },
    })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.action).toBe('EXPENSE_RECEIPT_GENERATED')
  })

  it('refuses the receipt without expenses.read and never renders a document', async () => {
    state.actor = identity('PROJECT_OFFICER', ['budgets.read'])
    await expect(
      service.officialReceipt(
        {} as ApplicationIdentity,
        projectId,
        '50000000-0000-4000-8000-000000000005',
      ),
    ).rejects.toThrow(ForbiddenException)
    expect(receipts.render).not.toHaveBeenCalled()
  })

  it('G-F2-18 sign-off requires the signoff permission and audits the recorded row', async () => {
    const expenseId = '50000000-0000-4000-8000-000000000005'
    state.actor = identity('PROJECT_OFFICER', ['expenses.read'])
    expect(() => service.signoff({} as ApplicationIdentity, projectId, expenseId)).toThrow(
      ForbiddenException,
    )
    state.actor = identity('GRANT_MANAGER', ['expenses.signoff'])
    tx.$queryRaw.mockResolvedValue([{ expenseId, signedOffById: org, signedOffAt: updatedAt }])
    await expect(
      service.signoff({} as ApplicationIdentity, projectId, expenseId),
    ).resolves.toMatchObject({ expenseId })
    expect(tx.auditLog.create.mock.calls[0]?.[0].data.action).toBe('EXPENSE_SIGNED_OFF')
  })
})
