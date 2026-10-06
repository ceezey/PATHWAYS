import type { Metadata } from 'next'

import { ProjectDetailView } from '@/features/projects/project-detail-view'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Project Overview' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('project', props)
  const projectId = (await props.params)?.projectId ?? ''

  return <ProjectDetailView projectId={projectId} />
}
