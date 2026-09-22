import type { Metadata } from 'next'

import { PublicProjectsList } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export const metadata: Metadata = { title: 'Public Project Directory' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectsPage() {
  try {
    const projects = await pathwaysClient.getPublicProjects()
    return <PublicProjectsList projects={projects} />
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_configured') {
      return <PublicProjectsList projects={[]} unavailable />
    }
    throw error
  }
}
