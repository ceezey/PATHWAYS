import { describe, expect, it } from 'vitest'

import { allocationCreatesOverspend, budgetAllocationSchema } from './budget-form-validation'

describe('budget allocation validation', () => {
  it('accepts positive safe whole PHP amounts', () => {
    expect(budgetAllocationSchema.safeParse({ plannedAmount: 3_250_000 }).success).toBe(true)
  })

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    'rejects invalid planned amount %s',
    (plannedAmount) => {
      expect(budgetAllocationSchema.safeParse({ plannedAmount }).success).toBe(false)
    },
  )

  it('warns without invalidating an allocation below actual spending', () => {
    expect(budgetAllocationSchema.safeParse({ plannedAmount: 900 }).success).toBe(true)
    expect(allocationCreatesOverspend(900, 1_000)).toBe(true)
  })
})
