'use client'

import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { ProjectMapCard } from './project-map-card'
import { toProjectMapFeatures, useProjectMap } from './use-project-map'

/** Coverage map of every scoped project; hover, tap or the list below opens its overview card. */
export const ProjectCoverageMapPanel = ({ selectedProjectId }: { selectedProjectId?: string }) => {
  const read = useProjectMap()
  const features = useMemo(() => toProjectMapFeatures(read.data), [read.data])
  const projects = read.data?.projects ?? []
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined)
  // Until the viewer picks a point, the dashboard's selected project is shown when mapped.
  const shownId = activeId === undefined ? (selectedProjectId ?? null) : activeId
  const active = projects.find((project) => project.id === shownId) ?? null
  const unmapped = read.data?.unmappedCount ?? 0

  return (
    <>
      <div className="relative">
        <AnalyticsCoverageMap
          activeFeatureId={active?.id ?? null}
          emptyDescription={
            read.isError
              ? 'Project locations could not be loaded.'
              : read.data
                ? 'No project implementation area matches a known Philippine province or city.'
                : 'Loading project locations.'
          }
          featureCollection={features}
          onActiveFeatureChange={setActiveId}
        />
        {active ? <ProjectMapCard onClose={() => setActiveId(null)} project={active} /> : null}
      </div>
      {projects.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {projects.length} mapped {projects.length === 1 ? 'project' : 'projects'}
            {unmapped > 0 ? `; ${unmapped} without a recognized implementation area` : ''}. Points
            sit at bundled province or city centers, not exact sites.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Button
                  aria-pressed={project.id === active?.id}
                  className={cn(project.id === active?.id && 'border-primary bg-primary-subtle')}
                  onClick={() => setActiveId(project.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {project.code}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}
