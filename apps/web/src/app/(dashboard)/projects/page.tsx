import type { Metadata } from 'next'

import { ProjectDirectory } from '@/features/projects/project-directory'
import { type ProtectedPageProps, requireServerPage } from '@/lib/rbac/server-access'

export const metadata: Metadata = { title: 'Project Directory' }
export const dynamic = 'force-dynamic'

export default async function ProtectedPage(props: ProtectedPageProps) {
  await requireServerPage('projects', props)
  return <ProjectDirectory />
}
