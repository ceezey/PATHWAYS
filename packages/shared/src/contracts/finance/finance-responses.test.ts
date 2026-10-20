import { describe, expect, it } from 'vitest'

import {
  budgetResponse,
  budgetWriteResponse,
  expenseAcknowledgementResponse,
  expenseResponse,
  expenseSignoffResponse,
} from './finance-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'
const budget = {
  id: uuid,
  activityId: null,
  category: 'Training',
  currency: 'PHP',
  plannedBudget: '1500.00',
  remarks: null,
  updatedAt: stamp,
}
const expense = {
  id: uuid,
  budgetRecordId: uuid,
  description: 'Venue',
  amount: '250.00',
  expenseDate: '2026-09-01',
  status: 'PENDING',
  receiptEvidenceId: null,
  submittedById: uuid,
  verifiedById: null,
  approvedById: null,
  updatedAt: stamp,
  signedOffById: null,
  signedOffAt: null,
  submittedByName: 'Fictional Officer',
  verifiedByName: null,
  approvedByName: null,
  signedOffByName: null,
}

describe('finance response contracts', () => {
  it('accepts a budget line and leaves the PHP check to the web client', () => {
    expect(budgetResponse.safeParse(budget).success).toBe(true)
    expect(budgetResponse.safeParse({ ...budget, currency: 'USD' }).success).toBe(true)
    expect(budgetResponse.safeParse({ ...budget, plannedBudget: '1,500' }).success).toBe(false)
    expect(budgetResponse.safeParse({ ...budget, extra: true }).success).toBe(false)
  })

  it('accepts an expense with its reviewer names and rejects a status outside the review states', () => {
    expect(expenseResponse.safeParse(expense).success).toBe(true)
    expect(expenseResponse.safeParse({ ...expense, status: 'PAID' }).success).toBe(false)
    expect(
      expenseResponse.safeParse({ ...expense, submittedByName: 'x'.repeat(201) }).success,
    ).toBe(false)
  })

  it('accepts an expense date that is not a plain calendar date', () => {
    for (const expenseDate of ['2026-10-14T08:00:00.000Z', '14/10/2026']) {
      expect(expenseResponse.safeParse({ ...expense, expenseDate }).success).toBe(true)
    }
  })

  it('accepts the receipts of a budget write, an expense action and a sign-off', () => {
    expect(budgetWriteResponse.safeParse({ id: uuid, updatedAt: stamp }).success).toBe(true)
    const ack = { id: uuid, projectId: uuid, status: 'VERIFIED', updatedAt: stamp }
    expect(
      expenseAcknowledgementResponse.safeParse({ ...ack, receiptEvidenceId: null }).success,
    ).toBe(true)
    expect(expenseAcknowledgementResponse.safeParse(ack).success).toBe(false)
    const signoff = { expenseId: uuid, signedOffById: uuid, signedOffAt: stamp }
    expect(expenseSignoffResponse.safeParse(signoff).success).toBe(true)
    expect(expenseSignoffResponse.safeParse({ ...signoff, id: uuid }).success).toBe(false)
  })
})
