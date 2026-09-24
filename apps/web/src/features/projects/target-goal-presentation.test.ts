import { describe, expect, it } from 'vitest'

import { describeTargetGoalComparison } from './target-goal-presentation'

describe('describeTargetGoalComparison', () => {
  it.each([
    ['BELOW_TARGET', 'Below project target'],
    ['AT_TARGET', 'At project target'],
    ['ABOVE_TARGET', 'Above project target'],
  ] as const)('presents %s without inventing a success label', (state, label) => {
    expect(describeTargetGoalComparison({ state, reason: null })).toBe(label)
  })

  it('keeps an unset project target explicit', () => {
    expect(
      describeTargetGoalComparison({ state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' }),
    ).toBe('Project target not set')
  })
})
