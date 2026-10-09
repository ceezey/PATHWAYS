import * as shared from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { ZodType } from 'zod'
import * as oldMetrics from './rule-test-metrics'
import * as oldHuman from './rules-human-contract'
import * as oldContract from './rules-validation'

// Temporary parity proof that the shared rules modules accept and reject what the web copies did.
type Exports = Record<string, unknown>
const sharedExports = shared as unknown as Exports
const outcome = (run: () => unknown) => {
  try {
    return { value: run() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
const schemasOf = (module: unknown) =>
  Object.entries(module as Exports).filter(
    (entry): entry is [string, ZodType] => entry[1] instanceof ZodType,
  )
const sharedName = (name: string) => (name === 'metricCellSchema' ? 'ruleMetricCellSchema' : name)

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const record = '30000000-0000-4000-8000-000000000003'
const rec = '40000000-0000-4000-8000-000000000004'
const op = '50000000-0000-4000-8000-000000000005'
const asOf = '2026-09-26T00:00:00.000Z'
const scope = { organizationId: org, projectId: project }
const context = { scope, conditionId: 'A', asOf }
const condition = (patch: Record<string, unknown> = {}) => ({
  kind: 'CONDITION',
  id: 'a',
  metric: 'PROJECT_REMAINING_DAYS',
  operator: 'LT',
  threshold: '0',
  ...patch,
})
const group = (children: unknown[], mode = 'AND') => ({ kind: 'GROUP', mode, children })
const nested = (depth: number): unknown => (depth === 0 ? condition() : group([nested(depth - 1)]))
const trees: unknown[] = [
  condition(),
  condition({
    metric: 'INDICATOR_CURRENT_VALUE',
    indicatorId: record,
    threshold: '9007199254740.0001',
  }),
  condition({ sql: 'select private' }),
  condition({ indicatorId: record }),
  condition({ operator: 'BETWEEN', threshold: '1', thresholdMaximum: '5' }),
  condition({ operator: 'BETWEEN', threshold: '5', thresholdMaximum: '1' }),
  condition({ threshold: '1.5' }),
  condition({ metric: 'ACTIVITY_COMPLETION_PERCENT', threshold: '101' }),
  group([condition(), condition({ id: 'b' })]),
  group([condition(), condition({ id: 'b' })], 'OR'),
  group([condition(), condition()]),
  group([]),
  nested(3),
  nested(6),
  group(Array.from({ length: 33 }, (_, index) => condition({ id: `c${index}` }))),
  null,
  'CONDITION',
]
const cells: unknown[] = [
  { state: 'ZERO', value: '0', reason: null },
  { state: 'AVAILABLE', value: '15', reason: null },
  { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
  { state: 'MISSING', value: '0', reason: 'NO_MEASUREMENT' },
  { state: 'SUPPRESSED', value: null, reason: 'SUPPRESSED' },
  { state: 'AVAILABLE', value: 'abc', reason: null },
  { state: 'AVAILABLE', value: '1', reason: null, extra: true },
]
const timelineInput = {
  ...context,
  metric: 'PROJECT_REMAINING_DAYS',
  reportingDate: '2026-09-26',
  revision: '1',
  startDate: '2026-09-20',
  endDate: '2026-09-30',
}
const planned = { projectStatus: 'PLANNED', projectArchived: false }
const observation = shared.timelineObservation({ ...timelineInput, ...planned })
const recommendation = { id: rec, title: 'Review schedule', text: 'Review schedule.' }
const content = {
  name: 'Entered schedule',
  severity: 'LOW',
  conditions: condition(),
  recommendations: [recommendation],
}
const definition = { ...scope, ruleId: record, version: 1, ...content }
const contractInputs: unknown[] = [
  ...trees,
  ...cells,
  observation,
  { ...observation, metric: 'UNKNOWN_METRIC' },
  { ...observation, cell: cells[3] },
  definition,
  { ...definition, recommendations: [] },
  { ...definition, recommendations: [recommendation, recommendation] },
  recommendation,
  record,
  'not-a-uuid',
  '12.5',
  '1e3',
  'A',
  'a b',
  42,
]
const review = { expectedRevision: '1', note: 'Private synthetic note', clientOperationId: op }
const humanInputs: unknown[] = [
  review,
  { ...review, expectedRevision: '0' },
  { ...review, note: ' ' },
  { ...review, actorId: op },
  { ...review, outcome: 'ACCEPT', recommendationId: rec, expectedRecommendationRevision: '1' },
  { ...review, outcome: 'DECLINE' },
  { ...review, action: 'RESOLVE' },
  { ...content, code: 'RULE_A', clientOperationId: op },
  { ...content, code: 'RULE_A', templateId: op, clientOperationId: op },
  { ...content, code: 'rule', clientOperationId: op },
  { ...content, expectedVersion: 1, clientOperationId: op },
  { expectedVersion: 1, clientOperationId: op },
  { expectedVersion: 1, clientOperationId: op, note: 'Archive it' },
  { expectedVersion: 0, clientOperationId: op },
  { rule: definition, asOf, observations: [] },
  { rule: definition, asOf, observations: [observation] },
  { rule: { ...definition, severity: 'URGENT' }, asOf, observations: [] },
  {
    contractVersion: 'f10.v1',
    rule: definition,
    asOf,
    result: 'UNAVAILABLE',
    evidence: {
      condition: condition(),
      observation: null,
      result: 'UNAVAILABLE',
      reason: 'NO_OBSERVATION',
    },
  },
  {
    contractVersion: 'f10.v1',
    rule: definition,
    asOf,
    result: 'TRUE',
    evidence: { kind: 'GROUP', mode: 'AND', result: 'TRUE', children: [] },
  },
  {},
  null,
]
const indicator = {
  ...scope,
  id: record,
  revision: '1',
  status: 'ACTIVE',
  mode: 'MANUAL',
  recipe: null,
  numericKind: 'SIGNED_CHANGE',
  direction: 'HIGHER_IS_BETTER',
  baseline: '10',
  target: '20',
  current: { state: 'AVAILABLE', value: '15', reason: null },
}
const activity = (
  id: string,
  status = 'IN_PROGRESS',
  plannedEndDate: string | null = '2026-09-25',
) => ({
  ...scope,
  id,
  revision: '1',
  status,
  archived: false,
  plannedEndDate,
})
const activityBase = { ...context, reportingDate: '2026-09-26', populationRevision: '1' }
const open = { ...context, projectStatus: 'ONGOING', projectArchived: false, revision: '1' }
const metricCases: Array<[string, unknown[]]> = [
  [
    'indicatorObservation',
    [
      { ...context, metric: 'INDICATOR_CURRENT_VALUE', indicator },
      { ...context, metric: 'INDICATOR_PROGRESS_PERCENT', indicator },
      {
        ...context,
        metric: 'INDICATOR_PROGRESS_PERCENT',
        indicator: { ...indicator, organizationId: project },
      },
      { ...context, metric: 'PROJECT_REMAINING_DAYS', indicator },
    ],
  ],
  [
    'timelineObservation',
    [
      { ...timelineInput, ...planned },
      { ...timelineInput, projectStatus: 'COMPLETED', projectArchived: false },
      { ...timelineInput, projectStatus: 'ONGOING', projectArchived: true },
      { ...timelineInput, ...planned, endDate: null },
      { ...timelineInput, ...planned, reportingDate: '2026-02-30' },
    ],
  ],
  [
    'activityObservation',
    [
      {
        ...activityBase,
        metric: 'ACTIVITY_COMPLETION_PERCENT',
        activities: [activity(record, 'COMPLETED'), activity(rec)],
      },
      {
        ...activityBase,
        metric: 'ACTIVITY_OVERDUE_COUNT',
        activities: [activity(record, 'IN_PROGRESS', null)],
      },
      {
        ...activityBase,
        metric: 'ACTIVITY_OVERDUE_DAYS',
        activityId: record,
        activities: [activity(record)],
      },
      { ...activityBase, metric: 'ACTIVITY_OVERDUE_DAYS', activities: [activity(record)] },
      {
        ...activityBase,
        metric: 'ACTIVITY_COMPLETION_PERCENT',
        activities: [activity(record), activity(record)],
      },
    ],
  ],
  [
    'budgetObservation',
    [
      {
        ...open,
        recordCount: 2,
        currencyCount: 1,
        plannedTotal: '200',
        approvedExpenseTotal: '50',
      },
      { ...open, recordCount: 2, currencyCount: 1, plannedTotal: '0', approvedExpenseTotal: '50' },
      {
        ...open,
        recordCount: 2,
        currencyCount: 2,
        plannedTotal: '200',
        approvedExpenseTotal: '50',
      },
      { ...open, recordCount: 2, currencyCount: 1, plannedTotal: '-1', approvedExpenseTotal: '50' },
    ],
  ],
  [
    'beneficiaryFollowUpObservation',
    [
      { ...open, population: 20, followUp: 10 },
      { ...open, population: 10, followUp: 3 },
      { ...open, population: 5, followUp: 6 },
    ],
  ],
  [
    'surveyImprovementObservation',
    [
      { ...open, pairCount: 6, differenceSum: '12.5' },
      { ...open, pairCount: 2, differenceSum: '4' },
      { ...open, pairCount: 0, differenceSum: '0' },
    ],
  ],
]

describe('shared rules modules keep the web copies behavior', () => {
  it('exports every name the web copies exported', () => {
    for (const name of [
      ...Object.keys(oldContract),
      ...Object.keys(oldMetrics),
      ...Object.keys(oldHuman),
    ])
      expect(sharedExports).toHaveProperty(sharedName(name))
  })

  it('keeps the rule constants identical', () => {
    for (const name of [
      'RULE_CONTRACT_VERSION',
      'MAX_CONDITIONS',
      'ruleMetrics',
      'operators',
      'metricReasons',
    ])
      expect(sharedExports[name]).toEqual((oldContract as unknown as Exports)[name])
    expect(shared.decisionOutcomes).toEqual(oldHuman.decisionOutcomes)
  })

  it('parses rule trees identically and the corpus has both outcomes', () => {
    const results = trees.map((tree) => outcome(() => shared.parseRuleTree(tree)))
    for (const [index, tree] of trees.entries())
      expect(results[index]).toEqual(outcome(() => oldContract.parseRuleTree(tree)))
    expect(results.some((result) => 'value' in result)).toBe(true)
    expect(results.some((result) => 'error' in result)).toBe(true)
  })

  it.each(schemasOf(oldContract))(
    'contract schema %s accepts and rejects identically',
    (name, schema) => {
      const next = sharedExports[sharedName(name)] as ZodType
      for (const input of contractInputs)
        expect(outcome(() => next.parse(input))).toEqual(outcome(() => schema.parse(input)))
    },
  )

  it.each(schemasOf(oldHuman))(
    'review schema %s accepts and rejects identically',
    (name, schema) => {
      const next = sharedExports[name] as ZodType
      for (const input of humanInputs)
        expect(outcome(() => next.parse(input))).toEqual(outcome(() => schema.parse(input)))
    },
  )

  it.each(metricCases)('%s computes identical observations', (name, inputs) => {
    const next = sharedExports[name] as (input: unknown) => unknown
    const previous = (oldMetrics as unknown as Exports)[name] as (input: unknown) => unknown
    for (const input of inputs)
      expect(outcome(() => next(input))).toEqual(outcome(() => previous(input)))
  })

  it('differs only where ruling 8 drops the two timeline defaults', () => {
    expect(outcome(() => oldMetrics.timelineObservation(timelineInput))).toHaveProperty('value')
    expect(outcome(() => shared.timelineObservation(timelineInput))).toHaveProperty('error')
    expect(shared.timelineObservation({ ...timelineInput, ...planned })).toEqual(
      oldMetrics.timelineObservation(timelineInput),
    )
  })
})
