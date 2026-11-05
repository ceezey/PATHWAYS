'use client'

import { type PublicView, publicView } from '@pathways/shared'
import { GripVertical } from 'lucide-react'

import { DropLine } from './drop-line'
import { useDragReorder } from './use-drag-reorder'

const viewLabels: Record<PublicView, string> = {
  kpi: 'KPI / indicator performance',
  saddd: 'SADDD (sex, age, disability)',
  participation: 'Participation patterns',
  timeline: 'Timeline adherence',
  map: 'Project coverage map',
}

// Ticked charts in public page order, reordered by drag or arrow keys; unticked charts follow.
export const PublicViewPicker = ({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (next: PublicView[]) => void
  value: PublicView[]
}) => {
  const move = (view: PublicView, to: number) => {
    if (to < 0 || to >= value.length) return
    const next = value.filter((entry) => entry !== view)
    next.splice(to, 0, view)
    onChange(next)
  }
  const drag = useDragReorder(value, disabled, move)
  const unticked = publicView.options.filter((view) => !value.includes(view))
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">Charts on the public page</legend>
      <p className="text-xs text-muted-foreground">
        Ticked charts show in the order below. Drag a chart, or use arrow up and down on its handle,
        to reorder.
      </p>
      {value.length ? (
        <ol aria-label="Chosen charts" className="space-y-2">
          {value.map((view, index) => (
            <li
              className={`relative flex min-h-11 items-center gap-3 rounded-md border bg-card px-3 text-sm ${drag.dragging === view ? 'border-primary opacity-60' : 'border-border'}`}
              key={view}
              {...drag.itemProps(view, index)}
            >
              <DropLine side={drag.landing(index)} axis="horizontal" />
              <span className="w-4 text-xs font-semibold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <label className="flex flex-1 items-center gap-3">
                <input
                  checked
                  onChange={() => onChange(value.filter((entry) => entry !== view))}
                  type="checkbox"
                />
                {viewLabels[view]}
              </label>
              <button
                aria-label={`Reorder ${viewLabels[view]}`}
                className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  move(view, index + (event.key === 'ArrowUp' ? -1 : 1))
                }}
                title="Drag, or use arrow up and down, to reorder"
                type="button"
              >
                <GripVertical aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {unticked.map((view) => (
        <label className="flex min-h-11 items-center gap-3 px-3 text-sm" key={view}>
          <input checked={false} onChange={() => onChange([...value, view])} type="checkbox" />
          {viewLabels[view]}
        </label>
      ))}
    </fieldset>
  )
}
