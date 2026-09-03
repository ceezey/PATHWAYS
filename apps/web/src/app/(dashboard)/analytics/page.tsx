import type { Metadata } from 'next'

import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export const metadata: Metadata = { title: 'Analytics Workspace' }

export default async function AnalyticsPage() {
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
}
