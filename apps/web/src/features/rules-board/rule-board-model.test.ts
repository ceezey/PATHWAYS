import type { RuleNode } from '@/features/analytics/rules-validation'
import { describe, expect, it } from 'vitest'
import {
  appliesTo,
  availableMetrics,
  conditionSummary,
  filterRules,
  flattenRecommendations,
  isMetricAvailable,
  previewSentence,
  severityTone,
  suggestRuleCode,
} from './rule-board-model'

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
