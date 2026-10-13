import { describe, expect, it } from 'vitest'

import {
  createBudgetRequest,
  replaceBudgetRequest,
  reviewExpenseRequest,
  submitExpenseRequest,
  uploadExpenseReceiptRequest,
} from './finance-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const revision = '2026-09-27T00:00:00.000Z'
const expense = {
  clientRequestId: uuid,
  budgetRecordId: uuid,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-06-15',
}

describe('finance request contracts', () => {
  it('trims a budget line and keeps a zero planned amount', () => {
    expect(
      createBudgetRequest.parse({ category: ' Training ', plannedBudget: '0', remarks: null }),
    ).toEqual({ category: 'Training', plannedBudget: '0', remarks: null })
  })

  it('needs the loaded revision only to replace a budget', () => {
    const line = { category: 'Training', plannedBudget: '10.50' }
    expect(createBudgetRequest.safeParse({ ...line, expectedUpdatedAt: revision }).success).toBe(
      false,
    )
    expect(replaceBudgetRequest.parse({ ...line, expectedUpdatedAt: revision })).toEqual({
      ...line,
      expectedUpdatedAt: revision,
    })
    expect(replaceBudgetRequest.safeParse(line).success).toBe(false)
  })

  it.each(['0', '0.00', '-1', '1e5', '1.234', 'abc', '', ' 1'])(
    'rejects the expense amount %j without throwing',
    (amount) => {
      expect(submitExpenseRequest.safeParse({ ...expense, amount }).success).toBe(false)
    },
  )

  it.each(['0.01', '1', '9999999999999999.99'])('accepts the expense amount %j', (amount) => {
    expect(submitExpenseRequest.safeParse({ ...expense, amount }).success).toBe(true)
  })

  it('rejects an impossible expense date', () => {
    expect(submitExpenseRequest.safeParse({ ...expense, expenseDate: '2026-02-30' }).success).toBe(
      false,
    )
  })

  it.each([
    [{ decision: 'VERIFY', stage: 'VERIFY' }, true],
    [{ decision: 'REJECT', stage: 'APPROVE', reason: 'Duplicate' }, true],
    [{ decision: 'APPROVE', stage: 'VERIFY' }, false],
    [{ decision: 'APPROVE', stage: 'APPROVE', reason: 'No' }, false],
    [{ decision: 'REJECT', stage: 'VERIFY' }, false],
  ])('decides review %j as %s', (body, accepted) => {
    expect(reviewExpenseRequest.safeParse({ expectedUpdatedAt: revision, ...body }).success).toBe(
      accepted,
    )
  })

  it('accepts only the expected revision as receipt text fields', () => {
    expect(uploadExpenseReceiptRequest.safeParse({ expectedUpdatedAt: revision }).success).toBe(
      true,
    )
    expect(
      uploadExpenseReceiptRequest.safeParse({ expectedUpdatedAt: revision, file: 'x' }).success,
    ).toBe(false)
  })
})
