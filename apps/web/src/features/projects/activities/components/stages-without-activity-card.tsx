'use client'

import { useRef, useState } from 'react'

import { SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSourceMutationContext } from '@/hooks/use-source-mutation-context'
import { activitiesClient } from '@/lib/api/activities'
import type { ActivitySummary, JourneyStageConfig } from '@/types/pathways'

import { stagesWithoutActivity as copy } from '../activities.copy'

/** Lists the journey stages that have no activity, so a Project Manager can create one for each. */
export function StagesWithoutActivityCard({
  projectId,
  stages,
  activities,
  startDate,
  endDate,
  canCreate,
  onCreated,
}: {
  projectId: string
  stages: JourneyStageConfig[]
  activities: Pick<ActivitySummary, 'id' | 'status'>[]
  startDate?: string | null
  endDate?: string | null
  canCreate: boolean
  onCreated: () => void
}) {
  const { profile } = useCurrentRole()
  const context = useSourceMutationContext(profile, 'activities.create', projectId, null, canCreate)
  const [created, setCreated] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState('')
  const busy = useRef(false)
  const usable = new Set(activities.filter((item) => item.status !== 'Cancelled').map((a) => a.id))
  const open = stages.filter(
    (stage) =>
      !stage.archived &&
      !created.has(stage.id) &&
      !stage.mappedActivityIds.some((id) => usable.has(id)),
  )
  if (!canCreate || open.length === 0) return null

  // Each stage is sent once at a time, and a refused one stays listed for the next try.
  const create = async (targets: JourneyStageConfig[]) => {
    if (busy.current || !startDate || !endDate || !context) return
    busy.current = true
    setError('')
    try {
      for (const stage of targets) {
        try {
          await activitiesClient.createActivity(
            {
              projectId,
              title: stage.name,
              description: '',
              activityType: 'SURVEY',
              startDate,
              dueDate: endDate,
              assignedUserIds: [],
              journeyStageId: stage.id,
            },
            context,
          )
          setCreated((current) => new Set(current).add(stage.id))
          onCreated()
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : copy.refused)
        }
      }
    } finally {
      busy.current = false
    }
  }

  return (
    <SectionCard
      actions={
        startDate && endDate ? (
          <Button onClick={() => void create(open)} size="sm" type="button">
            {copy.createAll}
          </Button>
        ) : undefined
      }
      description={copy.description}
      title={copy.title}
    >
      {startDate && endDate ? null : <p className="text-sm">{copy.noDates}</p>}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {open.map((stage) => (
          <li className="flex items-center justify-between gap-3 py-2" key={stage.id}>
            <span>{stage.name}</span>
            {startDate && endDate ? (
              <Button
                aria-label={copy.createFor(stage.name)}
                onClick={() => void create([stage])}
                size="sm"
                type="button"
                variant="outline"
              >
                {copy.create}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
