'use client'

import { AlertTriangle, LoaderCircle, MapPinned } from 'lucide-react'
import type {
  GeoJSONSource,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  MapLibreMap,
  MapMouseEvent,
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

export const AnalyticsCoverageMap = ({
  featureCollection = EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  styleUrl,
  initialCenter = defaultCenter,
  initialZoom = defaultZoom,
  className,
  renderPopup,
  emptyDescription = 'No authoritative project coordinates are available. Text-only implementation areas remain unresolved and unplotted.',
}: AnalyticsCoverageMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const latestFeaturesRef = useRef<SafeMapFeatureCollection>(featureCollection)
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
  const hasPopup = Boolean(renderPopup)

  // Closing returns focus to the place button that opened the card, if any.
  const close = () => {
    setOpenPoint(null)
    openerRef.current?.focus()
    openerRef.current = null
  }
  const pinFromList = (feature: SafeMapFeature, opener: HTMLElement) => {
    openerRef.current = opener
    setOpenPoint(featurePoint(feature))
    if (mapRef.current) centerLow(mapRef.current, feature.geometry.coordinates)
  }

  latestFeaturesRef.current = featureCollection

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
            latestFeaturesRef.current,
            [centerLongitude, centerLatitude],
            initialZoom,
          )
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
          if (point && map) centerLow(map, point.coordinates)
        }
        map.on('style.load', handleLoad)
        map.on('load', handleLoad)
        map.on('error', handleError)
        if (hasPopup) {
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
  }, [centerLatitude, centerLongitude, hasPopup, initialZoom, resolvedStyleUrl, retryKey])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(sourceId)
    if (map && source?.type === 'geojson') {
      ;(source as GeoJSONSource).setData(featureCollection)
      syncMapCamera(map, featureCollection, [centerLongitude, centerLatitude], initialZoom)
    }
  }, [centerLatitude, centerLongitude, featureCollection, initialZoom])

  useLayoutEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map || !hasPopup) return
    map.setPaintProperty(layerId, 'circle-radius', [
      'case',
      ['==', ['get', 'key'], openPoint?.key ?? ''],
      11,
      8,
    ])
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
      {hasPopup && status === 'ready' && hasFeatures ? (
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
