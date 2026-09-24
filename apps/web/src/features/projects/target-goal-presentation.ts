import type { TargetGoalComparison } from '@pathways/shared'

export function describeTargetGoalComparison(comparison: TargetGoalComparison): string {
  if (comparison.state === 'BELOW_TARGET') return 'Below project target'
  if (comparison.state === 'AT_TARGET') return 'At project target'
  if (comparison.state === 'ABOVE_TARGET') return 'Above project target'
  if (comparison.reason === 'TARGET_GOAL_UNSET') return 'Project target not set'

  return `Project target comparison unavailable (${comparison.reason ?? 'unknown reason'})`
}
