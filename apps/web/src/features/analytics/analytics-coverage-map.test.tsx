// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    this.sources.set(id, { ...source, setData: vi.fn() })
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
  DEVELOPMENT_MAP_STYLE_URL,
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
  it('mounts with the configured style and renders valid safe GeoJSON', async () => {
    render(
      <AnalyticsCoverageMap
        points={[{ id: 'project-a', label: 'Project A', latitude: 14.6, longitude: 121 }]}
        styleUrl="https://tiles.example.test/style.json"
      />,
    )

    expect(screen.getByText('Loading map')).toBeTruthy()
    await waitFor(() => expect(maplibre.instances[0]?.addLayer).toHaveBeenCalledTimes(1))
    const map = maplibre.instances[0]
    expect(map?.options.style).toBe('https://tiles.example.test/style.json')
    expect(map?.options.center).toEqual([122, 12.5])
    expect(map?.addControl).toHaveBeenCalledTimes(1)
    expect(map?.sources.get('pathways-authorized-project-locations')?.data).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'project-a',
          properties: { id: 'project-a', label: 'Project A' },
          geometry: { type: 'Point', coordinates: [121, 14.6] },
        },
      ],
    })
  })

  it('keeps the basemap interactive while truthfully reporting no authoritative points', async () => {
    render(<AnalyticsCoverageMap points={[]} styleUrl="test-style" />)

    expect(await screen.findByText('No mapped locations available')).toBeTruthy()
    expect(
      maplibre.instances[0]?.sources.get('pathways-authorized-project-locations')?.data,
    ).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('omits invalid coordinates without failing the valid map layer', async () => {
    render(
      <AnalyticsCoverageMap
        points={[
          { id: 'valid', latitude: 14.6, longitude: 121 },
          { id: 'invalid', latitude: 91, longitude: 121 },
        ]}
        styleUrl="test-style"
      />,
    )

    expect(await screen.findByText(/1 location was omitted/)).toBeTruthy()
    const source = maplibre.instances[0]?.sources.get('pathways-authorized-project-locations')
    expect((source?.data as { features: unknown[] }).features).toHaveLength(1)
  })

  it('contains style failure inside the map surface and retries without reloading the page', async () => {
    render(<AnalyticsCoverageMap styleUrl="error-style" />)

    expect(await screen.findByText('Map unavailable')).toBeTruthy()
    expect(screen.getByText(/Other pages are unaffected/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }))
    await waitFor(() => expect(maplibre.instances).toHaveLength(2))
    expect(maplibre.instances[0]?.remove).toHaveBeenCalledTimes(1)
  })

  it('removes the MapLibre instance and resize observer on cleanup', async () => {
    const rendered = render(<AnalyticsCoverageMap styleUrl="test-style" />)
    await screen.findByText('No mapped locations available')
    const map = maplibre.instances[0]

    rendered.unmount()

    expect(map?.remove).toHaveBeenCalledTimes(1)
    expect(resizeObserverInstances[0]?.disconnect).toHaveBeenCalledTimes(1)
  })

  it('uses the official demo style only in development and never as production fallback', () => {
    expect(resolveMapStyleUrl(undefined, 'development')).toBe(DEVELOPMENT_MAP_STYLE_URL)
    expect(resolveMapStyleUrl(undefined, 'production')).toBeNull()
    expect(resolveMapStyleUrl(' https://tiles.example.test/style.json ', 'production')).toBe(
      'https://tiles.example.test/style.json',
    )
  })
})
