import { z } from 'zod'

const uuid = z.string().uuid()
const revision = z.string().datetime({ offset: true })
// A non-negative PHP amount sent as text, with at most two decimal places.
const money = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)

// Body of POST projects/:projectId/finance/budgets.
export const createBudgetRequest = z
  .object({
    category: z.string().trim().min(1).max(200),
    plannedBudget: money,
    activityId: uuid.nullable().optional(),
    remarks: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
export type CreateBudgetRequest = z.infer<typeof createBudgetRequest>

// Body of PATCH projects/:projectId/finance/budgets/:budgetId.
export const replaceBudgetRequest = createBudgetRequest.extend({ expectedUpdatedAt: revision })
export type ReplaceBudgetRequest = z.infer<typeof replaceBudgetRequest>

// Body of POST projects/:projectId/finance/expenses; a money string is above zero when any digit is.
export const submitExpenseRequest = z
  .object({
    clientRequestId: uuid,
    budgetRecordId: uuid,
    description: z.string().trim().min(1).max(2000),
    amount: money.refine((value) => /[1-9]/.test(value)),
    expenseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          Number.isFinite(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value,
      ),
  })
  .strict()
export type SubmitExpenseRequest = z.infer<typeof submitExpenseRequest>

// Body of POST projects/:projectId/finance/expenses/:expenseId/review; only a rejection carries a reason.
export const reviewExpenseRequest = z
  .object({
    expectedUpdatedAt: revision,
    decision: z.enum(['VERIFY', 'APPROVE', 'REJECT']),
    stage: z.enum(['VERIFY', 'APPROVE']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) =>
    value.decision !== 'REJECT'
      ? value.decision === value.stage && value.reason === undefined
      : value.reason !== undefined,
  )
export type ReviewExpenseRequest = z.infer<typeof reviewExpenseRequest>

// Text fields of the multipart POST projects/:projectId/finance/expenses/:expenseId/receipt.
export const uploadExpenseReceiptRequest = z.object({ expectedUpdatedAt: revision }).strict()
export type UploadExpenseReceiptRequest = z.infer<typeof uploadExpenseReceiptRequest>
