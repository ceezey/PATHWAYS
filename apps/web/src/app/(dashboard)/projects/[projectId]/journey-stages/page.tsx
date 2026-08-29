import { RouteOff } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { JourneyStagesWorkspace } from '@/features/beneficiaries/journey-stages-workspace'
import { ProjectWorkspaceHeader } from '@/features/projects/project-workspace-header'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'

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

    if (error instanceof PathwaysClientError && error.code === 'not_configured') {
      return (
        <>
          <PageHeader
            eyebrow="Project workspace"
            title="Journey stages unavailable"
            description="Project journey stages will appear after the Projects backend is connected."
          />
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href="/projects">Back to projects</Link>
              </Button>
            }
            description="Connect the Projects backend to load project and journey-stage records."
            icon={RouteOff}
            title="No journey-stage data"
          />
        </>
      )
    }

    throw error
  }
}
