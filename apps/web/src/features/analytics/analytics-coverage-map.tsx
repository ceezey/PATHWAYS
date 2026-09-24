'use client'

import { AlertTriangle, LoaderCircle, MapPinned } from 'lucide-react'
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  type AuthorizedMapPoint,
  type SafeMapFeatureCollection,
  toSafeMapFeatureCollection,
} from './analytics-location-utils'

const sourceId = 'pathways-authorized-project-locations'
const layerId = 'pathways-authorized-project-location-points'

const defaultCenter: readonly [longitude: number, latitude: number] = [122, 12.5]
const defaultZoom = 4.5

export const DEVELOPMENT_MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

export const resolveMapStyleUrl = (
  configuredStyleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  environment = process.env.NODE_ENV,
) => {
  const configured = configuredStyleUrl?.trim()
  if (configured) return configured
  return environment === 'development' ? DEVELOPMENT_MAP_STYLE_URL : null
}

type AnalyticsCoverageMapProps = Readonly<{
  points?: readonly AuthorizedMapPoint[]
  styleUrl?: string | null
  initialCenter?: readonly [longitude: number, latitude: number]
  initialZoom?: number
  className?: string
}>

type MapStatus = 'loading' | 'ready' | 'error'

export const AnalyticsCoverageMap = ({
  points = [],
  styleUrl,
  initialCenter = defaultCenter,
  initialZoom = defaultZoom,
  className,
}: AnalyticsCoverageMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const featureResult = useMemo(() => toSafeMapFeatureCollection(points), [points])
  const latestFeaturesRef = useRef<SafeMapFeatureCollection>(featureResult.featureCollection)
  const resolvedStyleUrl = styleUrl === undefined ? resolveMapStyleUrl() : styleUrl?.trim() || null
  const [status, setStatus] = useState<MapStatus>(resolvedStyleUrl ? 'loading' : 'error')
  const [errorMessage, setErrorMessage] = useState(
    resolvedStyleUrl
      ? ''
      : 'Map style is not configured. Set NEXT_PUBLIC_MAP_STYLE_URL for this environment.',
  )
  const [retryKey, setRetryKey] = useState(0)
  const centerLongitude = initialCenter[0]
  const centerLatitude = initialCenter[1]

  latestFeaturesRef.current = featureResult.featureCollection

  useEffect(() => {
    const container = containerRef.current
    if (!container || !resolvedStyleUrl) {
      setStatus('error')
      setErrorMessage(
        'Map style is not configured. Set NEXT_PUBLIC_MAP_STYLE_URL for this environment.',
      )
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
          map.resize()
          setStatus('ready')
        }
        handleError = () => {
          if (cancelled || styleLoaded) return
          setStatus('error')
          setErrorMessage(
            'The configured map style could not be loaded. Other pages are unaffected.',
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
    const source = mapRef.current?.getSource(sourceId)
    if (source?.type === 'geojson') {
      ;(source as GeoJSONSource).setData(featureResult.featureCollection)
    }
  }, [featureResult.featureCollection])

  const hasFeatures = featureResult.featureCollection.features.length > 0

  return (
    <section
      aria-label="Authorized project location map"
      className={cn(
        'relative min-h-[28rem] overflow-hidden rounded-sm border border-border bg-surface-subtle',
        className,
      )}
    >
      <div className="absolute inset-0" ref={containerRef} />
      <p className="sr-only">
        Interactive project map. Use the map controls to pan and zoom. Only authorized, project-safe
        coordinates are eligible for display.
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

      {featureResult.rejectedPointCount > 0 ? (
        <output className="absolute bottom-3 left-3 right-3 z-10 rounded-sm border border-warning/30 bg-warning-subtle p-3 text-sm text-warning shadow-sm sm:right-auto sm:max-w-md">
          {featureResult.rejectedPointCount}{' '}
          {featureResult.rejectedPointCount === 1 ? 'location was' : 'locations were'} omitted
          because the coordinates or safe label were invalid.
        </output>
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
