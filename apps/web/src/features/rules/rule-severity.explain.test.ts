import type { RuleMetricKey } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import { explainCombination, explainConditions } from './rule-severity.explain'
import type { Leaf } from './rules.utils'

const leaf = (metric: RuleMetricKey, operator: Leaf['operator'], threshold: string): Leaf => ({
  kind: 'CONDITION',
  id: `c_${metric}`,
  metric,
  operator,
  threshold,
})
const text = (item: Leaf, expectations = {}) => explainConditions([item], expectations)[0]?.text

describe('explainConditions', () => {
  it('names the condition and the guide bands per metric', () => {
    const [row] = explainConditions([leaf('PROJECT_OVERDUE_DAYS', 'GT', '10')], {})
    expect(row?.condition).toBe('Days past project end is above 10 days')
    expect(row?.text).toBe(
      'Days past the end date are compared with the project’s planned length: Low up to 5%, Medium up to 10%, High above 10%.',
    )
    expect(text(leaf('ACTIVITY_OVERDUE_COUNT', 'GT', '2'))).toContain('Medium up to 15%')
    expect(text(leaf('INDICATOR_PROGRESS_PERCENT', 'LT', '50'))).toContain(
      'Low up to 10% behind, Medium up to 25%, High above 25%',
    )
    expect(text(leaf('BUDGET_UTILIZATION_PERCENT', 'GT', '95'))).toContain(
      'above 100% up to 110% is Medium and above 110% is High',
    )
  })
  it('states explanatory-only metrics and asks for missing expectations', () => {
    expect(text(leaf('PROJECT_TIMELINE_ELAPSED_PERCENT', 'GT', '50'))).toContain('sets no level')
    expect(text(leaf('BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '30'))).toContain('(enter it below)')
    expect(
      text(leaf('BENEFICIARY_FOLLOW_UP_PERCENT', 'GT', '30'), { manageableFollowUpPercent: '20' }),
    ).toContain('manageable level of 20%')
    expect(text(leaf('SURVEY_MEAN_IMPROVEMENT_POINTS', 'LT', '5'))).toContain('(enter it below)')
  })
})

describe('explainCombination', () => {
  it('adds nothing for one condition and the highest-wins note for several', () => {
    expect(explainCombination([leaf('PROJECT_OVERDUE_DAYS', 'GT', '1')])).toEqual([])
    expect(
      explainCombination([
        leaf('PROJECT_OVERDUE_DAYS', 'GT', '1'),
        leaf('ACTIVITY_OVERDUE_COUNT', 'GT', '1'),
      ]),
    ).toEqual(['When several conditions match, the highest level wins.'])
  })
  it('names the high spending with low delivery combination', () => {
    const notes = explainCombination([
      leaf('BUDGET_UTILIZATION_PERCENT', 'GT', '95'),
      leaf('ACTIVITY_COMPLETION_PERCENT', 'LT', '50'),
    ])
    expect(notes).toHaveLength(2)
    expect(notes[1]).toContain('combined signal')
  })
})
