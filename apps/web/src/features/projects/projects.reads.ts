'use client'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { projectsClient } from '@/lib/api/projects'
import { pathwaysClient } from '@/lib/services/pathways-client'

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

export const useProjectJourneyStagesRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.journeyStages,
    projectId,
    'journeys.read',
    (signal) => pathwaysClient.getJourneyStages(projectId, signal),
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
