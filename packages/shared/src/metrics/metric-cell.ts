import { z } from 'zod'
import { decimal } from './metric-fields'
import type { MetricCell } from './metric-math'

export const P06_CONTRACT_VERSION = 'p06.v1' as const
export const metricRecipes = [
  'PARTICIPATION_RECORD_COUNT',
  'DISTINCT_ATTENDING_INDIVIDUALS',
  'ATTENDANCE_RECORDS_PER_INDIVIDUAL',
  'EFFECTIVE_JOURNEY_EVENT_COUNT',
  'FORM_NUMERIC_SUM',
  'FORM_NUMERIC_AVERAGE',
  'ACTIVITY_COMPLETION_PERCENTAGE',
] as const
export type MetricRecipe = (typeof metricRecipes)[number]
export const metricCellSchema = z
  .object({
    state: z.enum(['AVAILABLE', 'ZERO', 'MISSING', 'NOT_APPLICABLE', 'SUPPRESSED']),
    value: decimal.nullable(),
    reason: z.string().max(100).nullable(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    const visible = cell.state === 'AVAILABLE' || cell.state === 'ZERO'
    if (visible !== (cell.value !== null) || (visible && cell.reason !== null)) {
      ctx.addIssue({ code: 'custom', message: 'Unavailable metrics must not contain a value.' })
    }
    if (cell.state === 'ZERO' && cell.value !== '0')
      ctx.addIssue({ code: 'custom', message: 'ZERO requires an exact zero.' })
    if (cell.state === 'AVAILABLE' && cell.value !== null && Number(cell.value) === 0) {
      ctx.addIssue({ code: 'custom', message: 'An exact zero requires ZERO state.' })
    }
  })
export function formatMetricCell(cell: MetricCell): string {
  if (cell.value !== null) return cell.value
  return cell.state === 'SUPPRESSED'
    ? 'Suppressed'
    : cell.state === 'NOT_APPLICABLE'
      ? 'Not applicable'
      : 'Not available'
}
