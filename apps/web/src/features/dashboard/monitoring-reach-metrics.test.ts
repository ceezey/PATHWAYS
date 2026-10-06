import type { MonitoringDashboard } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { monitoringReachMetrics } from './monitoring-reach-metrics'

describe('monitoringReachMetrics', () => {
  it('shows withheld and suppressed counts by label, never as 0', () => {
    const result = {
      scopeProjectCount: 2,
      participationRecords: { state: 'AVAILABLE', value: '1234', reason: null },
      attendingIndividuals: {
        state: 'SUPPRESSED',
        value: null,
        reason: 'COMPLEMENTARY_SUPPRESSION',
      },
      enrolledIndividuals: {
        state: 'MISSING',
        value: null,
        reason: 'SENSITIVE_RELEASE_NOT_ENABLED_V1',
      },
      enrolledBeneficiaryRecords: { state: 'ZERO', value: '0', reason: null },
    } as unknown as MonitoringDashboard
    expect(monitoringReachMetrics(result).map((metric) => [metric.id, metric.value])).toEqual([
      ['projects', '2'],
      ['participation', '1,234'],
      ['attending', 'Suppressed (fewer than 5)'],
      ['enrolled', 'Unavailable'],
    ])
  })
})
