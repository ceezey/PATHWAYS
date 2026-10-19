import { AlertTriangle, BarChart3, Clock, FolderKanban } from 'lucide-react'

import type { DashboardAction, DashboardSeverity } from '@/types/pathways'
import { businessCalendarDate } from '@pathways/shared'

export const severityTone = (severity?: DashboardSeverity) => {
  if (severity === 'danger') {
    return 'danger'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  if (severity === 'success') {
    return 'success'
  }

  return 'info'
}

export const statusTone = (severity?: DashboardSeverity) =>
  severity === 'neutral' ? 'neutral' : severityTone(severity)

export const metricIcons = [FolderKanban, AlertTriangle, Clock, BarChart3]

export const actionWorkflowHref = (action: DashboardAction) => {
  const actionText = `${action.label} ${action.dialogTitle ?? ''}`.toLowerCase()
  if (actionText.includes('budget')) return '/projects'
  if (actionText.includes('proof')) return '/projects'
  if (
    actionText.includes('recommendation') ||
    actionText.includes('decision') ||
    actionText.includes('outcome')
  )
    return '/alerts'
  if (actionText.includes('alert') || actionText.includes('flag')) return '/alerts'
  if (actionText.includes('orientation') || actionText.includes('activity')) return '/projects'
  return '/projects'
}

export const dashboardActivityTarget = (href?: string) => {
  const match = href?.match(/^\/projects\/([^/]+)\/activities\/([^/?#]+)/)
  if (!match) return null

  const query = href?.split('?')[1] ?? ''
  return {
    projectId: match[1],
    activityId: match[2],
    expenseId: new URLSearchParams(query).get('expense') ?? undefined,
    proofId:
      new URLSearchParams(query).get('review') ??
      new URLSearchParams(query).get('proof') ??
      undefined,
  }
}

export type DashboardActivityTarget = NonNullable<ReturnType<typeof dashboardActivityTarget>>

/** Trailing 12 months (366 calendar days, the API maximum) ending today in Manila business time. */
export const trailingYearPeriod = () => {
  const periodEnd = businessCalendarDate(new Date(), 'Asia/Manila')
  const start = new Date(`${periodEnd}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 365)
  return { periodStart: start.toISOString().slice(0, 10), periodEnd }
}
