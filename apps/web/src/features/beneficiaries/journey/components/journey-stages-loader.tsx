'use client'

import { RouteOff } from 'lucide-react'
import Link from 'next/link'

import { AsyncState } from '@/components/pathways/async-state'
import { EmptyState } from '@/components/pathways/empty-state'
import { Button } from '@/components/ui/button'
import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { useCurrentRole } from '@/hooks/use-current-role'
import { activitiesClient } from '@/lib/api/activities'
import { PathwaysClientError } from '@/lib/api/core/request'
import { journeysClient } from '@/lib/api/journeys'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'

import { JourneyConfigWorkspace } from '@/features/beneficiaries/journey/components/journey-config-workspace'
import {
  useInvalidateJourneyStagesRead,
  useProjectActivitiesRead,
  useProjectRead,
} from '@/features/projects'

export const JourneyStagesLoader = ({ projectId }: { projectId: string }) => {
  const { profile } = useCurrentRole()
  const contextOnly = principalHasAtomicPermission(profile, 'activities.context.read')
  const canReadActivities = principalHasAtomicPermission(profile, 'activities.read')
  const invalidateStages = useInvalidateJourneyStagesRead()
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

  const failure = projectRead.error ?? stagesRead.error
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
  if (!projectRead.data || !stagesRead.data) {
    return (
      <AsyncState
        status="loading"
        title="Loading journey stages"
        description="Loading persisted project journey configuration."
      />
    )
  }
  return (
    <JourneyConfigWorkspace
      project={projectRead.data}
      activities={activityRead.data ?? []}
      activitiesLoading={activitiesLoading}
      activitiesFailed={activityRead.isError}
      onRetryActivities={() => void activityRead.refetch()}
      initialStages={stagesRead.data}
      onSaved={() => void invalidateStages(projectId)}
    />
  )
}
