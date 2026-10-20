import { rulesHumanClient } from '@/lib/api/rules'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { canReadInsight } from './hooks/use-analytics-insights'

const OPEN_ALERT_STATUSES = ['NEW', 'REVIEWED', 'ACTIONED'] as const
const OPEN_ALERT_MAX_PAGES = 10

/**
 * Counts open alerts with the server status filter, following cursors per status. It stops
 * after OPEN_ALERT_MAX_PAGES pages of a status and reports `capped` so the UI shows "N+".
 */
export const countOpenAlerts = async (projectId: string, signal?: AbortSignal) => {
  let count = 0
  let capped = false
  for (const status of OPEN_ALERT_STATUSES) {
    let cursor: string | undefined
    for (let page = 0; ; page += 1) {
      const result = await rulesHumanClient.listAlerts(
        { projectId, status, limit: '100', ...(cursor ? { cursor } : {}) },
        signal,
      )
      count += result.items.length
      if (!result.nextCursor) break
      if (page + 1 >= OPEN_ALERT_MAX_PAGES) {
        capped = true
        break
      }
      cursor = result.nextCursor
    }
  }
  return { count, capped }
}

export type OpenAlertCount = Awaited<ReturnType<typeof countOpenAlerts>>

type Principal = Parameters<typeof principalHasAtomicPermission>[0]

/** The grants of the role that decide which analytics panels and reads the dashboard shows. */
export const analyticsAccess = (profile: Principal) => {
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const canReadIndicators = principalHasAtomicPermission(profile, 'monitoring.read')
  // Definitions need indicators.read; other monitoring roles read released values for periods and KPIs.
  const canReadIndicatorDefinitions =
    canReadIndicators && principalHasAtomicPermission(profile, 'indicators.read')
  const canReadIndicatorValues =
    canReadIndicators && principalHasAtomicPermission(profile, 'reports.indicator.read')
  const canReadDescriptive = principalHasAtomicPermission(profile, 'analytics.descriptive.read')
  // Survey and timeline read person-derived aggregates, so the API requires both permissions
  // (analytics.descriptive.read and monitoring.read). Anything less is restricted, never "None yet".
  const canReadSurveyTimeline = canReadDescriptive && canReadIndicators
  const canReadSurvey = canReadSurveyTimeline
  // Roles without assessments.detail.read (Program/Grant Manager) get a frozen release of closed periods only.
  const surveyFrozenOnly = !principalHasAtomicPermission(profile, 'assessments.detail.read')
  const canExportAnalytics =
    canReadDescriptive && principalHasAtomicPermission(profile, 'analytics.export')
  const canReadBudgetUtilization = canReadInsight(profile, 'budget')
  const canReadTrends = canReadInsight(profile, 'trends')
  const canReadParticipation = canReadInsight(profile, 'participation')
  const canReadAlerts = principalHasAtomicPermission(profile, 'alerts.read')
  // Roles without the SADDD release grant (Project Officers) get no SADDD card or request.
  const canReadSaddd = principalHasAtomicPermission(profile, 'analytics.saddd.read')
  return {
    canExportAnalytics,
    canReadActivities,
    canReadAlerts,
    canReadBudgetUtilization,
    canReadDescriptive,
    canReadIndicatorDefinitions,
    canReadIndicatorValues,
    canReadIndicators,
    canReadParticipation,
    canReadSaddd,
    canReadSurvey,
    canReadSurveyTimeline,
    canReadTrends,
    surveyFrozenOnly,
  }
}
