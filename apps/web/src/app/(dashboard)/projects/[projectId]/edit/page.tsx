import { ProjectSetupForm } from '@/features/projects/project-setup-form'
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return <ProjectSetupForm projectId={(await params).projectId} />
}
