import { ProjectActivitiesWorkspace } from '@/features/projects/project-activities-workspace'

export default async function ProjectActivitiesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectActivitiesWorkspace projectId={projectId} />
}
