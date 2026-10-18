import type { RuleCondition, RuleMetricKey, RuleNode } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  alertSeverityRank,
  appliesTo,
  availableMetrics,
  categoriesForScopes,
  clearRecordBindings,
  conditionSummary,
  filterRules,
  flattenRecommendations,
  formatMetricValue,
  isMetricAvailable,
  leafCount,
  metricGuidance,
  newCondition,
  nodeKey,
  previewSentence,
  recommendationPrefill,
  recordBound,
  severities,
  severityTone,
  suggestRuleCode,
  suggestSeverity,
} from './rules.utils'

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
const rule = (name: string, status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') => ({
  id: name,
  name,
  status,
  severity: 'HIGH' as const,
  conditions: tree,
  recommendations: [{ id: `${name}-r`, title: 'Review plan', text: 'Check the plan.' }],
})

describe('rule board model', () => {
  it('summarizes flat and nested conditions', () => {
    expect(conditionSummary(leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'))).toBe(
      'Progress toward indicator target < 70%',
    )
    expect(conditionSummary(tree)).toBe(
      'Progress toward indicator target < 70% AND (Days until project end <= 30 days OR Activities completed between 10 and 40%)',
    )
  })
  it('derives distinct scopes', () => {
    expect(appliesTo({ conditions: tree })).toEqual(['Indicator', 'Project', 'Activity'])
  })
  it('lights up catalog metrics only when the rule contract accepts them', () => {
    expect(isMetricAvailable('INDICATOR_PROGRESS_PERCENT')).toBe(true)
    expect(isMetricAvailable('NOT_A_METRIC')).toBe(false)
    expect(availableMetrics(['Indicator'])).toContain('INDICATOR_PROGRESS_PERCENT')
    expect(availableMetrics(['Indicator'])).not.toContain('PROJECT_REMAINING_DAYS')
  })
  it('derives ordered, distinct category tags from selected scope families', () => {
    expect(categoriesForScopes(['Project'])).toEqual(['Schedule'])
    expect(categoriesForScopes(['Project', 'Budget', 'Activity'])).toEqual([
      'Schedule',
      'Delivery',
      'Financial',
    ])
  })
  it('builds the preview sentence with human-review wording', () => {
    const sentence = previewSentence({
      name: 'Low progress',
      severity: 'HIGH',
      conditions: leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
    })
    expect(sentence).toBe(
      'Raise a High alert when Progress toward indicator target is below 70%. Human review required.',
    )
  })
  it('flattens recommendations without severity', () => {
    const rows = flattenRecommendations([rule('R1', 'ACTIVE')])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ recommendationTitle: 'Review plan', ruleName: 'R1' })
    expect(rows[0]).not.toHaveProperty('severity')
  })
  it('filters by search and status', () => {
    const rules = [rule('Alpha', 'ACTIVE'), rule('Beta', 'DRAFT')]
    expect(filterRules(rules, { search: 'alp', status: 'ALL' })).toHaveLength(1)
    expect(filterRules(rules, { search: '', status: 'DRAFT' })[0]?.name).toBe('Beta')
  })
  it('suggests codes matching the contract pattern', () => {
    for (const name of ['Low progress alert', '9 lives', 'a', '  !!  ', 'x'.repeat(200)]) {
      const code = suggestRuleCode(name)
      if (code) expect(code).toMatch(/^[A-Z][A-Z0-9_-]{1,79}$/)
    }
    expect(suggestRuleCode('Low progress alert')).toBe('LOW_PROGRESS_ALERT')
    expect(suggestRuleCode('!!')).toBe('')
  })
  it('maps severity tones', () => {
    expect(severityTone('CRITICAL')).toBe('danger')
    expect(severityTone('MEDIUM')).toBe('warning')
    expect(severityTone('LOW')).toBe('neutral')
  })
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
  it('keeps approved guidance display-only against the existing Assessment key', () => {
    expect(metricGuidance('SURVEY_MEAN_IMPROVEMENT_POINTS')).toMatchObject({
      label: 'Average assessment score change',
      monitors: 'Project aggregate',
      definition: expect.stringContaining('0–100'),
      example: {
        label: 'Worked example',
        value: 'A score increasing from 60% to 75% changes by 15 percentage points.',
      },
    })
    expect(metricGuidance('BUDGET_UTILIZATION_PERCENT')?.definition).toContain(
      'Counted spending is approved expenses.',
    )
  })
})

describe('formatMetricValue', () => {
  it('drops COUNT, rounds PERCENT to two decimals and spells out percentage points', () => {
    expect(formatMetricValue('2', 'COUNT')).toBe('2')
    expect(formatMetricValue('108.1081', 'PERCENT')).toBe('108.11%')
    expect(formatMetricValue('92', 'PERCENT')).toBe('92%')
    expect(formatMetricValue('55', '%')).toBe('55%')
    expect(formatMetricValue('11.625', 'POINTS')).toBe('11.625 percentage points')
    expect(formatMetricValue('30', 'DAYS')).toBe('30 DAYS')
  })
})

describe('alertSeverityRank', () => {
  it('ranks the four severities most severe first and anything else last', () => {
    expect(
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', '', 'UNKNOWN', 'constructor'].map(alertSeverityRank),
    ).toEqual([0, 1, 2, 3, 4, 4, 4])
  })
})

describe('condition tree helpers', () => {
  it('counts every leaf of nested groups and one for a single condition', () => {
    expect(leafCount(leaf('a', 'PROJECT_REMAINING_DAYS', 'LT', '1'))).toBe(1)
    expect(leafCount(tree)).toBe(3)
    expect(leafCount({ kind: 'GROUP', mode: 'OR', children: [tree, tree] })).toBe(6)
  })
  it('clears indicator and activity bindings from a leaf and from every leaf of a group', () => {
    const unbound = (id: string) => {
      const { indicatorId: _indicator, ...rest } = leaf(
        id,
        'INDICATOR_PROGRESS_PERCENT',
        'LT',
        '5',
      ) as RuleCondition
      return rest
    }
    const bound = (id: string) => ({ ...unbound(id), indicatorId: 'ind-1', activityId: 'act-1' })
    expect(clearRecordBindings(bound('a'))).toEqual(unbound('a'))
    const cleared = clearRecordBindings({
      kind: 'GROUP',
      mode: 'AND',
      children: [bound('a'), { kind: 'GROUP', mode: 'OR', children: [bound('b')] }],
    })
    expect(cleared).toEqual({
      kind: 'GROUP',
      mode: 'AND',
      children: [unbound('a'), { kind: 'GROUP', mode: 'OR', children: [unbound('b')] }],
    })
  })
  it('creates a distinct default condition on remaining days each time', () => {
    const first = newCondition()
    expect(first).toMatchObject({
      kind: 'CONDITION',
      metric: 'PROJECT_REMAINING_DAYS',
      operator: 'LT',
      threshold: '0',
    })
    expect(first).toHaveProperty('id', expect.stringMatching(/^c_[0-9a-f]{32}$/))
    expect(newCondition()).not.toHaveProperty('id', (first as { id: string }).id)
  })
  it('flags only indicator metrics and activity overdue days as record bound', () => {
    expect(recordBound('INDICATOR_PROGRESS_PERCENT')).toBe(true)
    expect(recordBound('INDICATOR_CURRENT_VALUE')).toBe(true)
    expect(recordBound('ACTIVITY_OVERDUE_DAYS')).toBe(true)
    expect(recordBound('ACTIVITY_OVERDUE_COUNT')).toBe(false)
    expect(recordBound('ACTIVITY_COMPLETION_PERCENT')).toBe(false)
    expect(recordBound('PROJECT_REMAINING_DAYS')).toBe(false)
  })
  it('keeps the selectable severities from least to most severe', () => {
    expect(severities).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  })
  it('keys a condition by its id and a group by its first child, stable and distinct', () => {
    const a = leaf('a', 'PROJECT_REMAINING_DAYS', 'LT', '1')
    const b = leaf('b', 'PROJECT_REMAINING_DAYS', 'LT', '1')
    expect(nodeKey(a)).toBe('a')
    expect(nodeKey({ kind: 'GROUP', mode: 'AND', children: [a, b] })).toBe('group_a')
    expect(nodeKey({ kind: 'GROUP', mode: 'AND', children: [b, a] })).toBe('group_b')
    expect(nodeKey({ kind: 'GROUP', mode: 'OR', children: [] })).toBe('group_empty')
    expect(nodeKey(tree)).toBe(nodeKey(tree))
    expect(nodeKey(tree)).not.toBe(nodeKey(a))
  })
})
