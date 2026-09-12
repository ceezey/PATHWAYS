import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ActivityDetailPage } from '@/features/projects/activity-detail-page'

async function ProjectActivityDetailPage({
  params,
}: {
  params: Promise<{ activityId: string; projectId: string }>
}) {
  const { activityId, projectId } = await params

  return <ActivityDetailPage activityId={activityId} projectId={projectId} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('activity', props)
  return ProjectActivityDetailPage(props as Parameters<typeof ProjectActivityDetailPage>[0])
}
