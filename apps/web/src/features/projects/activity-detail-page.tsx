'use client'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

export const ActivityDetailPage = ({
  activityId,
  proofId,
  projectId,
}: {
  activityId: string
  proofId?: string
  projectId: string
}) => (
  <ProjectActivitiesWorkspace
    initialActivityId={activityId}
    initialProofId={proofId}
    projectId={projectId}
  />
)
