import { describe, expect, it } from 'vitest'
import {
  type RuleCondition,
  metricObservationSchema,
  parseRuleTree,
  ruleDefinitionSchema,
} from './rule-contract'
import { evaluateRule } from './rule-engine'

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const asOf = '2026-09-26T00:00:00.000Z'
const leaf = (patch: Partial<RuleCondition> = {}): RuleCondition => ({
  kind: 'CONDITION',
  id: 'A',
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '10',
  ...patch,
})
const definition = (conditions: unknown = leaf()) => ({
  organizationId: org,
  projectId: project,
  ruleId: '30000000-0000-4000-8000-000000000003',
  version: 1,
  name: 'Synthetic timeline rule',
  severity: 'MEDIUM',
  conditions,
  recommendations: [
    {
      id: '40000000-0000-4000-8000-000000000004',
      title: 'Review',
      text: 'Review the project schedule.',
    },
  ],
})
const observation = (
  id = 'A',
  value: string | null = '9',
  state = value === '0' ? 'ZERO' : value === null ? 'MISSING' : 'AVAILABLE',
) => ({
  conditionId: id,
  organizationId: org,
  projectId: project,
  metric: 'PROJECT_REMAINING_DAYS',
  asOf,
  cell: { state, value, reason: value === null ? 'NO_MEASUREMENT' : null },
  calculation: {
    kind: 'PROJECT_TIMELINE',
    projectStatus: 'PLANNED',
    projectArchived: false,
    reportingDate: '2026-09-26',
    startDate: '2026-09-20',
    endDate: '2026-09-30',
  },
  source: { kind: 'PROJECT', recordId: project, revision: '1' },
})

describe('bounded typed rule configuration', () => {
  it('accepts four group levels and rejects five before recursive validation', () => {
    let tree: unknown = leaf()
    for (let index = 0; index < 4; index++) tree = { kind: 'GROUP', mode: 'AND', children: [tree] }
    expect(parseRuleTree(tree)).toEqual(tree)
    expect(() => parseRuleTree({ kind: 'GROUP', mode: 'AND', children: [tree] })).toThrow()
  })
  it('accepts 32 leaves and rejects 33, duplicated ids and empty groups', () => {
    const children = Array.from({ length: 32 }, (_, index) => leaf({ id: `C${index}` }))
    expect(parseRuleTree({ kind: 'GROUP', mode: 'OR', children })).toBeTruthy()
    expect(() =>
      parseRuleTree({ kind: 'GROUP', mode: 'OR', children: [...children, leaf({ id: 'Extra' })] }),
    ).toThrow()
    expect(() =>
      parseRuleTree({ kind: 'GROUP', mode: 'AND', children: [leaf(), leaf()] }),
    ).toThrow()
    expect(() => parseRuleTree({ kind: 'GROUP', mode: 'AND', children: [] })).toThrow()
  })
  it('bounds malicious depth and cyclic objects', () => {
    let tree: unknown = leaf()
    for (let index = 0; index < 20000; index++)
      tree = { kind: 'GROUP', mode: 'AND', children: [tree] }
    expect(() => parseRuleTree(tree)).toThrow('group bounds')
    const cycle: { kind: string; mode: string; children: unknown[] } = {
      kind: 'GROUP',
      mode: 'AND',
      children: [],
    }
    cycle.children.push(cycle)
    expect(() => parseRuleTree(cycle)).toThrow()
  })
  it.each([
    { threshold: '1e2' },
    { threshold: 'NaN' },
    { threshold: '0.00001' },
    { operator: 'eval' },
    { metric: 'FOO' },
    { sql: 'SELECT * FROM beneficiaries' },
    { thresholdMaximum: '20' },
    { operator: 'BETWEEN' },
    { operator: 'BETWEEN', thresholdMaximum: '5' },
    { metric: 'INDICATOR_CURRENT_VALUE' },
    { activityId: project },
    { metric: 'ACTIVITY_COMPLETION_PERCENT', threshold: '101' },
    { metric: 'ACTIVITY_OVERDUE_COUNT', threshold: '-1' },
    { metric: 'PROJECT_OVERDUE_DAYS', threshold: '0.5' },
  ])('rejects malformed conditions %j', (patch) => {
    expect(() => parseRuleTree({ ...leaf(), ...patch })).toThrow()
  })
  it('preserves signed/uncapped progress thresholds and required record bindings', () => {
    for (const threshold of ['-10', '150'])
      expect(
        parseRuleTree(
          leaf({
            metric: 'INDICATOR_PROGRESS_PERCENT',
            indicatorId: project,
            threshold,
          }),
        ),
      ).toBeTruthy()
    expect(
      parseRuleTree(leaf({ metric: 'ACTIVITY_OVERDUE_DAYS', activityId: project })),
    ).toBeTruthy()
    expect(() =>
      parseRuleTree(leaf({ metric: 'PROJECT_REMAINING_DAYS', indicatorId: project })),
    ).toThrow()
  })
  it('requires recommendations and rejects duplicate identities and unknown fields', () => {
    const rule = definition()
    expect(ruleDefinitionSchema.safeParse({ ...rule, recommendations: [] }).success).toBe(false)
    expect(
      ruleDefinitionSchema.safeParse({
        ...rule,
        recommendations: [...rule.recommendations, ...rule.recommendations],
      }).success,
    ).toBe(false)
    expect(ruleDefinitionSchema.safeParse({ ...rule, actorId: project }).success).toBe(false)
  })
})

describe('deterministic evidence evaluation', () => {
  it.each([
    ['LT', '9', 'TRUE'],
    ['LT', '10', 'FALSE'],
    ['LTE', '10', 'TRUE'],
    ['LTE', '11', 'FALSE'],
    ['EQ', '10.0000', 'TRUE'],
    ['EQ', '11', 'FALSE'],
    ['GTE', '10', 'TRUE'],
    ['GTE', '9', 'FALSE'],
    ['GT', '11', 'TRUE'],
    ['GT', '10', 'FALSE'],
    ['BETWEEN', '10', 'TRUE'],
    ['BETWEEN', '20', 'TRUE'],
    ['BETWEEN', '21', 'FALSE'],
  ] as const)('%s evaluates %s to %s', (operator, value, result) => {
    const condition = leaf({
      operator,
      ...(operator === 'BETWEEN' ? { thresholdMaximum: '20' } : {}),
    })
    expect(
      evaluateRule({ rule: definition(condition), asOf, observations: [observation('A', value)] })
        .result,
    ).toBe(result)
  })
  it('does exact decimal comparison near the decimal(18,4) maximum', () => {
    const condition = leaf({
      metric: 'INDICATOR_CURRENT_VALUE',
      indicatorId: project,
      operator: 'GT',
      threshold: '99999999999999.9998',
    })
    const input = {
      ...observation('A', '99999999999999.9999'),
      metric: condition.metric,
      indicatorId: project,
      source: { kind: 'MANUAL_INDICATOR', recordId: project, revision: '1' },
      calculation: {
        kind: 'INDICATOR',
        mode: 'MANUAL',
        recipe: null,
        numericKind: 'SIGNED_CHANGE',
        unitLabel: 'units',
        direction: 'HIGHER_IS_BETTER',
        baseline: '0',
        target: '100',
        current: '99999999999999.9999',
      },
    }
    expect(evaluateRule({ rule: definition(condition), asOf, observations: [input] }).result).toBe(
      'TRUE',
    )
  })
  for (const mode of ['AND', 'OR'] as const) {
    for (const left of ['TRUE', 'FALSE', 'UNAVAILABLE'] as const) {
      for (const right of ['TRUE', 'FALSE', 'UNAVAILABLE'] as const) {
        it(`${mode}(${left},${right}) uses three-valued truth with complete evidence`, () => {
          const node = { kind: 'GROUP', mode, children: [leaf(), leaf({ id: 'B' })] }
          const value = (result: string) =>
            result === 'TRUE' ? '9' : result === 'FALSE' ? '11' : null
          const evaluation = evaluateRule({
            rule: definition(node),
            asOf,
            observations: [observation('A', value(left)), observation('B', value(right))],
          })
          const decisive = mode === 'AND' ? 'FALSE' : 'TRUE'
          const expected = [left, right].includes(decisive)
            ? decisive
            : [left, right].includes('UNAVAILABLE')
              ? 'UNAVAILABLE'
              : mode === 'AND'
                ? 'TRUE'
                : 'FALSE'
          expect(evaluation.result).toBe(expected)
          expect(evaluation.evidence).toHaveProperty('children.length', 2)
        })
      }
    }
  }
  it('evaluates (A AND B) OR C and missing observations', () => {
    const rule = definition({
      kind: 'GROUP',
      mode: 'OR',
      children: [
        { kind: 'GROUP', mode: 'AND', children: [leaf(), leaf({ id: 'B' })] },
        leaf({ id: 'C' }),
      ],
    })
    expect(
      evaluateRule({ rule, asOf, observations: [observation('A'), observation('C')] }).result,
    ).toBe('TRUE')
    expect(evaluateRule({ rule: definition(), asOf, observations: [] }).result).toBe('UNAVAILABLE')
  })
  it('preserves exact zero and suppresses evidence without source/value payloads', () => {
    expect(
      evaluateRule({ rule: definition(), asOf, observations: [observation('A', '0')] }).result,
    ).toBe('TRUE')
    const suppressed = {
      ...observation('A', null, 'SUPPRESSED'),
      source: null,
      calculation: null,
      cell: { state: 'SUPPRESSED', value: null, reason: 'SUPPRESSED' },
    }
    const evaluation = evaluateRule({ rule: definition(), asOf, observations: [suppressed] })
    expect(evaluation.result).toBe('UNAVAILABLE')
    expect(evaluation.evidence).toHaveProperty('observation.source', null)
    expect(
      metricObservationSchema.safeParse({ ...suppressed, source: observation().source }).success,
    ).toBe(false)
    expect(
      metricObservationSchema.safeParse({ ...suppressed, cell: { ...suppressed.cell, value: '3' } })
        .success,
    ).toBe(false)
    expect(
      metricObservationSchema.safeParse({ ...suppressed, calculation: observation().calculation })
        .success,
    ).toBe(false)
  })
  it.each([
    { organizationId: project },
    { projectId: org },
    { metric: 'PROJECT_OVERDUE_DAYS' },
    { conditionId: 'NotBound' },
    { asOf: '2026-09-25T00:00:00.000Z' },
    { indicatorId: project },
    { source: { kind: 'PROJECT', recordId: org, revision: '1' } },
    { source: { kind: 'MANUAL_INDICATOR', recordId: project, revision: '1' } },
  ])('rejects mismatched scope/time/source/binding %j', (patch) => {
    expect(() =>
      evaluateRule({ rule: definition(), asOf, observations: [{ ...observation(), ...patch }] }),
    ).toThrow()
  })
  it('rejects duplicate observations and numeric/executable untrusted values', () => {
    expect(() =>
      evaluateRule({ rule: definition(), asOf, observations: [observation(), observation()] }),
    ).toThrow()
    expect(() =>
      evaluateRule({
        rule: definition(),
        asOf,
        observations: [observation('A', 'process.exit()')],
      }),
    ).toThrow()
    expect(() =>
      evaluateRule({ rule: definition(), asOf, observations: [observation('A', '1e2')] }),
    ).toThrow()
  })
  it('rejects contradictory source revisions and calculation inputs within one evaluation', () => {
    const rule = definition({ kind: 'GROUP', mode: 'AND', children: [leaf(), leaf({ id: 'B' })] })
    const first = observation('A')
    for (const second of [
      { ...observation('B'), source: { ...first.source, revision: '2' } },
      { ...observation('B'), calculation: { ...first.calculation, endDate: '2026-10-01' } },
    ])
      expect(() => evaluateRule({ rule, asOf, observations: [first, second] })).toThrow(
        'consistent source',
      )
  })
  it('returns independent reproducible snapshots without reading the clock', () => {
    const rule = definition()
    const observations = [observation()]
    const result = evaluateRule({ rule, asOf, observations })
    expect(evaluateRule({ rule, asOf, observations })).toEqual(result)
    rule.recommendations[0].text = 'Changed later'
    observations[0].cell.value = '999'
    expect(result.rule.recommendations[0].text).toBe('Review the project schedule.')
    expect(result.evidence).toHaveProperty('observation.cell.value', '9')
  })
  it('evaluates binding-free aggregate metrics against their own source kinds', () => {
    const aggregate = (metric: string, kind: string, value: string, calculation: object) => ({
      ...observation('A', value),
      metric,
      calculation: { kind, ...calculation },
      source: { kind, recordId: project, revision: '1' },
    })
    const budget = { plannedTotal: '4', approvedExpenseTotal: '5' }
    const cases = [
      ['BUDGET_UTILIZATION_PERCENT', 'BUDGET_AGGREGATE', '125', budget],
      [
        'BENEFICIARY_FOLLOW_UP_PERCENT',
        'BENEFICIARY_AGGREGATE',
        '40',
        { population: 10, followUp: 4 },
      ],
      [
        'SURVEY_MEAN_IMPROVEMENT_POINTS',
        'SURVEY_AGGREGATE',
        '-2.5',
        { pairCount: 6, differenceSum: '-15' },
      ],
    ] as const
    for (const [metric, kind, value, calculation] of cases) {
      const result = evaluateRule({
        rule: definition(
          leaf({ metric, operator: 'GTE', threshold: metric.startsWith('SURVEY') ? '-3' : '3' }),
        ),
        asOf,
        observations: [aggregate(metric, kind, value, calculation)],
      })
      expect(result.result).toBe('TRUE')
    }
    expect(() =>
      evaluateRule({
        rule: definition(leaf({ metric: 'BUDGET_UTILIZATION_PERCENT', threshold: '5' })),
        asOf,
        observations: [aggregate('BUDGET_UTILIZATION_PERCENT', 'SURVEY_AGGREGATE', '125', budget)],
      }),
    ).toThrow()
    expect(
      metricObservationSchema.safeParse(
        aggregate('SURVEY_MEAN_IMPROVEMENT_POINTS', 'BUDGET_AGGREGATE', '1', budget),
      ).success,
    ).toBe(false)
    expect(
      metricObservationSchema.safeParse(
        aggregate('SURVEY_MEAN_IMPROVEMENT_POINTS', 'SURVEY_AGGREGATE', '100.5', {
          pairCount: 5,
          differenceSum: '502.5',
        }),
      ).success,
    ).toBe(false)
  })
})
