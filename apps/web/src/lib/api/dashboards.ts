import {
  type DashboardActionCounts,
  type DashboardQuery,
  type MonitoringDashboard,
  type RoleOverview,
  type SadddDashboard,
  type SadddQuery,
  dashboardActionCountsSchema,
  dashboardQuerySchema,
  monitoringDashboardSchema,
  roleOverviewSchema,
  sadddDashboardSchema,
  sadddQuerySchema,
} from '@pathways/shared'

import { requestFoundation } from '@/lib/api/core/request'

/** Fixed filter allowlist; no role, organization, demographic, formula or field selectors. */
function monitoringQuery(input: DashboardQuery): string {
  const query = dashboardQuerySchema.parse(input)
  const search = new URLSearchParams()

  const allowedKeys = ['projectId', 'programId', 'periodStart', 'periodEnd'] as const

  for (const key of allowedKeys) {
    const value = query[key]

    if (typeof value === 'string') {
      search.set(key, value)
    }
  }

  return search.size ? `?${search.toString()}` : ''
}

export const dashboardsClient = {
  async getDashboardActionCounts(): Promise<DashboardActionCounts> {
    return dashboardActionCountsSchema.parse(await requestFoundation('/dashboards/action-counts'))
  },

  async getRoleOverview(): Promise<RoleOverview> {
    return roleOverviewSchema.parse(await requestFoundation('/dashboards/role-overview'))
  },

  async getMonitoringDashboard(query: DashboardQuery = {}): Promise<MonitoringDashboard> {
    return monitoringDashboardSchema.parse(
      await requestFoundation(`/dashboards/monitoring${monitoringQuery(query)}`),
    )
  },

  async getSadddDashboard(query: SadddQuery): Promise<SadddDashboard> {
    const { projectId } = sadddQuerySchema.parse(query)
    return sadddDashboardSchema.parse(
      await requestFoundation(`/dashboards/saddd?projectId=${encodeURIComponent(projectId)}`),
    )
  },
}
