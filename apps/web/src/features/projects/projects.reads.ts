'use client'

import {
  type AuthorizedReadSpec,
  useAuthorizedPrefetch,
  useAuthorizedRead,
} from '@/hooks/use-authorized-read'
import { journeysClient } from '@/lib/api/journeys'
import { projectsClient } from '@/lib/api/projects'
import type { WorkspaceTabAccess } from '@/lib/rbac/nav'

import { projectActivitiesSpec } from './activities/activities.reads'
import { projectIndicatorsSpec } from './indicators/indicators.reads'

const summary = { freshness: 'summary' } as const

/** Stable resource keys shared by the project workspace tabs, so a tab switch reuses one read. */
const projectReadResources = {
  project: 'project',
  journeyStages: 'project-journey-stages',
  overviewMetrics: 'project-overview-metrics',
} as const

const projectSpec = (projectId: string) =>
  ({
    resource: projectReadResources.project,
    permission: 'projects.detail.read',
    read: (signal) => projectsClient.getProject(projectId, signal),
  }) satisfies AuthorizedReadSpec
const journeyStagesSpec = (projectId: string) =>
  ({
    resource: projectReadResources.journeyStages,
    permission: 'journeys.read',
    read: (signal) => journeysClient.getJourneyStages(projectId, signal),
  }) satisfies AuthorizedReadSpec
const overviewMetricsSpec = (projectId: string) =>
  ({
    resource: projectReadResources.overviewMetrics,
    permission: 'projects.read',
    read: (signal) => projectsClient.getProjectOverviewMetrics(projectId, signal),
  }) satisfies AuthorizedReadSpec

const useSpecRead = <T>(spec: AuthorizedReadSpec<T>, projectId: string, enabled = true) =>
  useAuthorizedRead(spec.resource, projectId, spec.permission, spec.read, enabled, summary)

export const useProjectRead = (projectId: string, enabled = true) =>
  useSpecRead(projectSpec(projectId), projectId, enabled)

type TabRoute = NonNullable<WorkspaceTabAccess['route']>

/** Summary reads each tab actually mounts with, by tab route; live tabs and the live journey editor have none. */
const tabSpecs: Partial<Record<TabRoute, (projectId: string) => AuthorizedReadSpec[]>> = {
  project: (id) => [overviewMetricsSpec(id)],
  activities: (id) => [projectActivitiesSpec(id), projectIndicatorsSpec(id), journeyStagesSpec(id)],
  journey: (id) => [projectActivitiesSpec(id)],
}

/** Warms reads on hover or focus: the project from a card, a tab's summary reads from its link. */
export const useProjectPrefetch = () => {
  const prefetch = useAuthorizedPrefetch()
  return {
    project: (projectId: string) => prefetch(projectId, projectSpec(projectId)),
    tab: (projectId: string, route: TabRoute) => {
      for (const spec of tabSpecs[route]?.(projectId) ?? []) prefetch(projectId, spec)
    },
  }
}

export const useProjectJourneyStagesRead = (projectId: string, enabled = true) =>
  useSpecRead(journeyStagesSpec(projectId), projectId, enabled)

export const useProjectOverviewMetricsRead = (projectId: string) =>
  useSpecRead(overviewMetricsSpec(projectId), projectId)
