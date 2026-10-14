import {
  type CreateBudgetRequest,
  type ReplaceBudgetRequest,
  type ReviewExpenseRequest,
  type SubmitExpenseRequest,
  budgetReferenceResponse,
  budgetResponse,
  budgetWriteResponse,
  expenseAcknowledgementResponse,
  expenseResponse,
  expenseSignoffResponse,
} from '@pathways/shared'
import { z } from 'zod'

import { ownedJsonPost, ownedJsonRead, projectPath } from '@/lib/api/core/owned-json-read'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
// The stored currency is a plain string, so the client keeps refusing every currency but PHP.
const budgetSchema = budgetResponse.extend({ currency: z.literal('PHP') })
export const financeClient = {
  budgets: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/finance/budgets`, z.array(budgetSchema).max(100), { signal }),
  createBudget: (id: string, body: CreateBudgetRequest) =>
    ownedJsonPost(`${projectPath(id)}/finance/budgets`, budgetWriteResponse, body),
  replaceBudget: (id: string, budgetId: string, body: ReplaceBudgetRequest) =>
    ownedJsonRead(
      `${projectPath(id)}/finance/budgets/${uuid.parse(budgetId)}`,
      budgetWriteResponse,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  expenses: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(`${projectPath(id)}/finance/expenses`, z.array(expenseResponse).max(100), {
      signal,
    }),
  budgetReferences: (id: string, signal?: AbortSignal) =>
    ownedJsonRead(
      `${projectPath(id)}/finance/expense-budget-references`,
      z.array(budgetReferenceResponse).max(100),
      { signal },
    ),
  submitExpense: (id: string, body: SubmitExpenseRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses`,
      expenseAcknowledgementResponse.refine((row) => row.projectId === id),
      body,
    ),
  reviewExpense: (id: string, expenseId: string, body: ReviewExpenseRequest) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/review`,
      expenseAcknowledgementResponse.refine((row) => row.projectId === id && row.id === expenseId),
      body,
    ),
  signoffExpense: (id: string, expenseId: string) =>
    ownedJsonPost(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/signoff`,
      expenseSignoffResponse.refine((row) => row.expenseId === expenseId),
      {},
    ),
  uploadReceipt: (id: string, expenseId: string, updatedAt: string, file: File) => {
    const data = new FormData()
    data.append('expectedUpdatedAt', timestamp.parse(updatedAt))
    data.append('file', file)
    return ownedJsonRead(
      `${projectPath(id)}/finance/expenses/${uuid.parse(expenseId)}/receipt`,
      expenseAcknowledgementResponse.refine((row) => row.projectId === id && row.id === expenseId),
      {
        method: 'POST',
        body: data,
      },
    )
  },
}
