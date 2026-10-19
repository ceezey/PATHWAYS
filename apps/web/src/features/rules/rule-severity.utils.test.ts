import type { RuleNode } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { previewSeverity, recommendationPrefill, relevantExpectations } from './rule-severity.utils'

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

const group = (mode: 'AND' | 'OR', ...children: RuleNode[]): RuleNode => ({
  kind: 'GROUP',
  mode,
  children,
})
const bound = (id: string, operator: string, threshold: string, indicatorId: string) =>
  ({
    ...(leaf(id, 'INDICATOR_PROGRESS_PERCENT', operator, threshold) as object),
    indicatorId,
  }) as RuleNode

describe('severity preview', () => {
  it('narrows follow-up and assessment levels with the stored expectations', () => {
    const followUp = { manageableFollowUpPercent: '10' }
    expect(
      previewSeverity(leaf('a', 'BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '30'), followUp),
    ).toEqual({
      levels: ['HIGH'],
      dependsOnDates: false,
      explanatoryOnly: false,
      needs: [],
      contradiction: null,
    })
    expect(
      previewSeverity(leaf('a', 'BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '12'), followUp).levels,
    ).toEqual(['LOW', 'MEDIUM', 'HIGH'])
    expect(
      previewSeverity(leaf('a', 'SURVEY_MEAN_IMPROVEMENT_POINTS', 'LT', '8'), {
        expectedScoreImprovement: '10',
      }).levels,
    ).toEqual(['LOW', 'MEDIUM', 'HIGH'])
    expect(
      previewSeverity(leaf('a', 'SURVEY_MEAN_IMPROVEMENT_POINTS', 'LT', '-1'), {
        expectedScoreImprovement: '10',
      }).levels,
    ).toEqual(['HIGH'])
  })
  it('asks for a missing expectation without narrowing', () => {
    expect(
      previewSeverity(leaf('a', 'BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '30'), {}),
    ).toMatchObject({
      levels: ['LOW', 'MEDIUM', 'HIGH'],
      needs: ['MANAGEABLE_FOLLOW_UP_LEVEL'],
    })
    expect(
      previewSeverity(leaf('a', 'SURVEY_MEAN_IMPROVEMENT_POINTS', 'LT', '8'), {
        expectedScoreImprovement: 'abc',
      }).needs,
    ).toEqual(['EXPECTED_SCORE_IMPROVEMENT'])
  })
  it('reads budget bands from the criteria and keeps the within-budget part explanatory', () => {
    expect(previewSeverity(leaf('a', 'BUDGET_UTILIZATION_PERCENT', 'GT', '110'), {})).toMatchObject(
      {
        levels: ['HIGH'],
        needs: [],
      },
    )
    expect(previewSeverity(leaf('a', 'BUDGET_UTILIZATION_PERCENT', 'GT', '90'), {})).toMatchObject({
      levels: ['MEDIUM', 'HIGH'],
      explanatoryOnly: false,
      needs: ['DELIVERY_EXPECTATION'],
    })
  })
  it('says when the level depends on dates and when time alone only explains', () => {
    expect(previewSeverity(leaf('a', 'INDICATOR_PROGRESS_PERCENT', 'LT', '75'), {})).toMatchObject({
      levels: ['LOW', 'MEDIUM', 'HIGH'],
      dependsOnDates: true,
    })
    expect(previewSeverity(leaf('a', 'PROJECT_TIMELINE_ELAPSED_PERCENT', 'GT', '80'), {})).toEqual({
      levels: [],
      dependsOnDates: false,
      explanatoryOnly: true,
      needs: ['DELIVERY_EXPECTATION'],
      contradiction: null,
    })
    expect(previewSeverity(leaf('a', 'PROJECT_OVERDUE_DAYS', 'EQ', '0'), {}).levels).toEqual([
      'LOW',
    ])
  })
  it('flags contradictory comparisons on the same metric and binding inside an AND group', () => {
    const other = '22222222-2222-4222-8222-222222222222'
    expect(
      previewSeverity(
        group('AND', bound('a', 'LT', '20', testRecordId), bound('b', 'GT', '80', testRecordId)),
        {},
      ).contradiction,
    ).toBe('These conditions cannot happen together.')
    expect(
      previewSeverity(
        group('AND', bound('a', 'LT', '20', testRecordId), bound('b', 'GT', '80', other)),
        {},
      ).contradiction,
    ).toBeNull()
    expect(
      previewSeverity(
        group('OR', bound('a', 'LT', '20', testRecordId), bound('b', 'GT', '80', testRecordId)),
        {},
      ).contradiction,
    ).toBeNull()
  })
  it('keeps AND levels at or above the highest leaf minimum and unites OR levels', () => {
    const followUp = leaf('a', 'BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '12')
    const budget = leaf('b', 'BUDGET_UTILIZATION_PERCENT', 'GT', '100')
    const expectations = { manageableFollowUpPercent: '10' }
    expect(previewSeverity(group('AND', followUp, budget), expectations).levels).toEqual([
      'MEDIUM',
      'HIGH',
    ])
    expect(previewSeverity(group('OR', followUp, budget), expectations).levels).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
    ])
    const timeline = leaf('c', 'PROJECT_TIMELINE_ELAPSED_PERCENT', 'GT', '80')
    expect(previewSeverity(group('AND', timeline, budget), {})).toMatchObject({
      levels: ['MEDIUM', 'HIGH'],
      explanatoryOnly: false,
      needs: [],
    })
  })
  it('previews an incomplete condition across its whole range instead of failing', () => {
    expect(previewSeverity(leaf('a', 'BUDGET_UTILIZATION_PERCENT', 'GT', ''), {}).levels).toEqual([
      'MEDIUM',
      'HIGH',
    ])
  })
  it('keeps only the expectations for metrics the rule uses', () => {
    const values = { expectedScoreImprovement: ' 10 ', manageableFollowUpPercent: '5' }
    expect(
      relevantExpectations(leaf('a', 'SURVEY_MEAN_IMPROVEMENT_POINTS', 'LT', '8'), values),
    ).toEqual({
      expectedScoreImprovement: '10',
      manageableFollowUpPercent: null,
    })
    expect(
      relevantExpectations(leaf('a', 'BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '8'), {
        manageableFollowUpPercent: ' ',
      }),
    ).toEqual({ expectedScoreImprovement: null, manageableFollowUpPercent: null })
  })
  it('offers predefined authoring copy by metric family and combines mixed families', () => {
    expect(recommendationPrefill(leaf('a', 'BUDGET_UTILIZATION_PERCENT', 'GTE', '80'))).toEqual({
      title: 'Review budget utilization',
      text: 'Review approved spending and remaining allocation with authorized budget staff before considering any adjustment.',
    })
    expect(recommendationPrefill(tree)).toMatchObject({ title: 'Review combined signals' })
  })
})
