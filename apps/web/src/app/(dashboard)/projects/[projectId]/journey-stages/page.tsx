import { notFound } from 'next/navigation'

import { JourneyStagesWorkspace } from '@/features/beneficiaries/journey-stages-workspace'
import { ProjectWorkspaceHeader } from '@/features/projects/project-workspace-header'
import { pathwaysClient } from '@/lib/services/mock-pathways-client'
import { PathwaysClientError } from '@/lib/services/pathways-client'

export default async function ProjectJourneyStagesPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  try {
    const [project, activities, stages] = await Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getJourneyStages(projectId),
    ])

    return (
      <div className="space-y-6">
        <ProjectWorkspaceHeader project={project} />
        <JourneyStagesWorkspace activities={activities} initialStages={stages} project={project} />
      </div>
    )
  } catch (error) {
    if (error instanceof PathwaysClientError && error.code === 'not_found') {
      notFound()
    }

    throw error
  }
}
