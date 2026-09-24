import { ProjectSetupForm } from '@/features/projects/project-setup-form'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projectEdit', props)
  return <ProjectSetupForm projectId={(await props.params)?.projectId ?? ''} />
}
