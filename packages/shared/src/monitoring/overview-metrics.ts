import { z } from 'zod'
import { metricCellSchema } from './metric-contract'
import {
  type MetricCell,
  isCalendarDate,
  missingMetric,
  numericMetric,
  scaledDecimal,
} from './metric-math'

export const PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION = 'project.overview-metrics.v1' as const

const date = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())

/**
 * Project Overview tiles. A `null` section means the viewer lacks the source permission;
 * a MISSING metric means the source has no data yet. Neither is ever reported as zero.
 */
export const projectOverviewMetricsSchema = z
  .object({
    contractVersion: z.literal(PROJECT_OVERVIEW_METRICS_CONTRACT_VERSION),
    projectId: uuid,
    businessDate: date,
    generatedAt: z.string().datetime({ offset: true }),
    kpiAchievement: z
      .object({
        metric: metricCellSchema,
        indicatorCount: z.number().int().min(0).max(100),
        reportedCount: z.number().int().min(0).max(100),
      })
      .strict()
      .nullable(),
    budgetUtilization: z.object({ metric: metricCellSchema }).strict().nullable(),
    beneficiariesReached: z
      .object({
        metric: metricCellSchema,
        target: z.number().int().min(0).nullable(),
      })
      .strict()
      .nullable(),
    timeline: z
      .object({
        metric: metricCellSchema,
        startDate: date.nullable(),
        endDate: date.nullable(),
      })
      .strict(),
  })
  .strict()
export type ProjectOverviewMetrics = z.infer<typeof projectOverviewMetricsSchema>

/** Integer division rounded once, half away from zero. */
function roundedQuotient(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const value = n / d + ((n % d) * 2n >= d ? 1n : 0n)
  return negative ? -value : value
}

function tenthsString(tenths: bigint): string {
  const negative = tenths < 0n
  const absolute = negative ? -tenths : tenths
  const fraction = absolute % 10n
  const text = `${absolute / 10n}${fraction === 0n ? '' : `.${fraction}`}`
  return negative && text !== '0' ? `-${text}` : text
}

/**
 * `numerator / denominator * 100`, rounded once to one decimal place, half away from zero.
 * The result is not clamped: overspending or overachievement stays visible.
 */
export function overviewPercent(numerator: bigint, denominator: bigint): MetricCell {
  if (denominator === 0n)
    return { state: 'NOT_APPLICABLE', value: null, reason: 'ZERO_DENOMINATOR' }
  try {
    return numericMetric(tenthsString(roundedQuotient(numerator * 1000n, denominator)))
  } catch {
    return missingMetric('OUT_OF_RANGE')
  }
}

/**
 * KPI achievement: the mean of each reported indicator's baseline-to-target progress
 * (`indicatorProgress`), rounded once to one decimal place. Indicators without a visible
 * progress value are counted but never treated as zero.
 */
export function kpiAchievement(progress: readonly MetricCell[]) {
  const visible = progress.filter(
    (cell) => (cell.state === 'AVAILABLE' || cell.state === 'ZERO') && cell.value !== null,
  )
  const indicatorCount = progress.length
  const reportedCount = visible.length
  if (indicatorCount === 0)
    return { metric: missingMetric('NO_INDICATORS'), indicatorCount, reportedCount }
  if (reportedCount === 0)
    return { metric: missingMetric('NO_MEASUREMENT'), indicatorCount, reportedCount }
  const sum = visible.reduce((total, cell) => total + scaledDecimal(cell.value as string), 0n)
  // Values are scaled by 10^4; one decimal place needs a further 10^3 reduction.
  let metric: MetricCell
  try {
    metric = numericMetric(tenthsString(roundedQuotient(sum, BigInt(reportedCount) * 1000n)))
  } catch {
    metric = missingMetric('OUT_OF_RANGE')
  }
  return { metric, indicatorCount, reportedCount }
}

/** Parses a non-negative money amount with at most two decimals into cents. */
export function moneyCents(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(value)) throw new Error('Invalid money amount.')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

/** Approved spending over the planned project budget. */
export function budgetUtilization(plannedBudget: string | null, approvedSpending: string) {
  if (plannedBudget === null) return missingMetric('NO_PLANNED_BUDGET')
  return overviewPercent(moneyCents(approvedSpending), moneyCents(plannedBudget))
}

const day = 86_400_000
const dayNumber = (value: string) => Date.parse(`${value}T00:00:00.000Z`) / day

/**
 * Elapsed share of the inclusive project calendar on the business date, clamped to
 * 0-100 because time outside the project window is not progress.
 */
export function timelineProgress(
  startDate: string | null,
  endDate: string | null,
  businessDate: string,
): MetricCell {
  if (!startDate || !endDate || !isCalendarDate(startDate) || !isCalendarDate(endDate))
    return missingMetric('PROJECT_DATES_REQUIRED')
  if (endDate < startDate) return missingMetric('PROJECT_DATES_INVALID')
  const total = dayNumber(endDate) - dayNumber(startDate) + 1
  const elapsed = Math.min(Math.max(dayNumber(businessDate) - dayNumber(startDate) + 1, 0), total)
  return overviewPercent(BigInt(elapsed), BigInt(total))
}
