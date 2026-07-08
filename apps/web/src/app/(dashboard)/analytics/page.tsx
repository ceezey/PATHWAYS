import { AnalyticsDashboard } from '@/features/analytics/analytics-dashboard'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function AnalyticsPage() {
  const projectSummaries = await pathwaysClient.getProjects()
  const [projects, budgets, beneficiaries, alerts] = await Promise.all([
    Promise.all(projectSummaries.map((project) => pathwaysClient.getProject(project.id))),
    pathwaysClient.getBudgets(),
    pathwaysClient.getBeneficiaryRecords(),
    pathwaysClient.getAlerts(),
  ])
  const activityGroups = await Promise.all(
    projects.map((project) => pathwaysClient.getActivities(project.id)),
  )

  return (
    <AnalyticsDashboard
      activities={activityGroups.flat()}
      alerts={alerts}
      beneficiaries={beneficiaries}
      budgets={budgets}
      projects={projects}
    />
  )
}
