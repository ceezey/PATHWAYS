import { indicatorObservation, surveyImprovementObservation } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { evaluateRuleWithSeverity } from './rule-engine'

const org = '10000000-0000-4000-8000-000000000001'
const project = '20000000-0000-4000-8000-000000000002'
const indicatorId = '30000000-0000-4000-8000-000000000003'
const asOf = '2026-09-26T00:00:00.000Z'
const scope = { organizationId: org, projectId: project }

const definition = (conditions: unknown, patch: Record<string, unknown> = {}) => ({
  ...scope,
  ruleId: '40000000-0000-4000-8000-000000000004',
  version: 1,
  name: 'Synthetic severity rule',
  severity: null,
  conditions,
  recommendations: [
    { id: '50000000-0000-4000-8000-000000000005', title: 'Review', text: 'Review the plan.' },
  ],
  ...patch,
})
const progressLeaf = {
  kind: 'CONDITION',
  id: 'A',
  metric: 'INDICATOR_PROGRESS_PERCENT',
  operator: 'LT',
  threshold: '80',
  indicatorId,
}
const progress = (current: string) =>
  indicatorObservation({
    scope,
    conditionId: 'A',
    asOf,
    metric: 'INDICATOR_PROGRESS_PERCENT',
    indicator: {
      ...scope,
      id: indicatorId,
      revision: '1',
      status: 'ACTIVE',
      mode: 'MANUAL',
      recipe: null,
      numericKind: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
      baseline: '0',
      target: '100',
      targetDate: '2026-09-01',
      current: { state: 'AVAILABLE', value: current, reason: null },
    },
  })
const surveyLeaf = {
  kind: 'CONDITION',
  id: 'S',
  metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS',
  operator: 'LT',
  threshold: '5',
}
const survey = surveyImprovementObservation({
  scope,
  conditionId: 'S',
  asOf,
  revision: '1',
  projectStatus: 'ONGOING',
  projectArchived: false,
  pairCount: 5,
  differenceSum: '10',
})

describe('dry-run severity basis', () => {
  it('classifies a TRUE guide example as High', () => {
    const out = evaluateRuleWithSeverity({
      rule: definition(progressLeaf),
      asOf,
      observations: [progress('45')],
    })
    expect(out.result).toBe('TRUE')
    expect(out.severityBasis?.level).toBe('HIGH')
  })
  it('returns a null basis when the rule does not match', () => {
    const out = evaluateRuleWithSeverity({
      rule: definition(progressLeaf),
      asOf,
      observations: [progress('90')],
    })
    expect(out.result).toBe('FALSE')
    expect(out.severityBasis).toBeNull()
  })
  it('uses rule expectations for assessment scores', () => {
    const run = (expectations?: Record<string, unknown>) =>
      evaluateRuleWithSeverity({
        rule: definition(surveyLeaf, expectations ? { expectations } : {}),
        asOf,
        observations: [survey],
      })
    expect((run({ expectedScoreImprovement: '20' })).severityBasis?.level).toBe('HIGH')
    expect((run()).severityBasis?.status).toBe('CONTEXT_REQUIRED')
  })
})
