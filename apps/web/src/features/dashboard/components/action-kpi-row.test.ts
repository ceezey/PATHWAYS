import { AlertTriangle, ClipboardList, Clock, FileCheck } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { actionKpiCards } from './action-kpi-row'

const base = {
  contractVersion: 'dashboard.action-counts.v1' as const,
  businessDate: '2026-10-03',
  pendingApprovals: null,
  activeAlerts: null,
  overdueActivities: null,
  forReview: null,
}

describe('actionKpiCards', () => {
  it('hides every card whose count is null', () => {
    expect(actionKpiCards(base)).toEqual([])
  })

  it('keeps zero counts and formats the qualifiers', () => {
    const cards = actionKpiCards({
      ...base,
      pendingApprovals: 0,
      activeAlerts: { count: 100, capped: true },
      overdueActivities: { count: 2, mostOverdue: { code: 'ACT-9', daysLate: 1 } },
      forReview: 4,
    })
    expect(cards.map((card) => [card.label, card.value, card.sub])).toEqual([
      ['Pending approvals', '0', 'Expenses awaiting review'],
      ['Active budget alerts', '100+', 'Require your decision'],
      ['Overdue activities', '2', 'ACT-9 is 1 day late'],
      ['For review', '4', 'Evidence submitted'],
    ])
  })

  it('uses the plural for any day count other than one', () => {
    const sub = (daysLate: number) =>
      actionKpiCards({
        ...base,
        overdueActivities: { count: 1, mostOverdue: { code: 'ACT-9', daysLate } },
      })[0].sub
    expect([sub(0), sub(1), sub(2), sub(11)]).toEqual([
      'ACT-9 is 0 days late',
      'ACT-9 is 1 day late',
      'ACT-9 is 2 days late',
      'ACT-9 is 11 days late',
    ])
  })

  it('says nothing is past due when no activity is most overdue', () => {
    const [card] = actionKpiCards({
      ...base,
      overdueActivities: { count: 0, mostOverdue: null },
    })
    expect([card.value, card.sub]).toEqual(['0', 'Nothing is past due'])
  })

  it('keeps an alert card with a count of 0 and marks only a capped count', () => {
    const value = (activeAlerts: { count: number; capped: boolean }) =>
      actionKpiCards({ ...base, activeAlerts }).map((card) => card.value)
    expect(value({ count: 0, capped: false })).toEqual(['0'])
    expect(value({ count: 0, capped: true })).toEqual(['0+'])
    expect(value({ count: 7, capped: false })).toEqual(['7'])
  })

  it('gives each card its own tone, icon and target', () => {
    const cards = actionKpiCards({
      ...base,
      pendingApprovals: 1,
      activeAlerts: { count: 1, capped: false },
      overdueActivities: { count: 1, mostOverdue: null },
      forReview: 1,
    })
    expect(cards.map((card) => [card.id, card.tone, card.icon, card.href])).toEqual([
      ['pending-approvals', 'danger', ClipboardList, '/projects'],
      ['active-alerts', 'warning', AlertTriangle, '/alerts'],
      ['overdue-activities', 'info', Clock, '/projects'],
      ['for-review', 'success', FileCheck, '/projects'],
    ])
  })
})
