'use client'

import { RouteOff } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'

import { AsyncState } from '@/components/pathways/async-state'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import { journeysClient } from '@/lib/api/journeys'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { JourneyStageConfig, ProjectDetail } from '@/types/pathways'

import { JourneyConfigWorkspace } from '@/features/beneficiaries/journey/components/journey-config-workspace'
import { useProjectActivitiesRead, useProjectRead } from '@/features/projects'

export const JourneyStagesLoader = ({ projectId }: { projectId: string }) => {
  const { profile } = useCurrentRole()
  const contextOnly = principalHasAtomicPermission(profile, 'activities.context.read')
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const projectRead = useProjectRead(projectId)
  // The editor copies its stages once, so it always starts from a live read, never the 30 s cache.
  const stagesPermission = principalHasAtomicPermission(profile, 'journeys.read')
    ? 'journeys.read'
    : 'journeys.manage'
  const stagesRead = useAuthorizedRead(
    'journey-stages-editor',
    projectId,
    stagesPermission,
    (signal) => journeysClient.getJourneyStages(projectId, signal),
  )
  // Mapping choices are secondary: the stage list shows as soon as the project and stages resolve.
  const contextRead = useAuthorizedRead(
    'activity-context',
    projectId,
    'activities.context.read',
    (signal) => activitiesClient.getActivityContext(projectId, signal),
    contextOnly,
  )
  const listRead = useProjectActivitiesRead(projectId, canReadActivities && !contextOnly)
  const activityRead = contextOnly ? contextRead : listRead
  const activitiesLoading = (contextOnly || canReadActivities) && activityRead.isPending

  // Once the editor has its first project and stages it stays mounted, so a later failed
  // refresh or re-verification never discards unsaved stage edits.
  const held = useRef<{ projectId: string; project: ProjectDetail; stages: JourneyStageConfig[] }>(
    null,
  )
  if (held.current && held.current.projectId !== projectId) held.current = null
  if (!held.current && projectRead.data && stagesRead.data)
    held.current = { projectId, project: projectRead.data, stages: stagesRead.data }
  const failure = projectRead.error ?? stagesRead.error
  if (held.current) {
    return (
      <>
        {failure ? (
          <p className="mb-3 text-sm text-destructive" role="alert">
            Project data could not be refreshed. Your unsaved changes are kept.
          </p>
        ) : null}
        <JourneyConfigWorkspace
          project={held.current.project}
          activities={activityRead.data ?? []}
          activitiesLoading={activitiesLoading}
          activitiesFailed={activityRead.isError}
          onRetryActivities={() => void activityRead.refetch()}
          initialStages={held.current.stages}
        />
      </>
    )
  }
  // Without either journey permission the stage read never runs, so it must not read as loading.
  const unavailable = !principalHasAtomicPermission(profile, stagesPermission)
  if (failure || unavailable || (!projectRead.isPending && !projectRead.data)) {
    return (
      <EmptyState
        icon={RouteOff}
        title="Journey stages unavailable"
        description={
          failure instanceof PathwaysClientError
            ? failure.message
            : 'The project journey configuration is unavailable.'
        }
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />
    )
  }
  return (
    <AsyncState
      status="loading"
      title="Loading journey stages"
      description="Loading persisted project journey configuration."
    />
  )
}
