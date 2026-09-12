import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { RecommendationsWorkspace } from '@/features/analytics/recommendations-workspace'

async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>
}) {
  const { recommendation } = await searchParams

  return <RecommendationsWorkspace initialRecommendationId={recommendation} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('recommendations', props)
  return RecommendationsPage(props as Parameters<typeof RecommendationsPage>[0])
}
