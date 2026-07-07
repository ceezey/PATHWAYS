import { notFound } from 'next/navigation'

import { PublicProjectDetail } from '@/features/public/public-project-components'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

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
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      notFound()
    }

    throw error
  }
}
