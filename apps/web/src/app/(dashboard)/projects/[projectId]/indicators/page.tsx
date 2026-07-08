import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-phase-five-workspace'

export default async function ProjectIndicatorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="indicators" />
}
