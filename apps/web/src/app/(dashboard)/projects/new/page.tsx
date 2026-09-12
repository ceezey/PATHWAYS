import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

import { ProjectSetupForm } from '@/features/projects/project-setup-form'

function NewProjectPage() {
  return <ProjectSetupForm />
}

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projectCreate', props)
  return NewProjectPage()
}
