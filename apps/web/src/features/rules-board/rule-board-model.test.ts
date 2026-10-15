import type { RuleNode } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import {
  appliesTo,
  availableMetrics,
  conditionSummary,
  filterRules,
  flattenRecommendations,
  formatMetricValue,
  isMetricAvailable,
  metricGuidance,
  previewSentence,
  recommendationPrefill,
  severityTone,
  suggestSeverity,
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
  it('suggests severity only from conditions that necessarily match their stated bound', () => {
    expect(suggestSeverity(leaf('a', 'PROJECT_OVERDUE_DAYS', 'GTE', '1'))).toMatchObject({
      severity: 'HIGH',
    })
    expect(suggestSeverity(leaf('b', 'ACTIVITY_COMPLETION_PERCENT', 'GTE', '100'))).toMatchObject({
      severity: 'LOW',
    })
    expect(suggestSeverity(leaf('c', 'PROJECT_REMAINING_DAYS', 'LT', '30'))).toMatchObject({
      severity: 'MEDIUM',
    })
    expect(suggestSeverity(tree)).toMatchObject({ severity: 'MEDIUM' })
    expect(
      suggestSeverity({
        kind: 'GROUP',
        mode: 'AND',
        children: [
          leaf('a', 'ACTIVITY_COMPLETION_PERCENT', 'GTE', '100'),
          leaf('b', 'ACTIVITY_OVERDUE_COUNT', 'GT', '0'),
        ],
      }),
    ).toMatchObject({ severity: 'HIGH' })
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
