'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useContext } from 'react'

import {
  type AuthorizedReadSpec,
  useAuthorizedPrefetch,
  useAuthorizedRead,
} from '@/hooks/use-authorized-read'
import { journeysClient } from '@/lib/api/journeys'
import { projectsClient } from '@/lib/api/projects'
import { AuthorizedQueryContext, privateKey } from '@/providers/authorized-query-provider'

import { projectActivitiesSpec } from './activities/activities.reads'
import { projectIndicatorsSpec } from './indicators/indicators.reads'

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

/** Summary reads each workspace tab starts with, keyed by the tab route (live tabs have none). */
const tabSpecs: Record<string, (projectId: string) => AuthorizedReadSpec[]> = {
  project: (id) => [overviewMetricsSpec(id)],
  activities: (id) => [projectActivitiesSpec(id)],
  indicators: (id) => [projectIndicatorsSpec(id)],
  journey: (id) => [journeyStagesSpec(id)],
}

/** Warms reads on hover or focus: the project from a card, a tab's summary reads from its link. */
export const useProjectPrefetch = () => {
  const prefetch = useAuthorizedPrefetch()
  return {
    project: (projectId: string) => prefetch(projectId, projectSpec(projectId)),
    tab: (projectId: string, route: string) => {
      for (const spec of tabSpecs[route]?.(projectId) ?? []) prefetch(projectId, spec)
    },
  }
}

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

/** Marks the journey stages and the activity list stale after a stage configuration save. */
export const useInvalidateJourneyStagesRead = () => {
  const client = useQueryClient()
  const identity = useContext(AuthorizedQueryContext)?.identity
  return useCallback(
    (projectId: string) =>
      Promise.all(
        [projectReadResources.journeyStages, projectActivitiesSpec(projectId).resource].map(
          (resource) =>
            client.invalidateQueries({ queryKey: [privateKey[0], identity, resource, projectId] }),
        ),
      ),
    [client, identity],
  )
}

export const useProjectJourneyStagesRead = (projectId: string, enabled = true) =>
  useSpecRead(journeyStagesSpec(projectId), projectId, enabled)

export const useProjectOverviewMetricsRead = (projectId: string) =>
  useSpecRead(overviewMetricsSpec(projectId), projectId)
