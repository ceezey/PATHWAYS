import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

export default async function ProjectMonitorEvaluatePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="monitor-evaluate" />
}
