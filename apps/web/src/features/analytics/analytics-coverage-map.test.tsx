// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeMapFeatureCollection } from './analytics-location-utils'

const maplibre = vi.hoisted(() => ({
  instances: [] as MapMock[],
}))

type Handler = () => void

class MapMock {
  readonly options: Record<string, unknown>
  readonly handlers = new globalThis.Map<string, Set<Handler>>()
  readonly sources = new globalThis.Map<
    string,
    { type: string; data: unknown; setData: ReturnType<typeof vi.fn> }
  >()
  readonly addControl = vi.fn()
  readonly addLayer = vi.fn()
  readonly fitBounds = vi.fn()
  readonly jumpTo = vi.fn()
  readonly remove = vi.fn()
  readonly resize = vi.fn()

  constructor(options: Record<string, unknown>) {
    this.options = options
    maplibre.instances.push(this)
    queueMicrotask(() => this.emit(options.style === 'error-style' ? 'error' : 'load'))
  }

  on(event: string, handler: Handler) {
    const handlers = this.handlers.get(event) ?? new Set<Handler>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
    return this
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  emit(event: string) {
    for (const handler of this.handlers.get(event) ?? []) handler()
  }

  addSource(id: string, source: { type: string; data: unknown }) {
    const record = {
      ...source,
      setData: vi.fn((data: unknown) => {
        record.data = data
      }),
    }
    this.sources.set(id, record)
    return this
  }

  getSource(id: string) {
    return this.sources.get(id)
  }
}

class NavigationControlMock {}

vi.mock('maplibre-gl', () => ({
  Map: MapMock,
  NavigationControl: NavigationControlMock,
}))

import {
  AnalyticsCoverageMap,
  DEFAULT_MAP_STYLE_URL,
  resolveMapStyleUrl,
} from './analytics-coverage-map'

const resizeObserverInstances: ResizeObserverMock[] = []

class ResizeObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()

  constructor() {
    resizeObserverInstances.push(this)
  }
}

const features = (
  points: readonly [id: string, longitude: number, latitude: number][],
): SafeMapFeatureCollection => ({
  type: 'FeatureCollection',
  features: points.map(([id, longitude, latitude]) => ({
    type: 'Feature',
    id,
    properties: { id, label: id },
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
  })),
})

beforeEach(() => {
  maplibre.instances.length = 0
  resizeObserverInstances.length = 0
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AnalyticsCoverageMap', () => {
  it('mounts normalized GeoJSON once with navigation controls and a one-point camera', async () => {
    render(
      <AnalyticsCoverageMap
        featureCollection={features([['project-a', 121, 14.6]])}
        styleUrl="https://tiles.example.test/style.json"
      />,
    )

    expect(screen.getByText('Loading map')).toBeTruthy()
    await waitFor(() => expect(maplibre.instances[0]?.addLayer).toHaveBeenCalledTimes(1))
    const map = maplibre.instances[0]
    expect(map?.options.style).toBe('https://tiles.example.test/style.json')
    expect(map?.options.center).toEqual([122, 12.5])
    expect(map?.addControl).toHaveBeenCalledTimes(1)
    expect(map?.sources.get('pathways-authorized-project-locations')?.data).toEqual(
      features([['project-a', 121, 14.6]]),
    )
    expect(map?.jumpTo).toHaveBeenLastCalledWith({ center: [121, 14.6], zoom: 12 })
  })

  it('keeps the basemap interactive with an empty source and neutral Philippines camera', async () => {
    render(<AnalyticsCoverageMap featureCollection={features([])} styleUrl="test-style" />)

    expect(await screen.findByText('No mapped locations available')).toBeTruthy()
    const map = maplibre.instances[0]
    expect(map?.sources.get('pathways-authorized-project-locations')?.data).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
    expect(map?.jumpTo).toHaveBeenLastCalledWith({ center: [122, 12.5], zoom: 4.5 })
  })

  it('updates the source and camera without recreating the map', async () => {
    const rendered = render(
      <AnalyticsCoverageMap featureCollection={features([])} styleUrl="test-style" />,
    )
    await screen.findByText('No mapped locations available')
    const map = maplibre.instances[0]
    const source = map?.sources.get('pathways-authorized-project-locations')

    rendered.rerender(
      <AnalyticsCoverageMap
        featureCollection={features([
          ['west', 120, 10],
          ['east', 125, 15],
        ])}
        styleUrl="test-style"
      />,
    )

    await waitFor(() => expect(source?.setData).toHaveBeenCalledTimes(1))
    expect(maplibre.instances).toHaveLength(1)
    expect(map?.fitBounds).toHaveBeenLastCalledWith(
      [
        [120, 10],
        [125, 15],
      ],
      { duration: 0, maxZoom: 12, padding: 48 },
    )

    rendered.rerender(
      <AnalyticsCoverageMap featureCollection={features([])} styleUrl="test-style" />,
    )
    await waitFor(() => expect(source?.setData).toHaveBeenCalledTimes(2))
    expect(maplibre.instances).toHaveLength(1)
    expect(map?.jumpTo).toHaveBeenLastCalledWith({ center: [122, 12.5], zoom: 4.5 })
  })

  it('contains style failure inside the map surface and retries only the renderer', async () => {
    render(<AnalyticsCoverageMap styleUrl="error-style" />)

    expect(await screen.findByText('Map unavailable')).toBeTruthy()
    expect(screen.getByText(/configured map style could not be loaded/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }))
    await waitFor(() => expect(maplibre.instances).toHaveLength(2))
    expect(maplibre.instances[0]?.remove).toHaveBeenCalledTimes(1)
  })

  it('reports a tile error after load without affecting the rest of the page', async () => {
    render(<AnalyticsCoverageMap styleUrl="test-style" />)
    await screen.findByText('No mapped locations available')

    maplibre.instances[0]?.emit('error')

    expect(await screen.findByText('Map unavailable')).toBeTruthy()
    expect(screen.getByText(/Basemap tiles could not be loaded/)).toBeTruthy()
  })

  it('removes the MapLibre instance and resize observer on cleanup', async () => {
    const rendered = render(<AnalyticsCoverageMap styleUrl="test-style" />)
    await screen.findByText('No mapped locations available')
    const map = maplibre.instances[0]

    rendered.unmount()

    expect(map?.remove).toHaveBeenCalledTimes(1)
    expect(resizeObserverInstances[0]?.disconnect).toHaveBeenCalledTimes(1)
  })

  it('uses a tokenless default style in every environment and preserves an override', () => {
    expect(resolveMapStyleUrl(undefined)).toBe(DEFAULT_MAP_STYLE_URL)
    expect(resolveMapStyleUrl(' https://tiles.example.test/style.json ')).toBe(
      'https://tiles.example.test/style.json',
    )
  })
})
