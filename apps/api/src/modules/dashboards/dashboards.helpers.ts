import { BadRequestException } from '@nestjs/common'
import {
  type DashboardQuery,
  type MetricCell,
  type SadddQuery,
  dashboardQuerySchema,
  sadddQuerySchema,
} from '@pathways/shared'

export function parseSadddQuery(value: unknown): SadddQuery {
  const parsed = sadddQuerySchema.safeParse(value)

  if (!parsed.success) {
    throw new BadRequestException(
      'SADDD requires exactly one authorized project and does not accept custom periods or demographic cross-filters.',
    )
  }

  return parsed.data
}

export function parseDashboardQuery(value: unknown): DashboardQuery {
  const parsed = dashboardQuerySchema.safeParse(value)
  if (!parsed.success)
    throw new BadRequestException(
      'Invalid monitoring query. Use one project/program selector and both bounded calendar dates; other filters are not enabled.',
    )
  return parsed.data
}

/** Locked SADDD RFC G4 threshold: 1-4 is suppressed; 0 and 5 or more stay visible. */
const SMALL_CELL_THRESHOLD = 5

export function suppressSmallCount(metric: MetricCell): MetricCell {
  if (metric.state !== 'AVAILABLE' || metric.value === null) return metric
  const value = Number(metric.value)
  return value > 0 && value < SMALL_CELL_THRESHOLD
    ? { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    : metric
}
