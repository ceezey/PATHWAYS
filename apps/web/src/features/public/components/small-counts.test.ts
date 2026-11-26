import type { PublicAnalyticsResponse } from '@pathways/shared'
import { describe, expect, it } from 'vitest'

import { smallCounts } from './small-counts'

const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
const bucket = (label: string, value: string) => ({ key: label, label, metric: cell(value) })
const saddd = (total: string, female: string) =>
  ({
    view: 'saddd',
    total: cell(total),
    sex: [bucket('Female', female)],
    age: [],
    disability: [
      { key: 'none', label: 'None', metric: { state: 'ZERO', value: '0', reason: null } },
    ],
  }) as PublicAnalyticsResponse

describe('smallCounts', () => {
  it('marks a count of 3 and not 5 or zero', () => {
    expect(smallCounts(saddd('5', '3'))).toEqual([{ label: 'Female', value: 3 }])
    expect(smallCounts(saddd('5', '5'))).toEqual([])
  })

  it('reads participation cells and skips suppressed ones', () => {
    const response = {
      view: 'participation',
      projectId: '10000000-0000-4000-8000-000000000001',
      total: 4,
      totalSuppressed: false,
      byActivity: [
        {
          activityId: '20000000-0000-4000-8000-000000000002',
          activityName: 'Training',
          count: 2,
          suppressed: false,
        },
        {
          activityId: '30000000-0000-4000-8000-000000000003',
          activityName: 'Visit',
          count: null,
          suppressed: true,
        },
      ],
      byMonth: [{ month: '2026-03', count: 9, suppressed: false }],
      byAttendanceStatus: [],
    } as unknown as PublicAnalyticsResponse
    expect(smallCounts(response)).toEqual([
      { label: 'Total participants', value: 4 },
      { label: 'Training', value: 2 },
    ])
  })

  it('marks nothing on views without people counts', () => {
    expect(smallCounts({ view: 'kpi', indicators: [] } as PublicAnalyticsResponse)).toEqual([])
  })
})
