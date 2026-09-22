import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ActivityDetailPage } from '@/features/projects/activity-detail-page'

async function ProjectActivityDetailPage({
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

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('activity', props)
  return ProjectActivityDetailPage(props as Parameters<typeof ProjectActivityDetailPage>[0])
}
