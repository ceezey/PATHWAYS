'use client'

import { Loader2, RouteOff } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { PathwaysClientError, pathwaysClient } from '@/lib/services/pathways-client'
import type { Activity, JourneyStageConfig, ProjectDetail } from '@/types/pathways'

import { JourneyStagesWorkspace } from './journey-stages-workspace'

export const JourneyStagesLoader = ({ projectId }: { projectId: string }) => {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [stages, setStages] = useState<JourneyStageConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      pathwaysClient.getProject(projectId),
      pathwaysClient.getActivities(projectId),
      pathwaysClient.getJourneyStages(projectId),
    ])
      .then(([projectRecord, activityRecords, stageRecords]) => {
        if (!active) return
        setProject(projectRecord)
        setActivities(activityRecords)
        setStages(stageRecords)
      })
      .catch((caught) => {
        if (!active) return
        setError(
          caught instanceof PathwaysClientError
            ? caught.message
            : 'Journey-stage configuration could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (loading) {
    return (
      <EmptyState
        icon={Loader2}
        title="Loading journey stages"
        description="Loading persisted project journey configuration."
      />
    )
  }
  if (error || !project) {
    return (
      <EmptyState
        icon={RouteOff}
        title="Journey stages unavailable"
        description={error || 'The project journey configuration is unavailable.'}
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />
    )
  }
  return <JourneyStagesWorkspace project={project} activities={activities} initialStages={stages} />
}
