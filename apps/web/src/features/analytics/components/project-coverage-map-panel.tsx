'use client'

import { useMemo } from 'react'

import { placeKey, toProjectMapFeatures, useProjectMap } from '../hooks/use-project-map'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { ProjectMapCard } from './project-map-card'

/** Coverage map of every scoped project; hovering or tapping a dot opens that location's overview. */
export const ProjectCoverageMapPanel = () => {
  const read = useProjectMap()
  const features = useMemo(() => toProjectMapFeatures(read.data), [read.data])
  // Each point's key names one place of one project, so same-name towns never share a card.
  const places = useMemo(
    () =>
      new Map(
        (read.data?.projects ?? []).flatMap((project) =>
          project.places.map((place, index) => [placeKey(project.id, index), { project, place }]),
        ),
      ),
    [read.data],
  )

  return (
    <AnalyticsCoverageMap
      emptyDescription={
        read.isError
          ? 'Project locations could not be loaded.'
          : read.data
            ? 'No project implementation area matches a known Philippine province or city.'
            : 'Loading project locations.'
      }
      featureCollection={features}
      renderPopup={(point, close) => {
        const match = places.get(point.key)
        return match ? (
          <ProjectMapCard onClose={close} place={match.place} project={match.project} />
        ) : null
      }}
    />
  )
}
