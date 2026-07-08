import { AlertsWorkspace } from '@/features/analytics/alerts-workspace'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function AlertsPage() {
  const [alerts, projects, recommendations, rules] = await Promise.all([
    pathwaysClient.getAlerts(),
    pathwaysClient.getProjects(),
    pathwaysClient.getRecommendations(),
    pathwaysClient.getRules(),
  ])

  return (
    <AlertsWorkspace
      initialAlerts={alerts}
      projects={projects}
      recommendations={recommendations}
      rules={rules}
    />
  )
}
