import { describe, expect, it } from 'vitest'
import {
  alertPreviewSchema,
  confirmationOutputSchema,
  createRuleSchema,
  draftRuleSchema,
  previewOutputSchema,
  recommendationPreviewSchema,
  reviewSchema,
  revisionSchema,
  ruleListSchema,
} from './rules-human-contract'
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
      severity: 'MEDIUM',
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
})
