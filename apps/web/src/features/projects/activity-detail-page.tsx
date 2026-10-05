'use client'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

export const ActivityDetailPage = ({
  action,
  activityId,
  proofId,
  projectId,
}: {
  action?: string
  activityId: string
  proofId?: string
  projectId: string
}) => (
  <ProjectActivitiesWorkspace
    initialActivityId={activityId}
    initialAction={action}
    initialProofId={proofId}
    projectId={projectId}
  />
)
