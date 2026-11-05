'use client'

import { type PublicView, publicView } from '@pathways/shared'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

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
  const handles = useRef(new Map<PublicView, HTMLButtonElement>())
  const pendingFocus = useRef<PublicView | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // React re-inserts a moved row, which drops focus, so the handle moved by a key press is focused once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Runs when the new order arrives.
  useEffect(() => {
    const view = pendingFocus.current
    pendingFocus.current = null
    if (view) handles.current.get(view)?.focus()
  }, [value])
  // A tick, untick or drag is not a keyboard move, so nothing is refocused or announced.
  const change = (next: PublicView[]) => {
    pendingFocus.current = null
    setAnnouncement('')
    onChange(next)
  }
  const drag = useDragReorder(value, disabled, (view, to) => {
    setAnnouncement('')
    move(view, to)
  })
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
                  onChange={() => change(value.filter((entry) => entry !== view))}
                  type="checkbox"
                />
                {viewLabels[view]}
              </label>
              <button
                aria-label={`Reorder ${viewLabels[view]}, position ${index + 1} of ${value.length}`}
                className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  const to = index + (event.key === 'ArrowUp' ? -1 : 1)
                  if (to < 0 || to >= value.length) return
                  pendingFocus.current = view
                  setAnnouncement(
                    `${viewLabels[view]} moved to position ${to + 1} of ${value.length}`,
                  )
                  move(view, to)
                }}
                ref={(node) => {
                  if (node) handles.current.set(view, node)
                  else handles.current.delete(view)
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
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {unticked.map((view) => (
        <label className="flex min-h-11 items-center gap-3 px-3 text-sm" key={view}>
          <input checked={false} onChange={() => change([...value, view])} type="checkbox" />
          {viewLabels[view]}
        </label>
      ))}
    </fieldset>
  )
}
