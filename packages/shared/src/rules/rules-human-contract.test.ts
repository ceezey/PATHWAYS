import { describe, expect, it } from 'vitest'
import {
  alertOutputSchema,
  alertPreviewSchema,
  confirmationOutputSchema,
  createRuleSchema,
  draftRuleSchema,
  dryRunInputSchema,
  dryRunOutputSchema,
  previewOutputSchema,
  recommendationOutputSchema,
  recommendationPreviewSchema,
  reviewSchema,
  revisionSchema,
  ruleListSchema,
  ruleOutputSchema,
  severityBasisSchema,
} from './rules-human-contract'
import type { SeverityBasis } from './severity/severity-criteria'
import fixtureFile from './severity/severity-fixtures.json'
const id = '10000000-0000-4000-8000-000000000001'
const rec = '20000000-0000-4000-8000-000000000002'
const base = { expectedRevision: '1', note: 'Private synthetic note', clientOperationId: id }
describe('human rule and outcome contract', () => {
  it('rejects actor/scope/recipient/SQL injection fields and bounded notes', () => {
    for (const injected of [
      'actorId',
      'organizationId',
      'recipients',
      'sql',
      'permission',
      'previewFingerprint',
    ])
      expect(reviewSchema.safeParse({ ...base, [injected]: id }).success).toBe(false)
    for (const note of ['', ' ', 'x'.repeat(2001)])
      expect(reviewSchema.safeParse({ ...base, note }).success).toBe(false)
  })
  it('retains exact positive bigint revision without numeric conversion', () => {
    expect(revisionSchema.parse('9007199254740993')).toBe('9007199254740993')
    expect(revisionSchema.parse('9223372036854775807')).toBe('9223372036854775807')
    for (const value of ['9223372036854775808', '0', '-1', '1e3', '01', 1])
      expect(revisionSchema.safeParse(value).success).toBe(false)
  })
  it('requires both-resource revision tokens for fixed combined write sets', () => {
    expect(
      alertPreviewSchema.safeParse({ ...base, outcome: 'ACCEPT', recommendationId: rec }).success,
    ).toBe(false)
    expect(
      alertPreviewSchema.safeParse({
        ...base,
        outcome: 'ACCEPT',
        expectedRecommendationRevision: '1',
      }).success,
    ).toBe(false)
    expect(
      alertPreviewSchema.safeParse({
        ...base,
        outcome: 'ACCEPT',
        recommendationId: rec,
        expectedRecommendationRevision: '1',
      }).success,
    ).toBe(true)
    for (const outcome of ['ACCEPT', 'PARTIALLY_ACCEPT']) {
      expect(recommendationPreviewSchema.safeParse({ ...base, outcome }).success).toBe(false)
      expect(
        recommendationPreviewSchema.safeParse({ ...base, outcome, expectedAlertRevision: '1' })
          .success,
      ).toBe(true)
    }
    expect(recommendationPreviewSchema.safeParse({ ...base, outcome: 'DECLINE' }).success).toBe(
      true,
    )
  })
  it('rejects any note body or existence metadata in preview and committed output', () => {
    const preview = {
      previewId: id,
      expiresAt: '2026-09-27T00:05:00Z',
      operationKind: 'ALERT_OUTCOME',
      alertRevision: '1',
      recommendationRevision: null,
      outcome: 'DECLINE',
      message: 'An authorized outcome will be recorded.',
      recipientCount: 0,
    }
    expect(previewOutputSchema.safeParse(preview).success).toBe(true)
    const confirmation = {
      decisionId: id,
      alertId: id,
      recommendationId: null,
      alertRevision: '2',
      recommendationRevision: null,
      lifecycle: 'NEW',
      outcome: 'DECLINE',
      recordedAt: '2026-09-27T00:00:00Z',
      delivery: { pending: 0, delivered: 0, failed: 0 },
    }
    expect(confirmationOutputSchema.safeParse(confirmation).success).toBe(true)
    for (const injected of ['note', 'privateNote', 'notesRecorded', 'hasNote', 'privateReviewId']) {
      expect(previewOutputSchema.safeParse({ ...preview, [injected]: true }).success).toBe(false)
      expect(
        confirmationOutputSchema.safeParse({ ...confirmation, [injected]: true }).success,
      ).toBe(false)
    }
  })
  it('bounds lists and preserves separate unbound templates and project copies', () => {
    expect(ruleListSchema.parse({})).toEqual({ limit: 25 })
    for (const limit of ['0', '101', '1e2', '025', '-1', ['25']])
      expect(ruleListSchema.safeParse({ limit }).success).toBe(false)
    const input = {
      name: 'Review schedule',
      severity: null,
      code: 'SCHEDULE',
      clientOperationId: id,
      conditions: {
        kind: 'CONDITION',
        id: 'A',
        metric: 'PROJECT_REMAINING_DAYS',
        operator: 'LT',
        threshold: '5',
      },
      recommendations: [{ id: rec, title: 'Review', text: 'Review the current schedule.' }],
    }
    expect(createRuleSchema.safeParse(input).success).toBe(true)
    expect(createRuleSchema.safeParse({ ...input, templateId: rec }).success).toBe(false)
    expect(createRuleSchema.safeParse({ ...input, templateId: rec, projectId: id }).success).toBe(
      true,
    )
    expect(
      createRuleSchema.safeParse({
        ...input,
        recommendations: [...input.recommendations, ...input.recommendations],
      }).success,
    ).toBe(false)
    const { code, ...draft } = input
    expect(
      draftRuleSchema.safeParse({
        ...draft,
        expectedVersion: 1,
        recommendations: [...input.recommendations, ...input.recommendations],
      }).success,
    ).toBe(false)
  })
  it('parses aggregate metrics without bindings and the auto-resolved recommendation status', () => {
    const input = {
      name: 'Review aggregates',
      severity: null,
      code: 'AGGREGATES',
      clientOperationId: id,
      recommendations: [{ id: rec, title: 'Review', text: 'Review the aggregates.' }],
    }
    const condition = (metric: string, threshold: string) => ({
      kind: 'CONDITION',
      id: 'A',
      metric,
      operator: 'GT',
      threshold,
    })
    for (const [metric, threshold] of [
      ['BUDGET_UTILIZATION_PERCENT', '120'],
      ['BENEFICIARY_FOLLOW_UP_PERCENT', '30'],
      ['SURVEY_MEAN_IMPROVEMENT_POINTS', '-5'],
    ])
      expect(
        createRuleSchema.safeParse({ ...input, conditions: condition(metric, threshold) }).success,
      ).toBe(true)
    for (const bad of [
      condition('BENEFICIARY_FOLLOW_UP_PERCENT', '101'),
      condition('BUDGET_UTILIZATION_PERCENT', '-1'),
      condition('SURVEY_MEAN_IMPROVEMENT_POINTS', '100.0001'),
      condition('FOO', '1'),
      { ...condition('BUDGET_UTILIZATION_PERCENT', '1'), indicatorId: id },
    ])
      expect(createRuleSchema.safeParse({ ...input, conditions: bad }).success).toBe(false)
    const output = {
      id,
      projectId: id,
      alertId: id,
      ruleId: id,
      title: 'Review',
      text: 'Review it.',
      basis: 'Basis',
      status: 'AUTO_RESOLVED',
      revision: '1',
      proposedAt: '2026-10-01T00:00:00.000Z',
      reviewedAt: null,
    }
    expect(recommendationOutputSchema.safeParse(output).success).toBe(true)
    expect(recommendationOutputSchema.safeParse({ ...output, status: 'ACCEPTED' }).success).toBe(
      false,
    )
  })
})

const bases = (fixtureFile as unknown as { expected: SeverityBasis }[]).map((item) => item.expected)
const basis = bases[0] as SeverityBasis
const rule = {
  name: 'Review assessment',
  severity: null,
  code: 'ASSESSMENT',
  clientOperationId: id,
  conditions: {
    kind: 'CONDITION',
    id: 'A',
    metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS',
    operator: 'LT',
    threshold: '5',
  },
  recommendations: [{ id: rec, title: 'Review', text: 'Review the assessment plan.' }],
}
const alert = {
  id,
  projectId: id,
  ruleId: id,
  ruleVersion: 1,
  title: 'Review assessment',
  explanation: 'Assessment improvement is below the threshold.',
  severity: null,
  severityBasis: basis,
  severityChange: null,
  lifecycle: 'NEW',
  revision: '1',
  evaluatedAt: '2026-10-19T00:00:00.000Z',
  freshness: 'CURRENT',
  conditions: rule.conditions,
  evidence: [
    {
      conditionId: 'A',
      metric: 'SURVEY_MEAN_IMPROVEMENT_POINTS',
      operator: 'LT',
      threshold: '5',
      thresholdMaximum: null,
      cell: { state: 'AVAILABLE', value: '2', reason: null },
      unit: 'points',
      result: 'TRUE',
    },
  ],
  asOf: '2026-10-19T00:00:00.000Z',
  reportingDate: '2026-10-19',
  calendar: { zone: 'Asia/Manila', version: '1' },
  predefinedRecommendations: rule.recommendations,
  linkedRecommendationIds: [],
}
describe('severity classification contract', () => {
  it('accepts only a manual Critical mark or null on rule writes', () => {
    for (const severity of [null, 'CRITICAL'])
      expect(createRuleSchema.safeParse({ ...rule, severity }).success).toBe(true)
    for (const severity of ['LOW', 'MEDIUM', 'HIGH', undefined])
      expect(createRuleSchema.safeParse({ ...rule, severity }).success).toBe(false)
    const { code, ...draft } = rule
    expect(
      draftRuleSchema.safeParse({ ...draft, severity: 'HIGH', expectedVersion: 1 }).success,
    ).toBe(false)
  })
  it('bounds expectations to exact decimals from 0 to 100', () => {
    for (const expectations of [
      {},
      { expectedScoreImprovement: '0', manageableFollowUpPercent: '100' },
      { expectedScoreImprovement: null, manageableFollowUpPercent: '12.5' },
    ])
      expect(createRuleSchema.safeParse({ ...rule, expectations }).success).toBe(true)
    for (const expectations of [
      { expectedScoreImprovement: '101' },
      { manageableFollowUpPercent: '-1' },
      { expectedScoreImprovement: '100.0001' },
      { expectedScoreImprovement: 10 },
      { other: '1' },
    ])
      expect(createRuleSchema.safeParse({ ...rule, expectations }).success).toBe(false)
  })
  it('reads stored legacy rule levels and null', () => {
    const { clientOperationId, ...content } = rule
    const output = {
      ...content,
      id,
      projectId: id,
      logicalRuleId: id,
      templateOriginId: null,
      version: 1,
      status: 'ACTIVE',
      activatedAt: '2026-10-19T00:00:00.000Z',
      archivedAt: null,
      expectations: { expectedScoreImprovement: '10', manageableFollowUpPercent: null },
    }
    for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null])
      expect(ruleOutputSchema.safeParse({ ...output, severity }).success).toBe(true)
  })
  it('parses an alert with a basis, a change and a null severity', () => {
    expect(alertOutputSchema.parse(alert).severityBasis).toEqual(basis)
    const change = { from: 'MEDIUM', to: 'HIGH', at: '2026-10-22T01:00:00.000Z', previous: basis }
    expect(
      alertOutputSchema.safeParse({ ...alert, severity: 'HIGH', severityChange: change }).success,
    ).toBe(true)
    expect(
      alertOutputSchema.safeParse({ ...alert, severityBasis: null, severity: 'HIGH' }).success,
    ).toBe(true)
    expect(
      alertOutputSchema.safeParse({
        ...alert,
        severityChange: { ...change, previous: { ...basis, extra: true } },
      }).success,
    ).toBe(false)
    const { severityBasis, ...legacy } = alert
    expect(alertOutputSchema.safeParse(legacy).success).toBe(false)
  })
  it('mirrors every classifier fixture basis exactly', () => {
    for (const item of bases) expect(severityBasisSchema.parse(item)).toEqual(item)
    for (const broken of [
      { ...basis, criteriaVersion: 'severity-guide-v0.1' },
      { ...basis, level: 'CRITICAL' },
      { ...basis, reason: 'free text' },
      { ...basis, conditions: [{ ...basis.conditions[0], note: 'x' }] },
    ])
      expect(severityBasisSchema.safeParse(broken).success).toBe(false)
  })
  it('carries expectations into dry-run and a nullable basis out of it', () => {
    const definition = {
      organizationId: id,
      projectId: id,
      ruleId: id,
      version: 1,
      name: rule.name,
      severity: null,
      expectations: { expectedScoreImprovement: '10' },
      conditions: rule.conditions,
      recommendations: rule.recommendations,
    }
    const input = { rule: definition, asOf: '2026-10-19T00:00:00.000Z', observations: [] }
    expect(dryRunInputSchema.parse(input).rule.expectations).toEqual({
      expectedScoreImprovement: '10',
    })
    expect(
      dryRunInputSchema.safeParse({ ...input, rule: { ...definition, severity: 'HIGH' } }).success,
    ).toBe(false)
    const output = {
      contractVersion: 'f10.v1',
      rule: definition,
      asOf: input.asOf,
      result: 'FALSE',
      evidence: {
        condition: rule.conditions,
        observation: null,
        result: 'FALSE',
        reason: 'NO_OBSERVATION',
      },
      severityBasis: null,
    }
    expect(dryRunOutputSchema.safeParse(output).success).toBe(true)
    expect(
      dryRunOutputSchema.safeParse({ ...output, result: 'TRUE', severityBasis: basis }).success,
    ).toBe(true)
    expect(dryRunOutputSchema.safeParse({ ...output, severityBasis: basis }).success).toBe(false)
    const { severityBasis, ...missing } = output
    expect(dryRunOutputSchema.safeParse(missing).success).toBe(false)
  })
})
