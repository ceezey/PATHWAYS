'use client'

import { pathwaysClient } from '@/lib/services/pathways-client'
import { useAuthorizedRead } from '@/providers/authorized-query-provider'

const summary = { freshness: 'summary' } as const

/**
 * Stable resource keys shared by every project workspace tab, so the Overview and the
 * Activities tab reuse one project read and each workspace loads indicators once.
 */
export const projectReadResources = {
  project: 'project',
  activities: 'project-activities',
  indicators: 'project-indicators',
  journeyStages: 'project-journey-stages',
  overviewMetrics: 'project-overview-metrics',
  activityDetail: (activityId: string) => `activity-detail:${activityId}`,
} as const

export const useProjectRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.project,
    projectId,
    'projects.detail.read',
    (signal) => pathwaysClient.getProject(projectId, signal),
    enabled,
    summary,
  )

export const useProjectActivitiesRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.activities,
    projectId,
    'activities.read',
    (signal) => pathwaysClient.getActivities(projectId, signal),
    enabled,
    summary,
  )

/** Full indicator rows; `getIndicators` is the same request projected to code and label. */
export const useProjectIndicatorsRead = (projectId: string, enabled = true) =>
  useAuthorizedRead(
    projectReadResources.indicators,
    projectId,
    'indicators.read',
    (signal) => pathwaysClient.getProjectIndicators(projectId, signal),
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
    (signal) => pathwaysClient.getProjectOverviewMetrics(projectId, signal),
    true,
    summary,
  )

/** Activity detail carries proof and update history, so it always re-verifies. */
export const useActivityDetailRead = (projectId: string, activityId: string | null) =>
  useAuthorizedRead(
    projectReadResources.activityDetail(activityId ?? 'none'),
    projectId,
    'activities.read',
    (signal) => pathwaysClient.getActivity(projectId, activityId ?? '', signal),
    Boolean(activityId),
  )
