import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  PublicProjectDetail,
  PublicProjectsList,
} from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export const metadata: Metadata = { title: 'Public Project Story' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  try {
    const project = await pathwaysClient.getPublicProject(projectId)

    return <PublicProjectDetail project={project} />
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_configured') {
      return <PublicProjectsList projects={[]} unavailable />
    }
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      notFound()
    }

    throw error
  }
}
