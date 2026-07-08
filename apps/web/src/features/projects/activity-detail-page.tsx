'use client'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

export const ActivityDetailPage = ({
  activityId,
  projectId,
}: {
  activityId: string
  projectId: string
}) => <ProjectActivitiesWorkspace initialActivityId={activityId} projectId={projectId} />
