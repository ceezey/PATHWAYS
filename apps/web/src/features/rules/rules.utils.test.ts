import type { RuleNode } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  alertSeverityRank,
  appliesTo,
  availableMetrics,
  clearRecordBindings,
  conditionSummary,
  filterRules,
  flattenRecommendations,
  formatMetricValue,
  isMetricAvailable,
  leafCount,
  newCondition,
  nodeKey,
  previewSentence,
  recordBound,
  severities,
  severityTone,
  suggestRuleCode,
} from './rules.utils'

const leaf = (id: string, metric: string, operator: string, threshold: string, max?: string) =>
  ({
    kind: 'CONDITION',
    id,
    metric,
    operator,
    threshold,
    ...(max ? { thresholdMaximum: max } : {}),
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
      'Indicator progress < 70%',
    )
    expect(conditionSummary(tree)).toBe(
      'Indicator progress < 70% AND (Project remaining days <= 30 days OR Activity completion between 10 and 40%)',
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
  it('builds the preview sentence with human-review wording', () => {
    const sentence = previewSentence({
      name: 'Low progress',
      severity: 'HIGH',
      conditions: leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
    })
    expect(sentence).toBe(
      "IF Indicator progress is below 70% THEN raise a high alert 'Low progress' for assigned project users. Human review required.",
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
})

describe('formatMetricValue', () => {
  it('drops COUNT, rounds PERCENT to two decimals and shortens POINTS', () => {
    expect(formatMetricValue('2', 'COUNT')).toBe('2')
    expect(formatMetricValue('108.1081', 'PERCENT')).toBe('108.11%')
    expect(formatMetricValue('92', 'PERCENT')).toBe('92%')
    expect(formatMetricValue('55', '%')).toBe('55%')
    expect(formatMetricValue('11.625', 'POINTS')).toBe('11.625 pts')
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
    const bound = (id: string) => ({
      ...leaf(id, 'INDICATOR_PROGRESS_PERCENT', 'LT', '5'),
      indicatorId: 'ind-1',
      activityId: 'act-1',
    })
    expect(clearRecordBindings(bound('a'))).toEqual(
      leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '5'),
    )
    const cleared = clearRecordBindings({
      kind: 'GROUP',
      mode: 'AND',
      children: [bound('a'), { kind: 'GROUP', mode: 'OR', children: [bound('b')] }],
    })
    expect(cleared).toEqual({
      kind: 'GROUP',
      mode: 'AND',
      children: [
        leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '5'),
        {
          kind: 'GROUP',
          mode: 'OR',
          children: [leaf('b', 'INDICATOR_PROGRESS_PERCENT', 'LT', '5')],
        },
      ],
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
