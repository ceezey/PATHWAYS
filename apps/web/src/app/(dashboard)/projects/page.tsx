import type { Metadata } from 'next'

import { ProjectDirectory } from '@/features/projects/project-directory'

export const metadata: Metadata = { title: 'Project Directory' }

export default function ProjectsPage() {
  return <ProjectDirectory />
}
