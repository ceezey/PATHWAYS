import { MAX_CONDITIONS, type RuleCondition, type RuleNode, parseRuleTree } from '@pathways/shared'
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
  manilaTime,
  metricGuidance,
  moveRow,
  newCondition,
  nodeKey,
  previewSentence,
  recordBound,
  rowsToTree,
  ruleSeverityText,
  ruleSeverityTone,
  severityTone,
  suggestRuleCode,
  treeToRows,
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
    expect(categoriesForScopes(['Project'])).toEqual(['Schedule', 'Performance'])
    expect(categoriesForScopes(['Project', 'Budget', 'Activity'])).toEqual([
      'Schedule',
      'Performance',
      'Delivery',
      'Financial',
    ])
  })
  it('builds the preview sentence with human-review wording', () => {
    const sentence = previewSentence({
      name: 'Low progress',
      critical: false,
      conditions: leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
    })
    expect(sentence).toBe(
      'Raise an alert when Progress toward indicator target is below 70%. Human review required.',
    )
    expect(
      previewSentence({
        name: 'Low progress',
        critical: true,
        conditions: leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '70'),
      }),
    ).toBe(
      'Raise a Critical alert when Progress toward indicator target is below 70%. Human review required.',
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
    expect(formatMetricValue('11.625', 'POINTS')).toBe('11.63 percentage points')
    expect(formatMetricValue('1.6667', 'POINTS')).toBe('1.67 percentage points')
    expect(formatMetricValue('-8.3333', 'POINTS')).toBe('-8.33 percentage points')
    expect(formatMetricValue('2.5', 'DAYS')).toBe('2.5 DAYS')
    expect(formatMetricValue('30', 'DAYS')).toBe('30 DAYS')
  })
})

describe('manilaTime', () => {
  it('shows only the Manila date and time to the minute', () => {
    expect(manilaTime('2026-10-20T19:11:58.000Z')).toBe('10/21/2026 3:11 AM')
  })
})

describe('alertSeverityRank', () => {
  it('ranks the four severities most severe first and anything else last', () => {
    expect(
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', '', 'UNKNOWN', 'constructor'].map(alertSeverityRank),
    ).toEqual([0, 1, 2, 3, 4, 4, 4])
  })
  it('sorts a Needs context alert after Low', () => {
    expect(alertSeverityRank(null)).toBeGreaterThan(alertSeverityRank('LOW'))
  })
})

describe('rule severity label', () => {
  it('names only the manual Critical mark and treats null and legacy levels as suggested', () => {
    expect([null, 'HIGH', 'CRITICAL'].map(ruleSeverityText)).toEqual([
      'Suggested when it fires',
      'Suggested when it fires',
      'Critical (manual)',
    ])
    expect([null, 'HIGH', 'CRITICAL'].map(ruleSeverityTone)).toEqual([
      'neutral',
      'neutral',
      'danger',
    ])
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

describe('per-row joins', () => {
  const row = (id: string) => leaf(id, 'PROJECT_REMAINING_DAYS', 'LT', '5') as RuleCondition
  const [a, b, c] = [row('a'), row('b'), row('c')]
  const and = (...children: RuleNode[]): RuleNode => ({ kind: 'GROUP', mode: 'AND', children })
  const or = (...children: RuleNode[]): RuleNode => ({ kind: 'GROUP', mode: 'OR', children })
  it('checks AND before OR when building the tree', () => {
    expect(rowsToTree([a], {})).toEqual(and(a))
    expect(rowsToTree([a, b, c], {})).toEqual(and(a, b, c))
    expect(rowsToTree([a, b, c], { b: 'OR', c: 'OR' })).toEqual(or(a, b, c))
    expect(rowsToTree([a, b, c], { c: 'OR' })).toEqual(or(and(a, b), c))
    expect(rowsToTree([a, b, c], { b: 'OR' })).toEqual(or(a, and(b, c)))
    expect(rowsToTree([a, b], { a: 'OR' })).toEqual(and(a, b))
  })
  it('summarizes a mixed tree with brackets', () => {
    expect(conditionSummary(rowsToTree([a, b, c], { c: 'OR' }))).toBe(
      '(Days until project end < 5 days AND Days until project end < 5 days) OR Days until project end < 5 days',
    )
  })
  it('keeps the full condition cap valid', () => {
    const rows = Array.from({ length: MAX_CONDITIONS }, (_, i) => row(`r${i}`))
    const joins = Object.fromEntries(
      rows.map((item, i) => [item.id, i % 3 ? 'AND' : 'OR'] as const),
    )
    expect(() => parseRuleTree(rowsToTree(rows, joins))).not.toThrow()
  })
  it('reads guided shapes back and round-trips them', () => {
    for (const node of [and(a, b, c), or(a, b), or(and(a, b), c), or(a, and(b, c))]) {
      const read = treeToRows(node)
      expect(read).not.toBeNull()
      expect(rowsToTree(read?.rows ?? [], read?.joins ?? {})).toEqual(node)
    }
    expect(treeToRows(a)).toEqual({ rows: [a], joins: {} })
  })
  it('leaves other shapes to the advanced editor', () => {
    expect(treeToRows(and(or(a, b), c))).toBeNull()
    expect(treeToRows(or(or(a, b), c))).toBeNull()
    expect(treeToRows(or(and(a), c))).toBeNull()
    expect(treeToRows(or(and(a, or(b, c))))).toBeNull()
  })
})

describe('KPI and test score metrics', () => {
  it('lists them under Project and Assessment as percentages', () => {
    expect(availableMetrics(['Project'])).toContain('KPI_ACHIEVEMENT_PERCENT')
    expect(availableMetrics(['Assessment'])).toEqual([
      'SURVEY_MEAN_IMPROVEMENT_POINTS',
      'SURVEY_MEAN_PRE_TEST_PERCENT',
      'SURVEY_MEAN_POST_TEST_PERCENT',
    ])
    for (const key of [
      'KPI_ACHIEVEMENT_PERCENT',
      'SURVEY_MEAN_PRE_TEST_PERCENT',
      'SURVEY_MEAN_POST_TEST_PERCENT',
    ])
      expect(metricGuidance(key)?.unit).toBe('%')
    expect(recordBound('KPI_ACHIEVEMENT_PERCENT')).toBe(false)
  })
})

describe('moveRow', () => {
  it('moves a row to the target position and ignores unknown ids', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveRow(rows, 'c', 'a').map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(moveRow(rows, 'a', 'c').map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(moveRow(rows, 'x', 'a')).toBe(rows)
  })
})
