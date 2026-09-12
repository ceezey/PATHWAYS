import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

async function ProjectTransparencyPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="transparency" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('transparency', props)
  return ProjectTransparencyPage(props as Parameters<typeof ProjectTransparencyPage>[0])
}
