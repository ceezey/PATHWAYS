import type { Metadata } from 'next'

import { PublicProjectsList } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'

export const metadata: Metadata = { title: 'Public Project Directory' }

export default async function PublicProjectsPage() {
  const projects = await pathwaysClient.getPublicProjects()

  return <PublicProjectsList projects={projects} />
}
