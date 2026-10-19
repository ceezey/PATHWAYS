'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useContext } from 'react'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { journeysClient } from '@/lib/api/journeys'
import { projectsClient } from '@/lib/api/projects'
import { AuthorizedQueryContext, privateKey } from '@/providers/authorized-query-provider'

const summary = { freshness: 'summary' } as const

/**
 * Stable resource keys shared by every project workspace tab, so the Overview and the
 * Activities tab reuse one project read.
 */
const projectReadResources = {
  project: 'project',
  journeyStages: 'project-journey-stages',
  overviewMetrics: 'project-overview-metrics',
} as const

export const useProjectRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.project,
    projectId,
    'projects.detail.read',
    (signal) => projectsClient.getProject(projectId, signal),
    enabled,
    summary,
  )

/** Marks the shared project read stale so the next tab or route that mounts it refetches. */
export const useInvalidateProjectRead = () => {
  const client = useQueryClient()
  const identity = useContext(AuthorizedQueryContext)?.identity
  return useCallback(
    (projectId: string) =>
      client.invalidateQueries({
        queryKey: [privateKey[0], identity, projectReadResources.project, projectId],
      }),
    [client, identity],
  )
}

export const useProjectJourneyStagesRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.journeyStages,
    projectId,
    'journeys.read',
    (signal) => journeysClient.getJourneyStages(projectId, signal),
    enabled,
    summary,
  )

export const useProjectOverviewMetricsRead = (projectId: string) =>
  useAuthorizedRead(
    projectReadResources.overviewMetrics,
    projectId,
    'projects.read',
    (signal) => projectsClient.getProjectOverviewMetrics(projectId, signal),
    true,
    summary,
  )
