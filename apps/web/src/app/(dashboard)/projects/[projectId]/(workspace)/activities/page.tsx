import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectActivitiesWorkspace } from '@/features/projects/project-activities-workspace'

async function ProjectActivitiesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectActivitiesWorkspace projectId={projectId} />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('activities', props)
  return ProjectActivitiesPage(props as Parameters<typeof ProjectActivitiesPage>[0])
}
