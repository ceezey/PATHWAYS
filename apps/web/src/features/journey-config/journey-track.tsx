import { cn } from '@/lib/utils'
import type { JourneyStageConfig } from '@/types/pathways'

import { childrenOf, rootStages, stageTypeStyle } from './journey-config-utils'

export type StageState = 'done' | 'current' | 'upcoming'

type TrackProps = {
  stages: JourneyStageConfig[]
  selectedId?: string
  onSelect?: (id: string) => void
  stageState?: (stage: JourneyStageConfig) => StageState
}

const stateStyle: Record<StageState, { node: string; label: string }> = {
  done: { node: 'border-primary bg-primary-subtle text-primary', label: 'Done' },
  current: {
    node: 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2',
    label: 'Current',
  },
  upcoming: { node: 'border-border bg-muted text-muted-foreground', label: 'Locked' },
}

const Node = ({
  stage,
  selected,
  onSelect,
  state,
}: {
  stage: JourneyStageConfig
  selected: boolean
  onSelect?: (id: string) => void
  state?: StageState
}) => {
  const { icon: Icon, node } = stageTypeStyle[stage.type]
  const status = state ? stateStyle[state] : undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={
        status ? `${stage.code} ${stage.name}: ${status.label}` : `${stage.code} ${stage.name}`
      }
      aria-current={state === 'current' ? 'step' : undefined}
      disabled={!onSelect || state === 'upcoming'}
      onClick={() => onSelect?.(stage.id)}
      className="flex w-24 flex-col items-center gap-1 rounded-md text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2',
          status?.node ?? node,
          selected && 'ring-2 ring-ring ring-offset-2',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-foreground">{stage.code}</span>
      <span className="w-full truncate text-xs text-muted-foreground" title={stage.name}>
        {stage.name}
      </span>
      {status ? <span className="text-xs text-muted-foreground">{status.label}</span> : null}
    </button>
  )
}

export const JourneyTrack = ({ stages, selectedId, onSelect, stageState }: TrackProps) => {
  const roots = rootStages(stages)
  if (roots.length === 0)
    return <p className="text-sm text-muted-foreground">No stages configured yet.</p>
  return (
    <div className="overflow-x-auto" data-testid="journey-track">
      <ol className="flex min-w-max items-start px-2 py-3">
        {roots.map((root, index) => {
          const kids = childrenOf(stages, root.id)
          const last = index === roots.length - 1
          return (
            <li key={root.id} className="flex items-start">
              <Node
                stage={root}
                selected={root.id === selectedId}
                onSelect={onSelect}
                state={stageState?.(root)}
              />
              {!last || kids.length > 0 ? (
                // Connector to the next stage; branches drop from its midpoint.
                <div className="flex w-28 flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-6 h-px',
                      stageState?.(root) === 'done' ? 'bg-primary' : 'bg-border-strong',
                      last ? 'w-1/2 self-start' : 'w-full',
                    )}
                  />
                  {kids.length > 0 ? (
                    <ul
                      className="flex flex-col items-center"
                      aria-label={`Branches of ${root.code}`}
                    >
                      {kids.map((kid) => (
                        <li key={kid.id} className="flex flex-col items-center">
                          <span aria-hidden="true" className="h-5 w-px bg-border-strong" />
                          <Node
                            stage={kid}
                            selected={kid.id === selectedId}
                            onSelect={onSelect}
                            state={stageState?.(kid)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
