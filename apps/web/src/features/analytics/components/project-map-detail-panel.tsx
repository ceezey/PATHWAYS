'use client'

import type { ProjectMapPlace, ProjectMapProject } from '@pathways/shared'
import { Lock, LockOpen, Move } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef } from 'react'

import { useHoverTip } from '@/components/pathways/metric-tooltip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { overviewMetricLabel } from '@/features/projects'

import type { MapPinDraft, useMapPinEdit } from '../hooks/use-map-pin-edit'
import { placeKey } from '../hooks/use-project-map'
import { ProjectOverviewRows } from './project-map-card'

type PinEdit = ReturnType<typeof useMapPinEdit>

const draftOf = (place: ProjectMapPlace): MapPinDraft => ({
  longitude: String(place.longitude),
  latitude: String(place.latitude),
})

// Stored statuses read as plain words: "ON_HOLD" becomes "On hold".
const statusLabel = (status: string) => {
  const words = status.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A button whose tip opens on hover or keyboard focus; an inert one stays focusable so its tip is still reachable.
const TipButton = ({
  tip,
  label,
  inert = false,
  pending,
  className,
  onClick,
  children,
}: {
  tip: string
  label: string
  inert?: boolean
  pending: boolean
  className?: string
  onClick: () => void
  children: ReactNode
}) => {
  const hover = useHoverTip(tip)
  return (
    <>
      <Button
        {...hover.triggerProps}
        aria-disabled={inert || undefined}
        aria-label={label}
        className={className}
        disabled={pending}
        onClick={inert ? undefined : onClick}
        size="sm"
        type="button"
        variant="outline"
      >
        {children}
      </Button>
      {hover.tip}
    </>
  )
}

const coordinate = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

const PlaceRow = ({
  place,
  rowKey,
  editable,
  editing,
  onEdit,
  edit,
}: {
  place: ProjectMapPlace
  rowKey: string
  editable: boolean
  editing: boolean
  onEdit: (key: string | null) => void
  edit: PinEdit
}) => {
  const { name, province } = place
  const longitude = coordinate(edit.draft.longitude)
  const latitude = coordinate(edit.draft.latitude)
  const typed = Number.isFinite(longitude) && Number.isFinite(latitude)
  const rowRef = useRef<HTMLLIElement>(null)
  const wasEditing = useRef(editing)

  // Save and Cancel unmount with the form, so focus returns to this row's Move button instead of the page top.
  useEffect(() => {
    if (wasEditing.current && !editing && document.activeElement === document.body)
      rowRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Move pin"]')?.focus()
    wasEditing.current = editing
  }, [editing])

  const startMove = () => {
    edit.clearError()
    edit.setDraft(draftOf(place))
    onEdit(rowKey)
  }
  const cancel = () => {
    edit.clearError()
    onEdit(null)
  }
  const save = async () => {
    // Saving the spot the map already shows changes nothing, so it must not resend a stale lock state.
    if (longitude === place.longitude && latitude === place.latitude) {
      onEdit(null)
      return
    }
    const outcome = await edit.save({ name, province, longitude, latitude, locked: place.locked })
    // A rejected spot returns the inputs to the saved position before the map redraws.
    if (outcome === 'invalid') edit.setDraft(draftOf(place))
    if (outcome !== 'failed') onEdit(null)
  }
  // Lock and Unlock send the position exactly as the map gave it, so they never count as a move.
  const toggleLock = () =>
    edit.save({
      name,
      province,
      longitude: place.longitude,
      latitude: place.latitude,
      locked: !place.locked,
    })
  const reset = async () => {
    const outcome = await edit.reset({ name, province })
    if (outcome !== 'failed' && editing) onEdit(null)
  }

  return (
    <li className="rounded-md bg-background p-2" data-place-key={rowKey} ref={rowRef}>
      <fieldset aria-label={`${name}, ${province}`} className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {name}
          <span className="font-normal text-muted-foreground"> · {province}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {place.saved ? 'Moved' : 'Town centre'}
          {place.locked ? ' · Locked' : ''}
          {place.reach ? ` · Reached: ${overviewMetricLabel(place.reach.total, 'count')}` : ''}
        </p>
        {editable ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <TipButton
              className="w-9 px-0"
              inert={place.locked}
              label="Move pin"
              onClick={startMove}
              pending={edit.pending}
              tip="Move pin"
            >
              <Move aria-hidden="true" className="h-4 w-4" />
            </TipButton>
            <TipButton
              className="w-9 px-0"
              label={place.locked ? 'Unlock pin' : 'Lock pin'}
              onClick={toggleLock}
              pending={edit.pending}
              tip={place.locked ? 'Unlock pin' : 'Lock pin'}
            >
              {place.locked ? (
                <Lock aria-hidden="true" className="h-4 w-4" />
              ) : (
                <LockOpen aria-hidden="true" className="h-4 w-4" />
              )}
            </TipButton>
            <TipButton
              className="ml-auto"
              inert={place.locked}
              label="Reset to town centre"
              onClick={reset}
              pending={edit.pending}
              tip="Reset to town centre"
            >
              Reset
            </TipButton>
          </div>
        ) : null}
        {editable && editing ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (typed) void save()
            }}
          >
            <p className="text-xs text-muted-foreground">
              Drag the pin on the map, or type a position.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${rowKey}-longitude`}>Longitude</Label>
                <Input
                  id={`${rowKey}-longitude`}
                  onChange={(event) =>
                    edit.setDraft({ ...edit.draft, longitude: event.target.value })
                  }
                  step="any"
                  type="number"
                  value={edit.draft.longitude}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${rowKey}-latitude`}>Latitude</Label>
                <Input
                  id={`${rowKey}-latitude`}
                  onChange={(event) =>
                    edit.setDraft({ ...edit.draft, latitude: event.target.value })
                  }
                  step="any"
                  type="number"
                  value={edit.draft.latitude}
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button disabled={!typed || edit.pending} size="sm" type="submit">
                Save
              </Button>
              <Button onClick={cancel} size="sm" type="button" variant="ghost">
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </fieldset>
    </li>
  )
}

/** Side panel for one project of the Analytics map: its places, pin editing, and the overview. */
export const ProjectMapDetailPanel = ({
  project,
  preview,
  canEdit,
  editingKey,
  onEdit,
  onSwitch,
  edit,
}: {
  project: ProjectMapProject
  preview: boolean
  canEdit: boolean
  editingKey: string | null
  onEdit: (key: string | null) => void
  onSwitch?: () => void
  edit: PinEdit
}) => (
  <aside
    aria-label={`${project.title} details`}
    className="rounded-md border border-border bg-card p-4 text-left"
  >
    <p className="font-medium text-foreground">{project.title}</p>
    <p className="text-xs text-muted-foreground">
      {project.code} · {statusLabel(project.status)}
    </p>
    <p className="mt-1 text-sm text-muted-foreground">{project.implementationArea}</p>
    {preview && onSwitch ? (
      <Button className="mt-2" onClick={onSwitch} size="sm" type="button" variant="outline">
        Switch filter to this project
      </Button>
    ) : null}
    {edit.error ? (
      <p className="mt-2 text-sm text-danger" role="alert">
        {edit.error}
      </p>
    ) : null}
    <ul className="mt-2 space-y-2">
      {project.places.map((place, index) => {
        const rowKey = placeKey(project.id, index)
        return (
          <PlaceRow
            edit={edit}
            editable={canEdit && !preview}
            editing={editingKey === rowKey}
            key={rowKey}
            onEdit={onEdit}
            place={place}
            rowKey={rowKey}
          />
        )
      })}
    </ul>
    <ProjectOverviewRows project={project} />
    <Link
      className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      href={`/projects/${project.id}`}
    >
      Open project
    </Link>
  </aside>
)
