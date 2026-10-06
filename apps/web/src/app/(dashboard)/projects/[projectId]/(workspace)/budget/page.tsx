import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectPhaseFiveWorkspace } from '@/features/projects/project-review-workspace'

async function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectPhaseFiveWorkspace projectId={projectId} view="budget" />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('budget', props)
  return ProjectBudgetPage(props as Parameters<typeof ProjectBudgetPage>[0])
}
