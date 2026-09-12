import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

async function ProjectMonitorEvaluatePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="monitor-evaluate" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('monitoring', props)
  return ProjectMonitorEvaluatePage(props as Parameters<typeof ProjectMonitorEvaluatePage>[0])
}
