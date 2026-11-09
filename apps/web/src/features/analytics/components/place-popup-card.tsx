'use client'

import type { ProjectMapPlace } from '@pathways/shared'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { overviewMetricLabel } from '@/features/projects'

import { breakdown } from './project-map-card'

/** Compact place card shown over a map pin: place name, optional project, people reached. */
export const PlacePopupCard = ({
  place,
  projectTitle,
  showBreakdown = false,
  onClose,
}: {
  place: Pick<ProjectMapPlace, 'name' | 'reach'>
  projectTitle?: string
  /** Adds the SADDD sex and disability split under the total; off on the public page. */
  showBreakdown?: boolean
  onClose: () => void
}) => {
  const split =
    showBreakdown && place.reach && place.reach.total.value !== null
      ? breakdown(place.reach.sex, place.reach.disability)
      : undefined

  return (
    <div className="w-56 max-w-full text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{place.name}</p>
          {projectTitle ? <p className="text-xs text-muted-foreground">{projectTitle}</p> : null}
        </div>
        <Button
          aria-label="Close place overview"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {place.reach ? (
        <p className="mt-1 text-sm text-muted-foreground">
          People reached:{' '}
          <span className="font-medium tabular-nums text-foreground">
            {overviewMetricLabel(place.reach.total, 'count')}
          </span>
          {split ? <span className="block text-xs">{split}</span> : null}
        </p>
      ) : null}
    </div>
  )
}
