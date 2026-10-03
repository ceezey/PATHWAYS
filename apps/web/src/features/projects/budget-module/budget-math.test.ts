import { describe, expect, it } from 'vitest'

import {
  type ExpenseRow,
  buildActivityRows,
  deriveAlerts,
  deriveRecommendations,
  remaining,
  toneFor,
  utilization,
} from './budget-math'

const budgets = [
  { id: 'b1', activityId: 'a1', plannedBudget: '1000.00' },
  { id: 'b2', activityId: null, plannedBudget: '500.00' },
]
const labels = [{ id: 'a1', code: 'ACT-1', title: 'Training' }]
const exp = (
  id: string,
  budgetRecordId: string,
  amount: string,
  status: ExpenseRow['status'],
  receiptEvidenceId: string | null = 'r',
): ExpenseRow => ({ id, budgetRecordId, amount, status, receiptEvidenceId })

describe('budget math', () => {
  it('computes utilization and remaining', () => {
    expect(utilization(250, 1000)).toBe(25)
    expect(utilization(10, 0)).toBeNull()
    expect(remaining(1000, 250)).toBe(750)
  })

  it('maps thresholds to tones', () => {
    expect(toneFor(90)).toBe('danger')
    expect(toneFor(89)).toBe('warning')
    expect(toneFor(70)).toBe('warning')
    expect(toneFor(69)).toBe('success')
    expect(toneFor(null)).toBe('info')
  })

  it('counts only approved expenses as used and separates pending', () => {
    const rows = buildActivityRows(
      budgets,
      [
        exp('e1', 'b1', '900.00', 'APPROVED'),
        exp('e2', 'b1', '50.00', 'PENDING'),
        exp('e3', 'b1', '40.00', 'REJECTED'),
        exp('e4', 'b2', '100.00', 'VERIFIED'),
      ],
      labels,
    )
    expect(rows.find((row) => row.activityId === 'a1')).toMatchObject({
      allocated: 1000,
      used: 900,
      pending: 50,
      utilization: 90,
    })
    expect(rows.find((row) => row.activityId === null)).toMatchObject({ used: 0, pending: 100 })
  })

  it('derives alerts and advisory recommendations', () => {
    const expenses = [
      exp('e1', 'b1', '900.00', 'APPROVED'),
      exp('e2', 'b1', '10.00', 'PENDING', null),
    ]
    const rows = buildActivityRows(budgets, expenses, labels)
    expect(deriveAlerts(rows, expenses, 1500, 900).map((alert) => alert.id)).toEqual([
      'high-a1',
      'missing-receipt',
    ])
    expect(deriveRecommendations(rows)).toHaveLength(1)
    expect(deriveAlerts(rows, [], 1500, 1400).some((a) => a.id === 'low-remaining')).toBe(true)
  })
})
