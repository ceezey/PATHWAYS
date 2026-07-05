import { describe, expect, it } from 'vitest'

import { mockBudgets, mockExpenses } from '@/mocks/pathways'

import {
  addIndicatorSchema,
  calculateExpenseTotal,
  calculateRemainingBudget,
  logExpenseSchema,
  recommendationOutcomeSchema,
} from './phase-five-utils'

describe('phase five workspace utilities', () => {
  it('validates add-indicator inputs', () => {
    const result = addIndicatorSchema.safeParse({
      code: 'NEW-IND',
      label: 'New prototype indicator',
      baseline: 0,
      target: 100,
      actual: 25,
    })

    expect(result.success).toBe(true)
  })

  it('rejects incomplete recommendation outcomes and expenses', () => {
    expect(recommendationOutcomeSchema.safeParse({ outcome: 'Accept', note: '' }).success).toBe(
      false,
    )
    expect(logExpenseSchema.safeParse({ description: '', amount: 0 }).success).toBe(false)
  })

  it('keeps budget and expense totals internally consistent', () => {
    const total = calculateExpenseTotal([
      {
        id: 'expense-a',
        projectId: 'project-a',
        description: 'Prototype expense',
        amount: 125,
        submitter: 'Project Officer A',
        submittedDate: '2026-07-05',
        expenseDate: '2026-07-05',
        hasReceipt: true,
        liquidationStatus: 'Pending',
      },
      {
        id: 'expense-b',
        projectId: 'project-a',
        description: 'Second prototype expense',
        amount: 75,
        submitter: 'Project Officer A',
        submittedDate: '2026-07-05',
        expenseDate: '2026-07-05',
        hasReceipt: false,
        liquidationStatus: 'Verified',
      },
    ])

    expect(total).toBe(200)
    expect(calculateRemainingBudget(500, total)).toBe(300)
  })

  it('keeps visible mock expense ledgers aligned with budget actual spending', () => {
    for (const budget of mockBudgets) {
      const expenseTotal = calculateExpenseTotal(
        mockExpenses.filter((expense) => expense.projectId === budget.projectId),
      )

      expect(expenseTotal).toBe(budget.actualSpending)
      expect(calculateRemainingBudget(budget.plannedAmount, expenseTotal)).toBe(
        budget.plannedAmount - budget.actualSpending,
      )
    }
  })
})
