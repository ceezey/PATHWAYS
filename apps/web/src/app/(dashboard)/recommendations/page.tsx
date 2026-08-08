import { RecommendationsWorkspace } from '@/features/analytics/recommendations-workspace'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>
}) {
  const { recommendation } = await searchParams
  const [recommendations, alerts, projects, rules] = await Promise.all([
    pathwaysClient.getRecommendations(),
    pathwaysClient.getAlerts(),
    pathwaysClient.getProjects(),
    pathwaysClient.getRules(),
  ])

  return (
    <RecommendationsWorkspace
      alerts={alerts}
      initialRecommendationId={recommendation}
      initialRecommendations={recommendations}
      projects={projects}
      rules={rules}
    />
  )
}
