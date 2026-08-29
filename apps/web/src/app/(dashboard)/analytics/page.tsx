import { BarChart3 } from 'lucide-react'

import { EmptyState } from '@/components/pathways/empty-state'
import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'
import { pathwaysClient } from '@/lib/services/pathways-client'

export default async function AnalyticsPage() {
  try {
    const projectSummaries = await pathwaysClient.getProjects()
    const [projects, budgets, alerts, locations] = await Promise.all([
      Promise.all(projectSummaries.map((project) => pathwaysClient.getProject(project.id))),
      pathwaysClient.getBudgets(),
      pathwaysClient.getAlerts(),
      pathwaysClient.getAnalyticsLocations(),
    ])
    const activityGroups = await Promise.all(
      projects.map((project) => pathwaysClient.getActivities(project.id)),
    )

    return (
      <AnalyticsDashboard
        activities={activityGroups.flat()}
        alerts={alerts}
        budgets={budgets}
        locations={locations}
        projects={projects}
      />
    )
  } catch {
    return (
      <EmptyState
        className="min-h-80 rounded-lg border border-border bg-card"
        description="Analytics could not be loaded. The analytics backend may not be configured yet."
        icon={BarChart3}
        title="Analytics unavailable"
      />
    )
  }
}
