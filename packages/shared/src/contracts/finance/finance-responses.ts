import { z } from 'zod'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)

// Response shapes of the finance routes; the api only uses their types and the web parses them.

// One budget line; the stored currency is a three character string, so the web narrows it to PHP.
export const budgetResponse = z
  .object({
    id: uuid,
    activityId: uuid.nullable(),
    category: z.string(),
    currency: z.string(),
    plannedBudget: decimal,
    remarks: z.string().nullable(),
    updatedAt: timestamp,
  })
  .strict()
export type BudgetResponse = z.infer<typeof budgetResponse>

// The receipt of a budget create or replace.
export const budgetWriteResponse = z.object({ id: uuid, updatedAt: timestamp }).strict()
export type BudgetWriteResponse = z.infer<typeof budgetWriteResponse>

// One budget line as the expense form lists it; the SQL function that builds it returns untyped JSON.
export const budgetReferenceResponse = z
  .object({ id: uuid, category: z.string(), activityId: uuid.nullable() })
  .strict()
export type BudgetReferenceResponse = z.infer<typeof budgetReferenceResponse>

// One expense with its reviewer names and sign-off.
export const expenseResponse = z
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
export type ExpenseResponse = z.infer<typeof expenseResponse>

// The receipt of an expense submit, review or receipt upload; a SQL function builds it as untyped JSON.
export const expenseAcknowledgementResponse = z
  .object({
    id: uuid,
    projectId: uuid,
    status: z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']),
    updatedAt: timestamp,
    receiptEvidenceId: uuid.nullable(),
  })
  .strict()
export type ExpenseAcknowledgementResponse = z.infer<typeof expenseAcknowledgementResponse>

// The receipt of an expense sign-off.
export const expenseSignoffResponse = z
  .object({ expenseId: uuid, signedOffById: uuid, signedOffAt: timestamp })
  .strict()
export type ExpenseSignoffResponse = z.infer<typeof expenseSignoffResponse>
