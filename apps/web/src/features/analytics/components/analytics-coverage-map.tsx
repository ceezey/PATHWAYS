'use client'

import { AlertTriangle, LoaderCircle, MapPinned } from 'lucide-react'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
} from 'maplibre-gl'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { chartPalette } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'

import {
  EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  type SafeMapFeature,
  type SafeMapFeatureCollection,
} from '../analytics-location.utils'

const sourceId = 'pathways-authorized-project-locations'
const layerId = 'pathways-authorized-project-location-points'

const defaultCenter: readonly [longitude: number, latitude: number] = [122, 12.5]
const defaultZoom = 4.5
const singleFeatureZoom = 12
// Mirrors the --muted-foreground token because MapLibre cannot read CSS variables.
const mutedPinColor = '#526779'

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** Copied into public by scripts/copy-maplibre-worker.mjs before dev and build. */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs'

export const resolveMapStyleUrl = (configuredStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL) =>
  configuredStyleUrl?.trim() || DEFAULT_MAP_STYLE_URL

type AnalyticsCoverageMapProps = Readonly<{
  featureCollection?: SafeMapFeatureCollection
  styleUrl?: string | null
  initialCenter?: readonly [longitude: number, latitude: number]
  initialZoom?: number
  className?: string
  /** Content of the popup anchored on a hovered or tapped point. */
  renderPopup?: (point: MapPoint, close: () => void) => ReactNode
  emptyDescription?: string
  /** Called with the clicked point, or null when the card closes or the empty map is clicked. */
  onPick?: (point: Readonly<{ id: string; key: string }> | null) => void
  /** Project id to highlight; every other project dims. */
  selectedId?: string
  /** Lets one pin, by its feature key, be dragged; onDrop receives the release point. */
  editing?: Readonly<{
    key: string
    onDrop: (coordinates: [longitude: number, latitude: number]) => void
  }>
}>

type MapStatus = 'loading' | 'ready' | 'error'

type MapPoint = Readonly<{
  id: string
  key: string
  label: string
  coordinates: readonly [longitude: number, latitude: number]
}>

type OpenPoint = MapPoint & Readonly<{ pinned: boolean }>

const cardGap = 14
const cardPad = 8

/** Card position above the point, else below, else beside it, always clamped inside the map frame. */
export const cardPosition = (
  point: Readonly<{ x: number; y: number }>,
  card: Readonly<{ width: number; height: number }>,
  frame: Readonly<{ width: number; height: number }>,
) => {
  const clamp = (value: number, max: number) => Math.max(cardPad, Math.min(value, max - cardPad))
  const { x, y } = point
  const { width: w, height: h } = card
  let left = x - w / 2
  let top = y - cardGap - h
  if (top < cardPad && y + cardGap + h <= frame.height - cardPad) top = y + cardGap
  else if (top < cardPad) {
    top = y - h / 2
    left = x + cardGap + w <= frame.width - cardPad ? x + cardGap : x - cardGap - w
  }
  return { left: clamp(left, frame.width - w), top: clamp(top, frame.height - h) }
}

// Centers a pinned point low in the frame so its card fits above it, even near an edge.
const centerLow = (map: MapLibreMap, coordinates: MapPoint['coordinates']) => {
  const offsetY = Math.min(140, map.getContainer().clientHeight / 3)
  map.easeTo({ center: [...coordinates], offset: [0, offsetY], duration: 300 })
}

const featurePoint = (feature: SafeMapFeature): OpenPoint => ({
  id: feature.properties.id,
  key: feature.properties.key,
  label: feature.properties.label ?? '',
  coordinates: feature.geometry.coordinates,
  pinned: true,
})

const syncMapCamera = (
  map: MapLibreMap,
  featureCollection: SafeMapFeatureCollection,
  initialCenter: readonly [longitude: number, latitude: number],
  initialZoom: number,
) => {
  const coordinates = featureCollection.features.map((feature) => feature.geometry.coordinates)

  if (coordinates.length === 0) {
    map.jumpTo({ center: [initialCenter[0], initialCenter[1]], zoom: initialZoom })
    return
  }

  if (coordinates.length === 1) {
    map.jumpTo({ center: [coordinates[0][0], coordinates[0][1]], zoom: singleFeatureZoom })
    return
  }

  let minimumLongitude = coordinates[0][0]
  let maximumLongitude = coordinates[0][0]
  let minimumLatitude = coordinates[0][1]
  let maximumLatitude = coordinates[0][1]

  for (const [longitude, latitude] of coordinates.slice(1)) {
    minimumLongitude = Math.min(minimumLongitude, longitude)
    maximumLongitude = Math.max(maximumLongitude, longitude)
    minimumLatitude = Math.min(minimumLatitude, latitude)
    maximumLatitude = Math.max(maximumLatitude, latitude)
  }

  map.fitBounds(
    [
      [minimumLongitude, minimumLatitude],
      [maximumLongitude, maximumLatitude],
    ],
    { duration: 0, maxZoom: singleFeatureZoom, padding: 48 },
  )
}

// The selected project's features, or every feature when none is selected or matches.
const cameraCollection = (
  featureCollection: SafeMapFeatureCollection,
  selectedId: string | undefined,
): SafeMapFeatureCollection => {
  const features = featureCollection.features.filter(
    (feature) => feature.properties.id === selectedId,
  )
  return selectedId && features.length > 0 ? { ...featureCollection, features } : featureCollection
}

// Picks one value for the selected project's pins and another for the rest.
const pickByProject = <T extends number | string>(
  selectedId: string,
  selected: T,
  others: T,
): ExpressionSpecification => ['case', ['==', ['get', 'id'], selectedId], selected, others]

export const AnalyticsCoverageMap = ({
  featureCollection = EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  styleUrl,
  initialCenter = defaultCenter,
  initialZoom = defaultZoom,
  className,
  renderPopup,
  emptyDescription = 'No authoritative project coordinates are available. Text-only implementation areas remain unresolved and unplotted.',
  onPick,
  selectedId,
  editing,
}: AnalyticsCoverageMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const latestFeaturesRef = useRef<SafeMapFeatureCollection>(featureCollection)
  const selectedIdRef = useRef(selectedId)
  const onDropRef = useRef(editing?.onDrop)
  const onPickRef = useRef(onPick)
  const editingKey = editing?.key
  const resolvedStyleUrl = styleUrl === undefined ? resolveMapStyleUrl() : styleUrl?.trim() || null
  const [status, setStatus] = useState<MapStatus>(resolvedStyleUrl ? 'loading' : 'error')
  const [errorMessage, setErrorMessage] = useState(
    resolvedStyleUrl ? '' : 'Map style is not configured for this environment.',
  )
  const [retryKey, setRetryKey] = useState(0)
  const centerLongitude = initialCenter[0]
  const centerLatitude = initialCenter[1]

  const cardRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [openPoint, setOpenPoint] = useState<OpenPoint | null>(null)
  // The selection the camera was last fitted to, or null before any fit with pins.
  const fittedForRef = useRef<string | null>(null)
  const hasPopup = Boolean(renderPopup)
  const pickable = hasPopup || Boolean(onPick)

  // Closing returns focus to the place button that opened the card, if any.
  const close = () => {
    setOpenPoint(null)
    onPickRef.current?.(null)
    openerRef.current?.focus()
    openerRef.current = null
  }
  const pinFromList = (feature: SafeMapFeature, opener: HTMLElement) => {
    openerRef.current = opener
    setOpenPoint(featurePoint(feature))
    onPickRef.current?.(feature.properties)
    if (mapRef.current) centerLow(mapRef.current, feature.geometry.coordinates)
  }

  latestFeaturesRef.current = featureCollection
  selectedIdRef.current = selectedId
  onDropRef.current = editing?.onDrop
  onPickRef.current = onPick

  useEffect(() => {
    const container = containerRef.current
    if (!container || !resolvedStyleUrl) {
      setStatus('error')
      setErrorMessage('Map style is not configured for this environment.')
      return
    }

    container.dataset.mapAttempt = String(retryKey)
    let cancelled = false
    let map: MapLibreMap | null = null
    let resizeObserver: ResizeObserver | null = null
    let styleLoaded = false
    let handleLoad: (() => void) | null = null
    let handleError: (() => void) | null = null

    setStatus('loading')
    setErrorMessage('')

    void import('maplibre-gl')
      .then((maplibre) => {
        const { Map: MapLibre, NavigationControl } = maplibre
        if (cancelled) return
        // The bundled worker URL never resolves, so tiles and points stay blank without this copy.
        maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)

        map = new MapLibre({
          container,
          style: resolvedStyleUrl,
          center: [centerLongitude, centerLatitude],
          zoom: initialZoom,
        })
        mapRef.current = map

        // Ready once the style parses, not after every tile, so slow mobile tiles never hold the overlay.
        handleLoad = () => {
          if (cancelled || !map || styleLoaded) return
          styleLoaded = true
          map.addSource(sourceId, {
            type: 'geojson',
            data: latestFeaturesRef.current,
          })
          map.addLayer({
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-color': chartPalette[0],
              'circle-radius': 8,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          })
          syncMapCamera(
            map,
            cameraCollection(latestFeaturesRef.current, selectedIdRef.current),
            [centerLongitude, centerLatitude],
            initialZoom,
          )
          fittedForRef.current = latestFeaturesRef.current.features.length
            ? (selectedIdRef.current ?? '')
            : null
          map.resize()
          setStatus('ready')
        }
        handleError = () => {
          if (cancelled) return
          setStatus('error')
          setErrorMessage(
            styleLoaded
              ? 'Basemap tiles could not be loaded. Other pages are unaffected.'
              : 'The configured map style could not be loaded. Other pages are unaffected.',
          )
        }

        const toPoint = (
          feature: MapGeoJSONFeature | undefined,
          pinned: boolean,
        ): OpenPoint | null => {
          const id = feature?.properties?.id
          const key = feature?.properties?.key
          if (
            typeof id !== 'string' ||
            typeof key !== 'string' ||
            feature?.geometry.type !== 'Point'
          )
            return null
          const [longitude, latitude] = feature.geometry.coordinates
          const label = feature.properties?.label
          return {
            id,
            key,
            label: typeof label === 'string' ? label : '',
            coordinates: [longitude, latitude],
            pinned,
          }
        }
        // Hover previews a point; a click or tap pins it until closed or the map is tapped elsewhere.
        const handleEnter = (event: MapLayerMouseEvent) => {
          if (map) map.getCanvas().style.cursor = 'pointer'
          setOpenPoint((current) =>
            current?.pinned ? current : toPoint(event.features?.[0], false),
          )
        }
        const handleLeave = () => {
          if (map) map.getCanvas().style.cursor = ''
          setOpenPoint((current) => (current?.pinned ? current : null))
        }
        const handleClick = (event: MapMouseEvent) => {
          const onPoint = map?.queryRenderedFeatures(event.point, { layers: [layerId] }) ?? []
          const point = toPoint(onPoint[0], true)
          openerRef.current = null
          setOpenPoint(point)
          onPickRef.current?.(point)
          if (point && map) centerLow(map, point.coordinates)
        }
        map.on('style.load', handleLoad)
        map.on('load', handleLoad)
        map.on('error', handleError)
        if (pickable) {
          map.on('mouseenter', layerId, handleEnter)
          map.on('mouseleave', layerId, handleLeave)
          map.on('click', handleClick)
        }
        map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map?.resize())
          resizeObserver.observe(container)
        }
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setErrorMessage('The map renderer could not be initialized. Other pages are unaffected.')
      })

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      setOpenPoint(null)
      if (map && handleLoad) map.off('style.load', handleLoad)
      if (map && handleLoad) map.off('load', handleLoad)
      if (map && handleError) map.off('error', handleError)
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
      delete container.dataset.mapAttempt
    }
  }, [centerLatitude, centerLongitude, initialZoom, pickable, resolvedStyleUrl, retryKey])

  // Also re-runs when edit mode starts or ends, so every pin is redrawn from props and a rejected drop snaps back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: editingKey only triggers the redraw.
  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId)
    if (source?.type === 'geojson') (source as GeoJSONSource).setData(featureCollection)
  }, [featureCollection, editingKey])

  // Fits the camera once per selection; a data reload after a save or lock keeps the person's view.
  useEffect(() => {
    const map = mapRef.current
    const target = selectedId ?? ''
    const hasPins = featureCollection.features.length > 0
    if (!map?.getSource(sourceId) || (hasPins && fittedForRef.current === target)) return
    syncMapCamera(
      map,
      cameraCollection(featureCollection, selectedId),
      [centerLongitude, centerLatitude],
      initialZoom,
    )
    fittedForRef.current = hasPins ? target : null
  }, [centerLatitude, centerLongitude, featureCollection, initialZoom, selectedId])

  useLayoutEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map) return
    map.setPaintProperty(
      layerId,
      'circle-color',
      selectedId ? pickByProject(selectedId, chartPalette[0], mutedPinColor) : chartPalette[0],
    )
    map.setPaintProperty(
      layerId,
      'circle-opacity',
      selectedId ? pickByProject(selectedId, 1, 0.45) : 1,
    )
    map.setLayoutProperty(
      layerId,
      'circle-sort-key',
      selectedId ? pickByProject(selectedId, 1, 0) : 0,
    )
    const baseRadius = selectedId ? pickByProject(selectedId, 9, 6) : 8
    // The pin being moved, else the open card's pin, is drawn larger.
    const bigKey = editingKey ?? (hasPopup ? openPoint?.key : undefined)
    map.setPaintProperty(
      layerId,
      'circle-radius',
      bigKey ? ['case', ['==', ['get', 'key'], bigKey], 11, baseRadius] : baseRadius,
    )
  }, [editingKey, hasPopup, openPoint?.key, selectedId, status])

  // Dragging one pin: pan is off while it moves, and the new spot is reported on release.
  useEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map || !editingKey) return
    // Brings the movable pin into view, since it may sit outside the current zoom.
    const target = latestFeaturesRef.current.features.find(
      (feature) => feature.properties.key === editingKey,
    )
    if (target) map.easeTo({ center: [...target.geometry.coordinates], duration: 300 })
    let dragging = false
    let moved: [number, number] | null = null
    const draw = (coordinates: [number, number]) => {
      const source = map.getSource(sourceId)
      if (source?.type !== 'geojson') return
      ;(source as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: latestFeaturesRef.current.features.map((feature) =>
          feature.properties.key === editingKey
            ? { ...feature, geometry: { ...feature.geometry, coordinates } }
            : feature,
        ),
      })
    }
    const start = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const onPin = event.features?.some((feature) => feature.properties?.key === editingKey)
      const pin = latestFeaturesRef.current.features.find(
        (feature) => feature.properties.key === editingKey,
      )
      if (!onPin || !pin || pin.properties.locked) return
      event.preventDefault()
      dragging = true
      map.getCanvas().style.cursor = 'grabbing'
      map.dragPan.disable()
      // MapLibre misses a release over the page outside the canvas, so the document ends it too.
      document.addEventListener('mouseup', releaseOutside, { once: true })
    }
    const move = (event: MapMouseEvent | MapTouchEvent) => {
      if (!dragging) return
      moved = [event.lngLat.lng, event.lngLat.lat]
      draw(moved)
    }
    const stop = () => {
      dragging = false
      moved = null
      map.getCanvas().style.cursor = ''
      map.dragPan.enable()
      document.removeEventListener('mouseup', releaseOutside)
    }
    // A release reports the last spot, or the release point when the map sees it.
    function end(event?: MapMouseEvent | MapTouchEvent) {
      if (!dragging) return
      const drop = moved && event?.lngLat ? [event.lngLat.lng, event.lngLat.lat] : moved
      stop()
      if (drop) onDropRef.current?.([drop[0], drop[1]])
    }
    const releaseOutside = () => end()
    // A cancelled touch restores the map and puts the pin back where props say it is.
    const cancel = () => {
      if (!dragging) return
      stop()
      const source = map.getSource(sourceId)
      if (source?.type === 'geojson') (source as GeoJSONSource).setData(latestFeaturesRef.current)
    }
    map.on('mousedown', layerId, start)
    map.on('touchstart', layerId, start)
    map.on('mousemove', move)
    map.on('touchmove', move)
    map.on('mouseup', end)
    map.on('touchend', end)
    map.on('touchcancel', cancel)
    return () => {
      map.off('mousedown', layerId, start)
      map.off('touchstart', layerId, start)
      map.off('mousemove', move)
      map.off('touchmove', move)
      map.off('mouseup', end)
      map.off('touchend', end)
      map.off('touchcancel', cancel)
      if (dragging) stop()
    }
  }, [editingKey, status])

  useLayoutEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map || !hasPopup) return
    const card = cardRef.current
    if (!openPoint || !card) return
    const place = () => {
      const frame = map.getContainer()
      card.style.maxHeight = `${frame.clientHeight - 2 * cardPad}px`
      const { left, top } = cardPosition(
        map.project([...openPoint.coordinates]),
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: frame.clientWidth, height: frame.clientHeight },
      )
      card.style.left = `${left}px`
      card.style.top = `${top}px`
    }
    place()
    map.on('move', place)
    map.on('resize', place)
    return () => {
      map.off('move', place)
      map.off('resize', place)
    }
  }, [hasPopup, openPoint, status])

  // A pinned card takes focus so keyboard and screen reader users land on it.
  const pinnedKey = openPoint?.pinned ? openPoint.key : null
  useEffect(() => {
    if (pinnedKey) cardRef.current?.focus({ preventScroll: true })
  }, [pinnedKey])

  const hasFeatures = featureCollection.features.length > 0

  return (
    <section
      aria-label="Project coverage map"
      className={cn(
        'relative min-h-[28rem] w-full overflow-hidden rounded-sm border border-border bg-surface-subtle',
        className,
      )}
    >
      <div className="absolute inset-0" ref={containerRef} />
      <p className="sr-only">
        Interactive project map. Use the map controls or keyboard to pan and zoom, or tab to the
        list of mapped places to open a place overview. Only authorized, project-safe coordinates
        are eligible for display.
      </p>

      {status === 'loading' ? (
        <MapNotice icon={LoaderCircle} title="Loading map" />
      ) : status === 'error' ? (
        <MapNotice
          description={errorMessage}
          icon={AlertTriangle}
          onRetry={resolvedStyleUrl ? () => setRetryKey((current) => current + 1) : undefined}
          title="Map unavailable"
        />
      ) : !hasFeatures ? (
        <MapNotice
          description={emptyDescription}
          icon={MapPinned}
          title="No mapped locations available"
        />
      ) : null}
      {pickable && status === 'ready' && hasFeatures ? (
        // Shown only while a place button has focus, so the map stays clear for pointer users.
        <nav
          aria-label="Mapped places"
          className="pointer-events-none absolute bottom-3 left-3 z-20 max-h-48 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-md border border-border bg-card p-2 opacity-0 shadow-md focus-within:pointer-events-auto focus-within:opacity-100"
        >
          <ul className="space-y-1">
            {featureCollection.features.map((feature) => (
              <li key={feature.properties.key}>
                <button
                  className="text-left text-sm text-foreground underline-offset-4 hover:underline focus-visible:underline"
                  onClick={(event) => pinFromList(feature, event.currentTarget)}
                  type="button"
                >
                  {[feature.properties.title, feature.properties.label].filter(Boolean).join(': ')}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {openPoint && renderPopup && status === 'ready' ? (
        // Non-modal: the map stays usable; the browser default insets and margin are reset to place it.
        <dialog
          aria-label={`${openPoint.label} overview`}
          className="absolute bottom-auto right-auto z-10 m-0 max-w-[calc(100%-1rem)] overflow-y-auto rounded-md border border-border bg-card p-3 text-foreground shadow-md"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
          open
          ref={cardRef}
          tabIndex={-1}
        >
          {renderPopup(openPoint, close)}
        </dialog>
      ) : null}
    </section>
  )
}

const MapNotice = ({
  title,
  description,
  icon: Icon,
  onRetry,
}: {
  title: string
  description?: string
  icon: typeof MapPinned
  onRetry?: () => void
}) => (
  <div
    className={cn(
      'absolute inset-x-3 top-3 z-10 mx-auto max-w-xl rounded-xl border border-border bg-background/95 p-4 text-center shadow-sm backdrop-blur-sm',
      !onRetry && 'pointer-events-none',
    )}
  >
    <Icon aria-hidden="true" className="mx-auto h-5 w-5 text-muted-foreground" />
    <p className="mt-2 font-medium text-foreground">{title}</p>
    {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    {onRetry ? (
      <Button className="mt-3" onClick={onRetry} size="sm" type="button" variant="outline">
        Retry map
      </Button>
    ) : null}
  </div>
)
