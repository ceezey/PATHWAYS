'use client'

import { ProjectActivitiesWorkspace } from './project-activities-workspace'

export const ActivityDetailPage = ({
  activityId,
  openUpdate,
  proofId,
  projectId,
}: {
  activityId: string
  openUpdate?: boolean
  proofId?: string
  projectId: string
}) => (
  <ProjectActivitiesWorkspace
    initialActivityId={activityId}
    initialOpenUpdate={openUpdate}
    initialProofId={proofId}
    projectId={projectId}
  />
)
