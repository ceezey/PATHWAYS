import { RecommendationsWorkspace } from '@/features/analytics/recommendations-workspace'

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>
}) {
  const { recommendation } = await searchParams

  return <RecommendationsWorkspace initialRecommendationId={recommendation} />
}
