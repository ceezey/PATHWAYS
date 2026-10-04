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
  { id: 'b1', activityId: 'a1', category: 'ACTIVITY_PROFILE_TOTAL', plannedBudget: '1000.00' },
  { id: 'b2', activityId: null, category: 'TRAVEL', plannedBudget: '500.00' },
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
  describe('project envelope', () => {
    const envelope = {
      id: 'env',
      activityId: null,
      category: 'PROJECT_PROFILE_TOTAL',
      plannedBudget: '5000.00',
    }
    const act = (id: string, activityId: string, plannedBudget: string) => ({
      id,
      activityId,
      category: 'ACTIVITY_PROFILE_TOTAL',
      plannedBudget,
    })
    const sum = (rows: ReturnType<typeof buildActivityRows>, field: 'allocated' | 'used') =>
      rows.reduce((total, row) => total + row[field], 0)

    it('totals the envelope once and shows the unallocated remainder', () => {
      const expenses = [
        exp('e1', 'a-1', '1000.00', 'APPROVED'),
        exp('e2', 'env', '500.00', 'APPROVED'),
        exp('e3', 'env', '200.00', 'PENDING'),
      ]
      const budgetRows = [envelope, act('a-1', 'a1', '2000.00'), act('a-2', 'a2', '1000.00')]
      const rows = buildActivityRows(budgetRows, expenses, labels)
      expect(sum(rows, 'allocated')).toBe(5000)
      expect(rows.find((row) => row.activityId === null)).toMatchObject({
        allocated: 2000,
        used: 500,
        pending: 200,
      })
      expect(utilization(sum(rows, 'used'), sum(rows, 'allocated'))).toBe(30)
    })

    it('uses the envelope alone when there are no activity rows', () => {
      const rows = buildActivityRows([envelope], [exp('e1', 'env', '2500.00', 'APPROVED')], labels)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ allocated: 5000, used: 2500, utilization: 50 })
    })

    it('falls back to the sum of activity rows without an envelope', () => {
      const rows = buildActivityRows(
        [act('a-1', 'a1', '2000.00'), act('a-2', 'a2', '1000.00')],
        [],
        labels,
      )
      expect(sum(rows, 'allocated')).toBe(3000)
      expect(rows.some((row) => row.activityId === null)).toBe(false)
    })

    it('shows a negative remainder when activities exceed the envelope', () => {
      const rows = buildActivityRows(
        [envelope, act('a-1', 'a1', '4000.00'), act('a-2', 'a2', '2000.00')],
        [],
        labels,
      )
      expect(rows.find((row) => row.activityId === null)).toMatchObject({
        allocated: -1000,
        utilization: null,
      })
      expect(sum(rows, 'allocated')).toBe(5000)
    })
  })
})
