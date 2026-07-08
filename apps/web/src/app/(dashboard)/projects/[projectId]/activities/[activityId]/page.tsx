import { ActivityDetailPage } from '@/features/projects/activity-detail-page'

export default async function ProjectActivityDetailPage({
  params,
}: {
  params: Promise<{ activityId: string; projectId: string }>
}) {
  const { activityId, projectId } = await params

  return <ActivityDetailPage activityId={activityId} projectId={projectId} />
}
