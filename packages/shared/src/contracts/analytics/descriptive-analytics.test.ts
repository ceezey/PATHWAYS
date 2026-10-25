import { describe, expect, it } from 'vitest'
import {
  DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
  descriptiveAnalyticsQuerySchema,
  descriptiveAnalyticsSchema,
} from './descriptive-analytics'

const projectId = '77000000-0000-4000-8000-000000000001'
const messages = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message) ?? []

describe('descriptiveAnalyticsQuerySchema', () => {
  it('accepts a project alone, or with a full period and a view', () => {
    expect(descriptiveAnalyticsQuerySchema.safeParse({ projectId }).success).toBe(true)
    expect(
      descriptiveAnalyticsQuerySchema.safeParse({
        projectId,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        view: 'kpi',
      }).success,
    ).toBe(true)
  })

  it('rejects an unknown key', () => {
    const result = descriptiveAnalyticsQuerySchema.safeParse({ projectId, extra: 1 })
    expect(messages(result)).toEqual(['Unrecognized key: "extra"'])
  })

  it('requires both period dates or neither', () => {
    for (const half of [{ periodStart: '2026-01-01' }, { periodEnd: '2026-01-31' }]) {
      const result = descriptiveAnalyticsQuerySchema.safeParse({ projectId, ...half })
      expect(messages(result)).toEqual(['Both period dates are required.'])
    }
  })

  it('rejects an impossible calendar date with the date message', () => {
    const result = descriptiveAnalyticsQuerySchema.safeParse({
      projectId,
      periodStart: '2026-02-30',
      periodEnd: '2026-03-01',
    })
    expect(messages(result)).toEqual(['Use a real YYYY-MM-DD date from 1900 through 2100.'])
  })
})

describe('descriptiveAnalyticsSchema', () => {
  const summary = {
    unitLabel: null,
    numericKind: null,
    indicatorCount: 100,
    reportedCount: 100,
    mean: null,
    minimum: null,
    maximum: null,
  }
  const metric = { state: 'ZERO', value: '0', reason: null }
  const countRow = { key: 'ACTIVITIES', label: 'Activities', metric }
  const distributionRow = { section: 'SADDD_SEX', key: 'F', label: 'Female', metric, share: null }
  const valid = {
    contractVersion: DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
    projectId,
    generatedAt: '2026-06-01T00:00:00Z',
    monitoringPeriod: {
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      businessTimeZone: 'Asia/Manila',
    },
    sadddPeriod: { periodStart: null, periodEnd: null },
    sadddReleaseState: 'UNAVAILABLE',
    privacy: {
      threshold: 0,
      complementarySuppression: false,
      source: 'P06_SADDD_RELEASE',
      beneficiaryRows: false,
    },
    counts: [countRow],
    distributions: [distributionRow],
    indicatorSummaries: [summary],
  }
  const tooBig = ['Too big: expected number to be <=100']

  it('accepts the maximum of 100 per indicator count and summary list', () => {
    expect(descriptiveAnalyticsSchema.safeParse(valid).success).toBe(true)
    const full = { ...valid, indicatorSummaries: Array(100).fill(summary) }
    expect(descriptiveAnalyticsSchema.safeParse(full).success).toBe(true)
  })

  it('rejects more than 100 indicator summaries', () => {
    const result = descriptiveAnalyticsSchema.safeParse({
      ...valid,
      indicatorSummaries: Array(101).fill(summary),
    })
    expect(messages(result)).toEqual(['Too big: expected array to have <=100 items'])
  })

  it('rejects an indicator count or reported count above 100', () => {
    for (const field of ['indicatorCount', 'reportedCount']) {
      const result = descriptiveAnalyticsSchema.safeParse({
        ...valid,
        indicatorSummaries: [{ ...summary, [field]: 101 }],
      })
      expect(messages(result)).toEqual(tooBig)
    }
  })

  it('rejects an unknown key at every object level', () => {
    const unknown = 'Unrecognized key: "extra"'
    const cases = [
      { ...valid, extra: 1 },
      { ...valid, monitoringPeriod: { ...valid.monitoringPeriod, extra: 1 } },
      { ...valid, sadddPeriod: { ...valid.sadddPeriod, extra: 1 } },
      { ...valid, privacy: { ...valid.privacy, extra: 1 } },
      { ...valid, indicatorSummaries: [{ ...summary, extra: 1 }] },
      { ...valid, counts: [{ ...countRow, extra: 1 }] },
      { ...valid, distributions: [{ ...distributionRow, extra: 1 }] },
    ]
    for (const input of cases) {
      expect(messages(descriptiveAnalyticsSchema.safeParse(input))).toEqual([unknown])
    }
  })
})
