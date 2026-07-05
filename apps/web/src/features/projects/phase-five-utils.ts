import { z } from 'zod'

import type { ExpenseRecord } from '@/types/pathways'

export const addIndicatorSchema = z.object({
  code: z.string().min(2, 'Enter an indicator code.'),
  label: z.string().min(5, 'Enter an indicator label.'),
  baseline: z.coerce.number().min(0),
  target: z.coerce.number().min(1, 'Enter a target greater than zero.'),
  actual: z.coerce.number().min(0),
})

export const annotationSchema = z.object({
  note: z.string().min(5, 'Enter an annotation note.'),
})

export const formalEvaluationSchema = z.object({
  score: z.coerce.number().min(0).max(100),
  note: z.string().min(5, 'Enter an evaluation note.'),
})

export const recommendationOutcomeSchema = z.object({
  outcome: z.enum(['Accept', 'Partially Accept', 'Decline', 'Escalate']),
  note: z.string().min(5, 'Enter an outcome note.'),
})

export const logExpenseSchema = z.object({
  description: z.string().min(5, 'Enter an expense description.'),
  amount: z.coerce.number().min(1, 'Enter an expense amount.'),
  expenseDate: z.string().min(1, 'Choose an expense date.'),
  submitter: z.string().min(2, 'Enter a submitter.'),
})

export const rejectionReasonSchema = z.object({
  reason: z.string().min(5, 'Enter a rejection reason.'),
})

export const calculateExpenseTotal = (expenses: ExpenseRecord[]) =>
  expenses.reduce((total, expense) => total + expense.amount, 0)

export const calculateRemainingBudget = (plannedAmount: number, actualSpending: number) =>
  plannedAmount - actualSpending
