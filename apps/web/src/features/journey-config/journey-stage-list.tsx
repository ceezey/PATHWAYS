import { GripVertical, Plus } from 'lucide-react'
import { useState } from 'react'

import { StatusBadge } from '@/components/pathways/status-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { JourneyStageConfig } from '@/types/pathways'

import { stageTypeTone } from '../beneficiaries/beneficiary-utils'
import { flattenStages, stageTypeStyle } from './journey-config-utils'

type ListProps = {
  stages: JourneyStageConfig[]
  selectedId?: string
  canEdit: boolean
  onSelect: (id: string) => void
  onAdd: () => void
  onMove: (id: string, targetId: string) => void
}

const actLabel = (count: number) => `${count} ${count === 1 ? 'act' : 'acts'}`

export const JourneyStageList = ({
  stages,
  selectedId,
  canEdit,
  onSelect,
  onAdd,
  onMove,
}: ListProps) => {
  const [dragId, setDragId] = useState('')
  const rows = flattenStages(stages)
  const shift = (index: number, step: number) => {
    const target = rows[index + step]
    if (target) onMove(rows[index].stage.id, target.stage.id)
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
          No stages configured yet.
        </p>
      ) : null}
      {rows.map(({ stage, parent }, index) => {
        const { icon: Icon, node } = stageTypeStyle[stage.type]
        const count = stage.mappedActivityIds.length
        const meta = parent
          ? `Branch · branch of ${parent.code} · ${actLabel(count)} mapped`
          : `${stage.type} · ${actLabel(count)} mapped`
        return (
          <div
            key={stage.id}
            data-testid="stage-row"
            draggable={canEdit}
            onDragStart={() => setDragId(stage.id)}
            onDragOver={(event) => canEdit && event.preventDefault()}
            onDrop={() => {
              if (canEdit && dragId) onMove(dragId, stage.id)
              setDragId('')
            }}
            className={cn(
              'flex items-center gap-3 rounded-md border bg-card p-3',
              parent && 'ml-8',
              stage.id === selectedId ? 'border-primary bg-primary-subtle' : 'border-border',
            )}
          >
            <button
              type="button"
              aria-pressed={stage.id === selectedId}
              onClick={() => onSelect(stage.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                  node,
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {stage.code} — {stage.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{meta}</span>
              </span>
            </button>
            <span className="hidden shrink-0 items-center gap-2 sm:flex">
              <StatusBadge tone={stageTypeTone(stage.type)} dot={false}>
                {stage.type}
              </StatusBadge>
              <StatusBadge tone="neutral" dot={false}>
                {actLabel(count)}
              </StatusBadge>
            </span>
            {canEdit ? (
              <button
                type="button"
                aria-label={`Reorder ${stage.code}`}
                title="Drag, or use arrow up and down, to reorder"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp') shift(index, -1)
                  if (event.key === 'ArrowDown') shift(index, 1)
                }}
                className="shrink-0 cursor-grab text-muted-foreground"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )
      })}
      {canEdit ? (
        <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add another stage
        </Button>
      ) : null}
    </div>
  )
}
