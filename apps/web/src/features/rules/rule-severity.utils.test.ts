import type { RuleMetricKey, RuleNode } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { recommendationPrefill, suggestSeverity } from './rule-severity.utils'

const testRecordId = '11111111-1111-4111-8111-111111111111'
const leaf = (id: string, metric: string, operator: string, threshold: string, max?: string) =>
  ({
    kind: 'CONDITION',
    id,
    metric,
    operator,
    threshold,
    ...(max === undefined ? {} : { thresholdMaximum: max }),
    ...(metric.startsWith('INDICATOR_') ? { indicatorId: testRecordId } : {}),
    ...(metric === 'ACTIVITY_OVERDUE_DAYS' ? { activityId: testRecordId } : {}),
  }) as RuleNode
const tree: RuleNode = {
  kind: 'GROUP',
  mode: 'AND',
  children: [
    leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
    {
      kind: 'GROUP',
      mode: 'OR',
      children: [
        leaf('b', 'PROJECT_REMAINING_DAYS', 'LTE', '30'),
        leaf('c', 'ACTIVITY_COMPLETION_PERCENT', 'BETWEEN', '10', '40'),
      ],
    },
  ],
}

describe('rule severity suggestions', () => {
  it('uses the conservative metric-aware policy across every metric and operator', () => {
    const cases: Array<{
      metric: RuleMetricKey
      operator: 'LT' | 'LTE' | 'EQ' | 'GTE' | 'GT' | 'BETWEEN'
      threshold: string
      maximum?: string
      severity?: 'LOW' | 'MEDIUM' | 'HIGH'
    }> = [
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'PROJECT_OVERDUE_DAYS' as const,
        operator,
        threshold: ['0', '0', '0', '1', '0', '1'][index] as string,
        maximum: operator === 'BETWEEN' ? '2' : undefined,
        severity: (['', 'LOW', 'LOW', 'HIGH', 'HIGH', 'HIGH'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'PROJECT_REMAINING_DAYS' as const,
        operator,
        threshold: ['0', '-1', '-1', '0', '0', '0'][index] as string,
        maximum: operator === 'BETWEEN' ? '30' : undefined,
        severity: (['HIGH', 'HIGH', 'HIGH', '', '', 'MEDIUM'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT' as const,
        operator,
        threshold: ['1', '0', '0', '0', '0', '0'][index] as string,
        maximum: operator === 'BETWEEN' ? '1' : undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'INDICATOR_CURRENT_VALUE' as const,
        operator,
        threshold: ['1', '0', '0', '0', '0', '0'][index] as string,
        maximum: operator === 'BETWEEN' ? '1' : undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'INDICATOR_PROGRESS_PERCENT' as const,
        operator,
        threshold: ['100', '99', '100', '100', '100', '0'][index] as string,
        maximum: operator === 'BETWEEN' ? '99' : undefined,
        severity: (['MEDIUM', 'MEDIUM', 'LOW', 'LOW', 'LOW', 'MEDIUM'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'ACTIVITY_COMPLETION_PERCENT' as const,
        operator,
        threshold: ['100', '99', '100', '100', '100', '0'][index] as string,
        maximum: operator === 'BETWEEN' ? '99' : undefined,
        severity: (['MEDIUM', 'MEDIUM', 'LOW', 'LOW', '', 'MEDIUM'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).flatMap((operator, index) =>
        (['ACTIVITY_OVERDUE_COUNT', 'ACTIVITY_OVERDUE_DAYS'] as const).map((metric) => ({
          metric,
          operator,
          threshold: ['0', '0', '0', '1', '0', '1'][index] as string,
          maximum: operator === 'BETWEEN' ? '2' : undefined,
          severity: (['', 'LOW', 'LOW', 'HIGH', 'HIGH', 'HIGH'][index] || undefined) as
            | 'LOW'
            | 'MEDIUM'
            | 'HIGH'
            | undefined,
        })),
      ),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'BUDGET_UTILIZATION_PERCENT' as const,
        operator,
        threshold: ['100', '100', '100', '100', '100', '101'][index] as string,
        maximum: operator === 'BETWEEN' ? '200' : undefined,
        severity: (['', '', '', '', 'HIGH', 'HIGH'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'BENEFICIARY_FOLLOW_UP_PERCENT' as const,
        operator,
        threshold: ['0', '0', '0', '1', '0', '1'][index] as string,
        maximum: operator === 'BETWEEN' ? '2' : undefined,
        severity: (['', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'MEDIUM'][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
      ...(['LT', 'LTE', 'EQ', 'GTE', 'GT', 'BETWEEN'] as const).map((operator, index) => ({
        metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS' as const,
        operator,
        threshold: ['0', '-1', '1', '1', '0', '-1'][index] as string,
        maximum: operator === 'BETWEEN' ? '1' : undefined,
        severity: (['MEDIUM', 'MEDIUM', 'LOW', 'LOW', 'LOW', ''][index] || undefined) as
          | 'LOW'
          | 'MEDIUM'
          | 'HIGH'
          | undefined,
      })),
    ]

    for (const [index, entry] of cases.entries()) {
      const result = suggestSeverity(
        leaf(`case-${index}`, entry.metric, entry.operator, entry.threshold, entry.maximum),
      )
      if (entry.severity)
        expect(result, `${entry.metric} ${entry.operator}`).toMatchObject({
          status: 'SUGGESTED',
          severity: entry.severity,
        })
      else expect(result).toMatchObject({ status: 'NEEDS_JUDGMENT', severity: null })
    }
  })
  it('fails closed for invalid or ambiguous conditions and keeps exact decimal boundaries exact', () => {
    for (const condition of [
      leaf('empty', 'BUDGET_UTILIZATION_PERCENT', 'GT', ''),
      leaf('exponent', 'BUDGET_UTILIZATION_PERCENT', 'GT', '1e2'),
      leaf('precision', 'BUDGET_UTILIZATION_PERCENT', 'GT', '100.00001'),
      leaf('range', 'BUDGET_UTILIZATION_PERCENT', 'BETWEEN', '101', '100'),
      leaf('domain', 'ACTIVITY_COMPLETION_PERCENT', 'GT', '100'),
    ])
      expect(suggestSeverity(condition)).toMatchObject({ status: 'NEEDS_JUDGMENT', severity: null })

    expect(
      suggestSeverity(leaf('timeline-empty', 'PROJECT_TIMELINE_ELAPSED_PERCENT', 'LT', '')),
    ).toMatchObject({
      status: 'NEEDS_JUDGMENT',
      reason: expect.stringContaining('does not receive an automatic severity suggestion'),
    })
    expect(
      suggestSeverity(leaf('indicator-empty', 'INDICATOR_CURRENT_VALUE', 'LT', '')),
    ).toMatchObject({
      status: 'NEEDS_JUDGMENT',
      reason: expect.stringContaining('does not receive an automatic severity suggestion'),
    })

    expect(
      suggestSeverity(leaf('large', 'INDICATOR_PROGRESS_PERCENT', 'GTE', '99999999999999.9999')),
    ).toMatchObject({ status: 'SUGGESTED', severity: 'LOW' })
    expect(suggestSeverity(leaf('zero', 'PROJECT_OVERDUE_DAYS', 'GTE', '0'))).toMatchObject({
      status: 'NEEDS_JUDGMENT',
    })
    expect(
      suggestSeverity(leaf('hundred', 'BUDGET_UTILIZATION_PERCENT', 'GTE', '100')),
    ).toMatchObject({
      status: 'NEEDS_JUDGMENT',
    })
  })
  it('uses highest supported group severity but never hides an unavailable leaf', () => {
    expect(
      suggestSeverity({
        kind: 'GROUP',
        mode: 'OR',
        children: [
          leaf('low', 'ACTIVITY_COMPLETION_PERCENT', 'GTE', '100'),
          leaf('high', 'ACTIVITY_OVERDUE_COUNT', 'GT', '0'),
        ],
      }),
    ).toMatchObject({ status: 'SUGGESTED', severity: 'HIGH' })
    expect(
      suggestSeverity({
        kind: 'GROUP',
        mode: 'AND',
        children: [
          leaf('medium', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
          leaf('low', 'ACTIVITY_COMPLETION_PERCENT', 'GTE', '100'),
        ],
      }),
    ).toMatchObject({ status: 'SUGGESTED', severity: 'MEDIUM' })
    expect(
      suggestSeverity({
        kind: 'GROUP',
        mode: 'OR',
        children: [
          leaf('high', 'ACTIVITY_OVERDUE_COUNT', 'GT', '0'),
          leaf('uncertain', 'BUDGET_UTILIZATION_PERCENT', 'GTE', '100'),
        ],
      }),
    ).toMatchObject({ status: 'NEEDS_JUDGMENT', severity: null })
    expect(suggestSeverity(tree)).toMatchObject({ status: 'NEEDS_JUDGMENT', severity: null })
  })
  it('offers predefined authoring copy by metric family and combines mixed families', () => {
    expect(recommendationPrefill(leaf('a', 'BUDGET_UTILIZATION_PERCENT', 'GTE', '80'))).toEqual({
      title: 'Review budget utilization',
      text: 'Review approved spending and remaining allocation with authorized budget staff before considering any adjustment.',
    })
    expect(recommendationPrefill(tree)).toMatchObject({ title: 'Review combined signals' })
  })
})
