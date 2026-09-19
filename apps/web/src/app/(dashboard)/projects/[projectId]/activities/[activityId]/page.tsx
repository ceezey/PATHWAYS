import { ActivityDetailPage } from '@/features/projects/activity-detail-page'

export default async function ProjectActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ activityId: string; projectId: string }>
  searchParams: Promise<{ proof?: string; review?: string }>
}) {
  const { activityId, projectId } = await params
  const { proof, review } = await searchParams

  return (
    <ActivityDetailPage activityId={activityId} proofId={review ?? proof} projectId={projectId} />
  )
}
