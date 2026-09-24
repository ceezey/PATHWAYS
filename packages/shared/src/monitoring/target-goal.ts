import { z } from 'zod'

import {
  type MetricCell,
  normalizeMetricDecimal,
  numericMetric,
  scaledDecimal,
} from './metric-math'

export const targetGoalComparisonStates = [
  'BELOW_TARGET',
  'AT_TARGET',
  'ABOVE_TARGET',
  'UNAVAILABLE',
] as const

export const targetGoalComparisonSchema = z
  .object({
    state: z.enum(targetGoalComparisonStates),
    reason: z.string().max(100).nullable(),
  })
  .strict()
  .superRefine((comparison, ctx) => {
    if (comparison.state === 'UNAVAILABLE' && comparison.reason === null) {
      ctx.addIssue({ code: 'custom', message: 'Unavailable comparisons require a reason.' })
    }
    if (comparison.state !== 'UNAVAILABLE' && comparison.reason !== null) {
      ctx.addIssue({ code: 'custom', message: 'Available comparisons cannot include a reason.' })
    }
  })

export type TargetGoalComparison = z.infer<typeof targetGoalComparisonSchema>

export function normalizeTargetGoal(input: string): string {
  const normalized = normalizeMetricDecimal(input, 'PERCENTAGE')
  if (scaledDecimal(normalized) <= 0n) {
    throw new Error('Project target goal must be greater than 0 and at most 100.')
  }
  return normalized
}

export const targetGoalSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalizeTargetGoal(value)
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a percentage greater than 0 and at most 100, with up to 4 decimal places.',
      })
      return z.NEVER
    }
  })

export function compareProgressToTargetGoal(
  progress: MetricCell,
  targetGoal: string | null,
): TargetGoalComparison {
  if (targetGoal === null) return { state: 'UNAVAILABLE', reason: 'TARGET_GOAL_UNSET' }
  if (progress.value === null) {
    return { state: 'UNAVAILABLE', reason: progress.reason ?? 'PROGRESS_UNAVAILABLE' }
  }
  const progressValue = scaledDecimal(progress.value)
  const targetValue = scaledDecimal(normalizeTargetGoal(targetGoal))
  if (progressValue < targetValue) return { state: 'BELOW_TARGET', reason: null }
  if (progressValue > targetValue) return { state: 'ABOVE_TARGET', reason: null }
  return { state: 'AT_TARGET', reason: null }
}

export function compareActivityProgressToTargetGoal(
  progressPercent: number,
  targetGoal: string | null,
): TargetGoalComparison {
  if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new Error('Activity progress must be an integer percentage from 0 through 100.')
  }
  return compareProgressToTargetGoal(numericMetric(progressPercent.toString()), targetGoal)
}
