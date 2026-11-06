// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SafeMapFeatureCollection } from '../analytics-location.utils'

const maplibre = vi.hoisted(() => ({
  instances: [] as MapMock[],
  setWorkerUrl: vi.fn(),
}))

type Handler = (event?: unknown) => void

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
  readonly easeTo = vi.fn()
  readonly setPaintProperty = vi.fn()
  readonly project = vi.fn(() => ({ x: 100, y: 100 }))
  readonly getContainer = vi.fn(() => ({ clientWidth: 600, clientHeight: 400 }))
  readonly getCanvas = vi.fn(() => ({ style: {} as Record<string, string> }))
  readonly queryRenderedFeatures = vi.fn((): unknown[] => [])

  constructor(options: Record<string, unknown>) {
    this.options = options
    maplibre.instances.push(this)
    queueMicrotask(() => this.emit(options.style === 'error-style' ? 'error' : 'load'))
  }

  on(event: string, layerOrHandler: string | Handler, layerHandler?: Handler) {
    const handler = typeof layerOrHandler === 'function' ? layerOrHandler : layerHandler
    if (!handler) return this
    const handlers = this.handlers.get(event) ?? new Set<Handler>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
    return this
  }

  off(event: string, layerOrHandler: string | Handler, layerHandler?: Handler) {
    const handler = typeof layerOrHandler === 'function' ? layerOrHandler : layerHandler
    if (handler) this.handlers.get(event)?.delete(handler)
    return this
  }

  emit(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload)
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
  setWorkerUrl: maplibre.setWorkerUrl,
}))

import {
  AnalyticsCoverageMap,
  DEFAULT_MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
  cardPosition,
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
    properties: { id, key: `${id}:0`, label: id, title: `Project ${id}` },
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

describe('cardPosition', () => {
  const card = { width: 200, height: 150 }
  const frame = { width: 600, height: 400 }

  it('puts the card above the point when it fits', () => {
    expect(cardPosition({ x: 300, y: 300 }, card, frame)).toEqual({ left: 200, top: 136 })
  })

  it('puts the card below a point near the top', () => {
    expect(cardPosition({ x: 300, y: 50 }, card, frame)).toEqual({ left: 200, top: 64 })
  })

  it('puts the card beside a point with no room above or below, on the side with room', () => {
    const tall = { width: 200, height: 300 }
    expect(cardPosition({ x: 100, y: 200 }, tall, frame)).toEqual({ left: 114, top: 50 })
    expect(cardPosition({ x: 500, y: 200 }, tall, frame)).toEqual({ left: 286, top: 50 })
  })

  it('clamps the card inside the frame at the edges', () => {
    expect(cardPosition({ x: 5, y: 300 }, card, frame)).toEqual({ left: 8, top: 136 })
    expect(cardPosition({ x: 595, y: 300 }, card, frame)).toEqual({ left: 392, top: 136 })
  })
})

describe('AnalyticsCoverageMap', () => {
  const popup = (point: { label: string }, close: () => void) => (
    <div>
      <p>{point.label} card</p>
      <button onClick={close} type="button">
        Close card
      </button>
    </div>
  )

  it('opens a place from the keyboard list as a focused dialog and returns focus on Escape', async () => {
    render(
      <AnalyticsCoverageMap
        featureCollection={features([['place-a', 121, 14.6]])}
        renderPopup={popup}
        styleUrl="test-style"
      />,
    )
    const opener = await screen.findByRole('button', { name: 'Project place-a: place-a' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'place-a overview' })
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    expect(maplibre.instances[0]?.easeTo).toHaveBeenCalledTimes(1)
    expect(maplibre.instances[0]?.setPaintProperty).toHaveBeenLastCalledWith(
      'pathways-authorized-project-location-points',
      'circle-radius',
      ['case', ['==', ['get', 'key'], 'place-a:0'], 11, 8],
    )

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('opens a tapped point and closes it from the card', async () => {
    render(
      <AnalyticsCoverageMap
        featureCollection={features([['place-b', 121, 14.6]])}
        renderPopup={popup}
        styleUrl="test-style"
      />,
    )
    await screen.findByRole('button', { name: 'Project place-b: place-b' })
    const map = maplibre.instances[0]
    map?.queryRenderedFeatures.mockReturnValue([
      {
        properties: { id: 'place-b', key: 'place-b:0', label: 'place-b' },
        geometry: { type: 'Point', coordinates: [121, 14.6] },
      },
    ])
    act(() => map?.emit('click', { point: { x: 100, y: 100 } }))

    expect(await screen.findByText('place-b card')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
    expect(screen.queryByText('place-b card')).toBeNull()
  })

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
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith(MAPLIBRE_WORKER_URL)
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
