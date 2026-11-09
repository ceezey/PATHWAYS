'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useCurrentRole } from '@/hooks/use-current-role'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'

import { useMapPinEdit } from '../hooks/use-map-pin-edit'
import { placeKey, toProjectMapFeatures, useProjectMap } from '../hooks/use-project-map'
import { AnalyticsCoverageMap } from './analytics-coverage-map'
import { PlacePopupCard } from './place-popup-card'
import { ProjectMapCard } from './project-map-card'
import { ProjectMapDetailPanel } from './project-map-detail-panel'

type ProjectCoverageMapPanelProps =
  | { mode: 'dashboard' }
  | { mode: 'analytics'; selectedProjectId: string; onSelectProject: (projectId: string) => void }

// Each point's key names one place of one project, so same-name towns never share a card.
const usePlaceIndex = (read: ReturnType<typeof useProjectMap>) =>
  useMemo(
    () =>
      new Map(
        (read.data?.projects ?? []).flatMap((project) =>
          project.places.map((place, index) => [placeKey(project.id, index), { project, place }]),
        ),
      ),
    [read.data],
  )

const emptyText = (read: ReturnType<typeof useProjectMap>) =>
  read.isError
    ? 'Project locations could not be loaded.'
    : read.data
      ? 'No project implementation area matches a known Philippine province or city.'
      : 'Loading project locations.'

// Drops land to about a metre, so the inputs stay short.
const dropText = (value: number) => String(Number(value.toFixed(5)))

/** Dashboard map: hovering or tapping a dot opens that location's overview card. */
const DashboardMap = () => {
  const read = useProjectMap()
  const features = useMemo(() => toProjectMapFeatures(read.data), [read.data])
  const places = usePlaceIndex(read)

  return (
    <AnalyticsCoverageMap
      emptyDescription={emptyText(read)}
      featureCollection={features}
      renderPopup={(point, close) => {
        const match = places.get(point.key)
        return match ? (
          <ProjectMapCard onClose={close} place={match.place} project={match.project} />
        ) : null
      }}
    />
  )
}

/** Analytics map: the selected project is highlighted and a side panel shows and edits its pins. */
const AnalyticsMap = ({
  selectedProjectId,
  onSelectProject,
}: {
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
}) => {
  const read = useProjectMap()
  const { profile } = useCurrentRole()
  const canEdit = principalHasAtomicPermission(profile, 'projects.update')
  const features = useMemo(() => toProjectMapFeatures(read.data), [read.data])
  const places = usePlaceIndex(read)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ key: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const shownId = previewId ?? selectedProjectId
  const project = read.data?.projects.find((candidate) => candidate.id === shownId)
  const edit = useMapPinEdit(shownId, read.refetch)

  // A new filter choice replaces any preview and ends any edit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the filter id is the only trigger.
  useEffect(() => {
    setPreviewId(null)
    setEditingKey(null)
  }, [selectedProjectId])

  // Waits for the panel to show the selected project before scrolling to the clicked place.
  useEffect(() => {
    if (!focus || previewId) return
    panelRef.current
      ?.querySelector(`[data-place-key="${focus.key}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [focus, previewId])

  // A click that ends a drag lands here too, so a pick of the selected project keeps the edit open.
  const pick = ({ id, key }: { id: string; key: string }) => {
    if (id === selectedProjectId) {
      setPreviewId(null)
      setFocus({ key })
    } else {
      setPreviewId(id)
      setEditingKey(null)
    }
  }
  // A locked pin is never draggable, so it never becomes the editing key.
  const editable = editingKey && !previewId && !places.get(editingKey)?.place.locked
  const editing = editable
    ? {
        key: editingKey,
        onDrop: ([longitude, latitude]: [number, number]) =>
          edit.setDraft({ longitude: dropText(longitude), latitude: dropText(latitude) }),
      }
    : undefined

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <AnalyticsCoverageMap
        editing={editing}
        emptyDescription={emptyText(read)}
        featureCollection={features}
        onPick={pick}
        // Hidden while a pin is being dragged, so the card never covers the drop spot.
        renderPopup={
          editing
            ? undefined
            : (point, close) => {
                const match = places.get(point.key)
                return match ? (
                  <PlacePopupCard
                    onClose={close}
                    place={match.place}
                    projectTitle={match.project.title}
                    showBreakdown
                  />
                ) : null
              }
        }
        selectedId={selectedProjectId}
      />
      <div ref={panelRef}>
        {project ? (
          <ProjectMapDetailPanel
            canEdit={canEdit}
            edit={edit}
            editingKey={editing?.key ?? null}
            onEdit={setEditingKey}
            onSwitch={() => {
              onSelectProject(shownId)
              setPreviewId(null)
            }}
            preview={previewId !== null}
            project={project}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Click a pin to see its details.</p>
        )}
      </div>
    </div>
  )
}

/** Coverage map of every scoped project, on the dashboard or beside the Analytics side panel. */
export const ProjectCoverageMapPanel = (props: ProjectCoverageMapPanelProps) =>
  props.mode === 'analytics' ? (
    <AnalyticsMap
      onSelectProject={props.onSelectProject}
      selectedProjectId={props.selectedProjectId}
    />
  ) : (
    <DashboardMap />
  )
