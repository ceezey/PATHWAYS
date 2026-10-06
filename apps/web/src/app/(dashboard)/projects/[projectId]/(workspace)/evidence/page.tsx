import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

async function ProjectEvidencePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="evidence" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('evidence', props)
  return ProjectEvidencePage(props as Parameters<typeof ProjectEvidencePage>[0])
}
