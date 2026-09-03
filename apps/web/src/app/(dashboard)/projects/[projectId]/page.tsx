import type { Metadata } from 'next'

import { ProjectDetailView } from '@/features/projects/project-detail-view'

export const metadata: Metadata = { title: 'Project Workspace' }

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectDetailView projectId={projectId} />
}
