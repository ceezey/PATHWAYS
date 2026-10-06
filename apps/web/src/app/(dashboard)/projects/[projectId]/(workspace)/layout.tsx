import { ProjectWorkspaceFrame } from '@/features/projects/project-workspace-frame'

// The frame renders once for every tab; each tab page keeps its own route access check.
export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  return <ProjectWorkspaceFrame projectId={projectId}>{children}</ProjectWorkspaceFrame>
}
