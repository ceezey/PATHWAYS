import { z } from 'zod'
import { isCalendarDate } from './metric-math'

export const DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION = 'dashboard.action-counts.v1' as const

const count = z.number().int().min(0)

/** Dashboard KPI counts; a `null` field means the viewer lacks the source permission. */
export const dashboardActionCountsSchema = z
  .object({
    contractVersion: z.literal(DASHBOARD_ACTION_COUNTS_CONTRACT_VERSION),
    businessDate: z.string().refine(isCalendarDate),
    pendingApprovals: count.nullable(),
    activeAlerts: z.object({ count, capped: z.boolean() }).strict().nullable(),
    overdueActivities: z
      .object({
        count,
        mostOverdue: z
          .object({ code: z.string().max(64), daysLate: z.number().int().min(1) })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    forReview: count.nullable(),
  })
  .strict()

export type DashboardActionCounts = z.infer<typeof dashboardActionCountsSchema>
