import { z } from 'zod'
import { metricCellSchema } from '../../metrics/metric-cell'
import { date, uuid } from '../../metrics/metric-fields'
import { type MetricCell, missingMetric, numericMetric } from '../../metrics/metric-math'
import { round1 } from '../../metrics/metric-round'

export const TIMELINE_ANALYTICS_CONTRACT_VERSION = 'analytics.descriptive.timeline.v1' as const

export const timelineAnalyticsSchema = z
  .object({
    contractVersion: z.literal(TIMELINE_ANALYTICS_CONTRACT_VERSION),
    projectId: uuid,
    generatedAt: z.string().datetime({ offset: true }),
    reportingDate: date,
    elapsedPercent: metricCellSchema,
    remainingDays: metricCellSchema,
    overdueDays: metricCellSchema,
    activityCompletionPercent: metricCellSchema,
    activityOverdueCount: metricCellSchema,
    milestoneOnTimePercent: metricCellSchema,
  })
  .strict()
export type TimelineAnalytics = z.infer<typeof timelineAnalyticsSchema>

export type TimelineMilestoneRow = {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  targetDate: string | null
  completionDate: string | null
}

/**
 * Milestone counts behind the on-time metric, as returned by the trusted
 * pathways.p10_f9_timeline_aggregate function: completed milestones, completed
 * milestones that carry both a target and a completion date (rated), and rated
 * ones finished on or before their target.
 */
export const milestoneCountsSchema = z
  .object({
    completed: z.number().int().min(0),
    rated: z.number().int().min(0),
    onTime: z.number().int().min(0),
  })
  .strict()
  .refine((counts) => counts.onTime <= counts.rated && counts.rated <= counts.completed, {
    message: 'Milestone counts must satisfy onTime <= rated <= completed.',
  })
export type MilestoneCounts = z.infer<typeof milestoneCountsSchema>

/**
 * Milestone on-time percent = completed milestones with completion_date <= target_date,
 * divided by completed milestones that have both dates. Cancelled milestones are
 * excluded. MISSING (NO_COMPLETED_MILESTONES) when there is nothing to rate, never 0.
 */
export function milestoneOnTimeFromCounts(counts: MilestoneCounts): MetricCell {
  if (counts.completed === 0 || counts.rated === 0) return missingMetric('NO_COMPLETED_MILESTONES')
  return numericMetric(round1((counts.onTime / counts.rated) * 100))
}

/** Test/parity adapter: folds milestone rows into the counts the trusted SQL function returns. */
export function milestoneCountsFromRows(
  milestones: readonly TimelineMilestoneRow[],
): MilestoneCounts {
  const completed = milestones.filter((milestone) => milestone.status === 'COMPLETED')
  const rated = completed.filter(
    (milestone) => milestone.targetDate !== null && milestone.completionDate !== null,
  )
  return {
    completed: completed.length,
    rated: rated.length,
    onTime: rated.filter(
      (milestone) => (milestone.completionDate as string) <= (milestone.targetDate as string),
    ).length,
  }
}

export function milestoneOnTimeCell(milestones: readonly TimelineMilestoneRow[]): MetricCell {
  return milestoneOnTimeFromCounts(milestoneCountsFromRows(milestones))
}
