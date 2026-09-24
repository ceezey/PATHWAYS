import { describe, expect, it } from 'vitest'

import { missingMetric, numericMetric } from './metric-math'
import {
  compareActivityProgressToTargetGoal,
  compareProgressToTargetGoal,
  normalizeTargetGoal,
  targetGoalSchema,
} from './target-goal'

describe('T1 project target goal', () => {
  it('normalizes exact percentage values and rejects zero, overflow, exponent and excess precision', () => {
    expect(normalizeTargetGoal('75.2500')).toBe('75.25')
    expect(normalizeTargetGoal('100.0000')).toBe('100')
    for (const value of ['0', '-1', '100.0001', '1e2', '50.00001', 'NaN', 'Infinity']) {
      expect(targetGoalSchema.safeParse(value).success).toBe(false)
    }
  })

  it('keeps a missing project target explicitly unavailable', () => {
    expect(compareActivityProgressToTargetGoal(50, null)).toEqual({
      state: 'UNAVAILABLE',
      reason: 'TARGET_GOAL_UNSET',
    })
  })

  it('compares activity progress below, at and above the exact project threshold', () => {
    expect(compareActivityProgressToTargetGoal(49, '50').state).toBe('BELOW_TARGET')
    expect(compareActivityProgressToTargetGoal(50, '50.0000').state).toBe('AT_TARGET')
    expect(compareActivityProgressToTargetGoal(51, '50').state).toBe('ABOVE_TARGET')
  })

  it('changes only the read-time comparison when the project target changes', () => {
    const progress = numericMetric('62.5')
    expect(compareProgressToTargetGoal(progress, '60').state).toBe('ABOVE_TARGET')
    expect(compareProgressToTargetGoal(progress, '62.5').state).toBe('AT_TARGET')
    expect(compareProgressToTargetGoal(progress, '70').state).toBe('BELOW_TARGET')
    expect(progress).toEqual({ state: 'AVAILABLE', value: '62.5', reason: null })
  })

  it('does not clamp valid indicator progress and preserves unavailable reasons', () => {
    expect(compareProgressToTargetGoal(numericMetric('-5'), '50').state).toBe('BELOW_TARGET')
    expect(compareProgressToTargetGoal(numericMetric('125'), '50').state).toBe('ABOVE_TARGET')
    expect(compareProgressToTargetGoal(missingMetric('NO_MEASUREMENT'), '50')).toEqual({
      state: 'UNAVAILABLE',
      reason: 'NO_MEASUREMENT',
    })
  })
})
