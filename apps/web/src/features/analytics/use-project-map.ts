'use client'

import type { ProjectMap } from '@pathways/shared'

import { useAuthorizedRead } from '@/hooks/use-authorized-read'
import { projectsClient } from '@/lib/api/projects'

import type { SafeMapFeatureCollection } from './analytics-location-utils'

const readProjectMap = (signal: AbortSignal): Promise<ProjectMap> =>
  projectsClient.getProjectMap(signal)

/** Scoped projects placed at bundled PH centroids, each with its overview aggregates. */
export const useProjectMap = (enabled = true) =>
  useAuthorizedRead('analytics-project-map', null, 'projects.read', readProjectMap, enabled, {
    freshness: 'summary',
  })

const spread = 0.07

/** Places a project sharing a centroid with earlier projects on a small ring so each point stays hoverable. */
const offset = (longitude: number, latitude: number, seen: Map<string, number>) => {
  const key = `${longitude},${latitude}`
  const index = seen.get(key) ?? 0
  seen.set(key, index + 1)
  if (index === 0) return [longitude, latitude] as const
  const angle = (index - 1) * (Math.PI / 3)
  return [longitude + spread * Math.cos(angle), latitude + spread * Math.sin(angle)] as const
}

/** One point per resolved place; `properties.id` is the project id so its points highlight together. */
export const toProjectMapFeatures = (map: ProjectMap | undefined): SafeMapFeatureCollection => {
  const seen = new Map<string, number>()
  return {
    type: 'FeatureCollection',
    features: (map?.projects ?? []).flatMap((project) =>
      project.places.map((place, index) => ({
        type: 'Feature' as const,
        id: `${project.id}:${index}`,
        properties: { id: project.id, label: place.name },
        geometry: {
          type: 'Point' as const,
          coordinates: offset(place.longitude, place.latitude, seen),
        },
      })),
    ),
  }
}
