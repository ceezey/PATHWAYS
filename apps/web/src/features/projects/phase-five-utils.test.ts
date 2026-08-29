import { describe, expect, it } from 'vitest'

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
      label: 'New indicator',
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
        description: 'Venue expense',
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
        description: 'Travel expense',
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

  it('handles an empty expense ledger without inventing spending', () => {
    expect(calculateExpenseTotal([])).toBe(0)
    expect(calculateRemainingBudget(500, calculateExpenseTotal([]))).toBe(500)
  })
})
