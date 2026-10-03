import { cn } from '@/lib/utils'
import type { JourneyStageConfig } from '@/types/pathways'

import { childrenOf, rootStages, stageTypeStyle } from './journey-config-utils'

type TrackProps = {
  stages: JourneyStageConfig[]
  selectedId?: string
  onSelect?: (id: string) => void
}

const Node = ({
  stage,
  selected,
  onSelect,
}: {
  stage: JourneyStageConfig
  selected: boolean
  onSelect?: (id: string) => void
}) => {
  const { icon: Icon, node } = stageTypeStyle[stage.type]
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${stage.code} ${stage.name}`}
      disabled={!onSelect}
      onClick={() => onSelect?.(stage.id)}
      className="flex w-24 flex-col items-center gap-1 text-center disabled:cursor-default"
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2',
          node,
          selected && 'ring-2 ring-ring ring-offset-2',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-foreground">{stage.code}</span>
      <span className="w-full truncate text-xs text-muted-foreground" title={stage.name}>
        {stage.name}
      </span>
    </button>
  )
}

export const JourneyTrack = ({ stages, selectedId, onSelect }: TrackProps) => {
  const roots = rootStages(stages)
  if (roots.length === 0)
    return <p className="text-sm text-muted-foreground">No stages configured yet.</p>
  return (
    <div className="overflow-x-auto" data-testid="journey-track">
      <ol className="flex min-w-max items-start px-2 py-3">
        {roots.map((root, index) => {
          const kids = childrenOf(stages, root.id)
          return (
            <li key={root.id} className="flex items-start">
              <div className="flex flex-col items-center">
                <Node stage={root} selected={root.id === selectedId} onSelect={onSelect} />
                {kids.length > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
                    {/* Branches sit side by side under the parent, joined by one bar. */}
                    <ul className="flex" aria-label={`Branches of ${root.code}`}>
                      {kids.map((kid, kidIndex) => (
                        <li key={kid.id} className="relative flex flex-col items-center">
                          {kids.length > 1 ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute top-0 h-px bg-border-strong',
                                kidIndex === 0 ? 'left-1/2 right-0' : 'left-0',
                                kidIndex === kids.length - 1 ? 'right-1/2' : 'right-0',
                              )}
                            />
                          ) : null}
                          <span aria-hidden="true" className="h-4 w-px bg-border-strong" />
                          <Node stage={kid} selected={kid.id === selectedId} onSelect={onSelect} />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
              {index < roots.length - 1 ? (
                <span aria-hidden="true" className="mt-6 h-px w-8 bg-border-strong" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
