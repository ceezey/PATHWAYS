import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

async function ProjectIndicatorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="indicators" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('indicators', props)
  return ProjectIndicatorsPage(props as Parameters<typeof ProjectIndicatorsPage>[0])
}
