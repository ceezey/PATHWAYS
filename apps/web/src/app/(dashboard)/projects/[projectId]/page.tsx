import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectDetailView } from '@/features/projects/project-detail-view'

async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectDetailView projectId={projectId} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('project', props)
  return ProjectDetailPage(props as Parameters<typeof ProjectDetailPage>[0])
}
