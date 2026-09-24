'use client'

import { AlertTriangle, LoaderCircle, MapPinned } from 'lucide-react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  EMPTY_SAFE_MAP_FEATURE_COLLECTION,
  type SafeMapFeatureCollection,
} from './analytics-location-utils'

const sourceId = 'pathways-authorized-project-locations'
const layerId = 'pathways-authorized-project-location-points'

const defaultCenter: readonly [longitude: number, latitude: number] = [122, 12.5]
const defaultZoom = 4.5
const singleFeatureZoom = 12

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export const resolveMapStyleUrl = (configuredStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL) =>
  configuredStyleUrl?.trim() || DEFAULT_MAP_STYLE_URL

type AnalyticsCoverageMapProps = Readonly<{
  featureCollection?: SafeMapFeatureCollection
  styleUrl?: string | null
  initialCenter?: readonly [longitude: number, latitude: number]
  initialZoom?: number
  className?: string
}>

type MapStatus = 'loading' | 'ready' | 'error'

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
      .then(({ Map: MapLibre, NavigationControl }) => {
        if (cancelled) return

        map = new MapLibre({
          container,
          style: resolvedStyleUrl,
          center: [centerLongitude, centerLatitude],
          zoom: initialZoom,
        })
        mapRef.current = map

        handleLoad = () => {
          if (cancelled || !map) return
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
              'circle-color': '#0077b6',
              'circle-radius': 7,
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

        map.on('load', handleLoad)
        map.on('error', handleError)
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
      if (map && handleLoad) map.off('load', handleLoad)
      if (map && handleError) map.off('error', handleError)
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
      delete container.dataset.mapAttempt
    }
  }, [centerLatitude, centerLongitude, initialZoom, resolvedStyleUrl, retryKey])

  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(sourceId)
    if (map && source?.type === 'geojson') {
      ;(source as GeoJSONSource).setData(featureCollection)
      syncMapCamera(map, featureCollection, [centerLongitude, centerLatitude], initialZoom)
    }
  }, [centerLatitude, centerLongitude, featureCollection, initialZoom])

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
        Interactive project map. Use the map controls or keyboard to pan and zoom. Only authorized,
        project-safe coordinates are eligible for display.
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
          description="No authoritative project coordinates are available. Text-only implementation areas remain unresolved and unplotted."
          icon={MapPinned}
          title="No mapped locations available"
        />
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
      'absolute inset-x-3 top-3 z-10 mx-auto max-w-xl rounded-sm border border-border bg-background/95 p-4 text-center shadow-sm backdrop-blur-sm',
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
