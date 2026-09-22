import type { Metadata } from 'next'

import { PublicHomeDashboard } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export const metadata: Metadata = { title: 'Public Impact Overview' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  try {
    const projects = await pathwaysClient.getPublicProjects()
    return <PublicHomeDashboard projects={projects} />
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_configured') {
      return <PublicHomeDashboard projects={[]} unavailable />
    }
    throw error
  }
}
