import { RecommendationsWorkspace } from '@/features/analytics/recommendations-workspace'
import { uuidSchema } from '@/features/analytics/rules-validation'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  // The record ID is a display selection, never an organization, assignment or
  // permission assertion. Existing workspace permission is freshly verified;
  // canonical getRecommendation subsequently checks the selected record scope.
  await requireServerPage('recommendations', { searchParams: props.searchParams })
  const id = uuidSchema.safeParse((await props.params)?.recommendationId)
  if (!id.success) notFound()
  return <RecommendationsWorkspace initialRecommendationId={id.data.toLowerCase()} />
}
