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
})
