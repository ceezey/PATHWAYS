'use client'

import { type AuthorizedReadSpec, useAuthorizedRead } from '@/hooks/use-authorized-read'
import { activitiesClient } from '@/lib/api/activities'

const summary = { freshness: 'summary' } as const

/** Stable resource keys, so the Activities tab and the budget module share one list read. */
const activityReadResources = {
  list: 'project-activities',
  detail: (activityId: string) => `activity-detail:${activityId}`,
  assignableOfficers: 'activity-assignable-officers',
} as const

export const projectActivitiesSpec = (projectId: string) =>
  ({
    resource: activityReadResources.list,
    permission: 'activities.read',
    read: (signal) => activitiesClient.getActivities(projectId, signal),
  }) satisfies AuthorizedReadSpec

export const useProjectActivitiesRead = (projectId: string, enabled = true) => {
  const { resource, permission, read } = projectActivitiesSpec(projectId)
  return useAuthorizedRead(resource, projectId, permission, read, enabled, summary)
}

/** Activity detail carries proof and update history, so it always re-verifies. */
export const useActivityDetailRead = (projectId: string, activityId: string | null) =>
  useAuthorizedRead(
    activityReadResources.detail(activityId ?? 'none'),
    projectId,
    'activities.read',
    (signal) => activitiesClient.getActivity(projectId, activityId ?? '', signal),
    Boolean(activityId),
  )

/** Project-scoped officers the editor may assign (user id and display name only), never GET /users. */
export const useAssignableOfficersRead = (
  projectId: string,
  permission: 'activities.create' | 'activities.update',
  enabled: boolean,
) =>
  useAuthorizedRead(
    activityReadResources.assignableOfficers,
    projectId,
    permission,
    (signal) => activitiesClient.getAssignableProjectOfficers(projectId, signal),
    enabled,
    summary,
  )
