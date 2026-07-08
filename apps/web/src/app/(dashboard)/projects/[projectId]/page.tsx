import { ProjectDetailView } from '@/features/projects/project-detail-view'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectDetailView projectId={projectId} />
}
