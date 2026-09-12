import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectDirectory } from '@/features/projects/project-directory'

function ProjectsPage() {
  return <ProjectDirectory />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projects', props)
  return ProjectsPage()
}
