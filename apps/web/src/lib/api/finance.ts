import type {
  CreateBudgetRequest,
  ReplaceBudgetRequest,
  ReviewExpenseRequest,
  SubmitExpenseRequest,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const budgetSchema = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    category: z.string(),
    currency: z.literal('PHP'),
    plannedBudget: decimal,
    remarks: z.string().nullable(),
    updatedAt: timestamp,
  })
  .strict()
const expenseSchema = z
  .object({
    id: uuid,
    budgetRecordId: uuid,
    description: z.string(),
    amount: decimal,
    expenseDate: z.string(),
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    receiptEvidenceId: uuid.nullable(),
    submittedById: uuid,
    verifiedById: uuid.nullable(),
    approvedById: uuid.nullable(),
    updatedAt: timestamp,
    signedOffById: uuid.nullable(),
    signedOffAt: timestamp.nullable(),
    submittedByName: z.string().max(200).nullable(),
    verifiedByName: z.string().max(200).nullable(),
    approvedByName: z.string().max(200).nullable(),
    signedOffByName: z.string().max(200).nullable(),
  })
  .strict()
const expenseAck = z
  .object({
    id: uuid,
    projectId: uuid,
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    updatedAt: timestamp,
    receiptEvidenceId: uuid.nullable(),
  })
  .strict()
export const financeClient = {
  budgets: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/finance/budgets`, z.array(budgetSchema).max(100), { signal }),
  createBudget: (id: string, body: CreateBudgetRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/budgets`,
      z.object({ id: uuid, updatedAt: timestamp }).strict(),
      body,
    ),
  replaceBudget: (id: string, budgetId: string, body: ReplaceBudgetRequest) =>
    ownedJsonRead(
      `${projectPath(id)}/finance/budgets/${uuid.parse(budgetId)}`,
      z.object({ id: uuid, updatedAt: timestamp }).strict(),
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  expenses: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/finance/expenses`, z.array(expenseSchema).max(100), {
      signal,
    }),
  budgetReferences: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/finance/expense-budget-references`,
      z
        .array(z.object({ id: uuid, category: z.string(), activityId: uuid.nullable() }).strict())
        .max(100),
      { signal },
    ),
  submitExpense: (id: string, body: SubmitExpenseRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses`,
      expenseAck.refine((row) => row.projectId === id),
      body,
    ),
  reviewExpense: (id: string, expenseId: string, body: ReviewExpenseRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/review`,
      expenseAck.refine((row) => row.projectId === id && row.id === expenseId),
      body,
    ),
  signoffExpense: (id: string, expenseId: string) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/signoff`,
      z
        .object({ expenseId: uuid, signedOffById: uuid, signedOffAt: timestamp })
        .strict()
        .refine((row) => row.expenseId === expenseId),
      {},
    ),
  uploadReceipt: (id: string, expenseId: string, updatedAt: string, file: File) => {
    const data = new FormData()
    data.append('expectedUpdatedAt', timestamp.parse(updatedAt))
    data.append('file', file)
    return ownedJsonRead(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/receipt`,
      expenseAck.refine((row) => row.projectId === id && row.id === expenseId),
      {
        method: 'POST',
        body: data,
      },
    )
  },
}
