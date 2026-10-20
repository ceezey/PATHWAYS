import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION,
  dashboardActionCountsSchema,
} from './action-counts'

const valid = {
  contractVersion: DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION,
  businessDate: '2026-06-01',
  pendingApprovals: 2,
  activeAlerts: { count: 1, capped: false },
  overdueActivities: { count: 3, mostOverdue: { code: 'ACT-1', daysLate: 4 } },
  forReview: null,
}

describe('dashboardActionCountsSchema', () => {
  it('accepts a full payload and null counts for hidden sources', () => {
    expect(dashboardActionCountsSchema.safeParse(valid).success).toBe(true)
    expect(
      dashboardActionCountsSchema.safeParse({
        ...valid,
        pendingApprovals: null,
        activeAlerts: null,
        overdueActivities: { count: 0, mostOverdue: null },
      }).success,
    ).toBe(true)
  })

  it('rejects an unknown key at the top level', () => {
    expect(dashboardActionCountsSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false)
  })

  it('rejects an unknown key in the active alerts object', () => {
    const activeAlerts = { ...valid.activeAlerts, extra: 1 }
    expect(dashboardActionCountsSchema.safeParse({ ...valid, activeAlerts }).success).toBe(false)
  })

  it('rejects an unknown key in the overdue activities object', () => {
    const overdueActivities = { ...valid.overdueActivities, extra: 1 }
    expect(dashboardActionCountsSchema.safeParse({ ...valid, overdueActivities }).success).toBe(
      false,
    )
  })

  it('rejects an unknown key in the most overdue activity', () => {
    const overdueActivities = {
      count: 3,
      mostOverdue: { code: 'ACT-1', daysLate: 4, extra: 1 },
    }
    expect(dashboardActionCountsSchema.safeParse({ ...valid, overdueActivities }).success).toBe(
      false,
    )
  })
})
