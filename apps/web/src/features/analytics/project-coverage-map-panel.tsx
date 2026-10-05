'use client'

import { useMemo } from 'react'

import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { ProjectMapCard } from './project-map-card'
import { toProjectMapFeatures, useProjectMap } from './use-project-map'

/** Coverage map of every scoped project; hovering or tapping a dot opens that location's overview. */
export const ProjectCoverageMapPanel = () => {
  const read = useProjectMap()
  const features = useMemo(() => toProjectMapFeatures(read.data), [read.data])
  const projects = read.data?.projects

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
        const project = projects?.find((row) => row.id === point.id)
        return project ? (
          <ProjectMapCard onClose={close} place={point.label} project={project} />
        ) : null
      }}
    />
  )
}
