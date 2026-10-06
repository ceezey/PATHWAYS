import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectIndicatorsWorkspace } from '@/features/projects/project-indicators-workspace'

async function ProjectIndicatorsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectIndicatorsWorkspace projectId={projectId} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('indicators', props)
  return ProjectIndicatorsPage(props as Parameters<typeof ProjectIndicatorsPage>[0])
}
