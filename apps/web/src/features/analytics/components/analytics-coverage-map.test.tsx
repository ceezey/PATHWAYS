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
  readonly setLayoutProperty = vi.fn()
  readonly dragPan = { enable: vi.fn(), disable: vi.fn() }
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
  points: readonly [id: string, longitude: number, latitude: number, locked?: boolean][],
): SafeMapFeatureCollection => ({
  type: 'FeatureCollection',
  features: points.map(([id, longitude, latitude, locked]) => ({
    type: 'Feature',
    id,
    properties: { id, key: `${id}:0`, label: id, title: `Project ${id}`, locked },
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

  describe('selection', () => {
    const layer = 'pathways-authorized-project-location-points'

    it('highlights the selected project and dims the others', async () => {
      render(
        <AnalyticsCoverageMap
          featureCollection={features([
            ['a', 121, 14],
            ['b', 122, 15],
          ])}
          selectedId="a"
          styleUrl="test-style"
        />,
      )
      await waitFor(() =>
        expect(maplibre.instances[0]?.setPaintProperty).toHaveBeenCalledWith(
          layer,
          'circle-radius',
          ['case', ['==', ['get', 'id'], 'a'], 9, 6],
        ),
      )
      const map = maplibre.instances[0]
      expect(map?.setPaintProperty).toHaveBeenCalledWith(layer, 'circle-color', [
        'case',
        ['==', ['get', 'id'], 'a'],
        '#005EBF',
        '#526779',
      ])
      expect(map?.setPaintProperty).toHaveBeenCalledWith(layer, 'circle-opacity', [
        'case',
        ['==', ['get', 'id'], 'a'],
        1,
        0.45,
      ])
      expect(map?.setLayoutProperty).toHaveBeenCalledWith(layer, 'circle-sort-key', [
        'case',
        ['==', ['get', 'id'], 'a'],
        1,
        0,
      ])
    })

    it('fits the camera to the selected project when the selection changes', async () => {
      const collection = features([
        ['a', 121, 14],
        ['b', 125, 18],
      ])
      const rendered = render(
        <AnalyticsCoverageMap featureCollection={collection} styleUrl="test-style" />,
      )
      await waitFor(() => expect(maplibre.instances[0]?.addLayer).toHaveBeenCalled())
      const map = maplibre.instances[0]

      rendered.rerender(
        <AnalyticsCoverageMap
          featureCollection={collection}
          selectedId="b"
          styleUrl="test-style"
        />,
      )

      await waitFor(() =>
        expect(map?.jumpTo).toHaveBeenLastCalledWith({ center: [125, 18], zoom: 12 }),
      )
    })

    it('keeps the plain look when nothing is selected', async () => {
      render(
        <AnalyticsCoverageMap
          featureCollection={features([['a', 121, 14]])}
          styleUrl="test-style"
        />,
      )
      await waitFor(() => expect(maplibre.instances[0]?.addLayer).toHaveBeenCalled())
      const map = maplibre.instances[0]

      expect(JSON.stringify(map?.setPaintProperty.mock.calls)).not.toContain('"id"')
      expect(JSON.stringify(map?.setLayoutProperty.mock.calls)).not.toContain('"id"')
    })
  })

  describe('editing', () => {
    const pin = (key: string) => ({ features: [{ properties: { key } }], preventDefault: vi.fn() })
    const at = (lng: number, lat: number) => ({ lngLat: { lng, lat } })
    const mountEditing = async (
      collection: SafeMapFeatureCollection,
      key: string,
      onDrop = vi.fn(),
    ) => {
      const rendered = render(
        <AnalyticsCoverageMap
          editing={{ key, onDrop }}
          featureCollection={collection}
          styleUrl="test-style"
        />,
      )
      await waitFor(() => expect(maplibre.instances[0]?.handlers.get('mousedown')?.size).toBe(1))
      const map = maplibre.instances[0] as MapMock
      return { map, onDrop, rendered }
    }

    it('drags the editing pin and reports the release coordinates', async () => {
      const { map, onDrop } = await mountEditing(features([['a', 121, 14]]), 'a:0')
      const source = map.sources.get('pathways-authorized-project-locations')

      act(() => map.emit('mousedown', pin('a:0')))
      expect(map.dragPan.disable).toHaveBeenCalledTimes(1)
      act(() => map.emit('mousemove', at(122, 15)))
      expect(source?.setData).toHaveBeenLastCalledWith(
        expect.objectContaining({
          features: [
            expect.objectContaining({ geometry: { type: 'Point', coordinates: [122, 15] } }),
          ],
        }),
      )
      act(() => map.emit('mouseup', at(123, 16)))

      expect(onDrop).toHaveBeenCalledWith([123, 16])
      expect(map.dragPan.enable).toHaveBeenCalledTimes(1)
      act(() => map.emit('mousemove', at(130, 20)))
      expect(onDrop).toHaveBeenCalledTimes(1)
    })

    it('ignores a press on another pin', async () => {
      const { map, onDrop } = await mountEditing(
        features([
          ['a', 121, 14],
          ['b', 122, 15],
        ]),
        'a:0',
      )

      act(() => map.emit('mousedown', pin('b:0')))
      act(() => map.emit('mousemove', at(122, 15)))
      act(() => map.emit('mouseup', at(122, 15)))

      expect(map.dragPan.disable).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
    })

    it('does not drag a locked pin even when it is the editing key', async () => {
      const { map, onDrop } = await mountEditing(features([['a', 121, 14, true]]), 'a:0')

      act(() => map.emit('mousedown', pin('a:0')))
      act(() => map.emit('mousemove', at(122, 15)))
      act(() => map.emit('mouseup', at(122, 15)))

      expect(map.dragPan.disable).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
    })

    it('does not save a press that never moved', async () => {
      const { map, onDrop } = await mountEditing(features([['a', 121, 14]]), 'a:0')

      act(() => map.emit('mousedown', pin('a:0')))
      act(() => map.emit('mouseup', at(121, 14)))

      expect(onDrop).not.toHaveBeenCalled()
      expect(map.dragPan.enable).toHaveBeenCalledTimes(1)
    })

    it('drags with touch', async () => {
      const { map, onDrop } = await mountEditing(features([['a', 121, 14]]), 'a:0')

      act(() => map.emit('touchstart', pin('a:0')))
      act(() => map.emit('touchmove', at(122, 15)))
      act(() => map.emit('touchend', at(122, 15)))

      expect(onDrop).toHaveBeenCalledWith([122, 15])
    })

    it('redraws every pin from props when editing ends', async () => {
      const collection = features([['a', 121, 14]])
      const { map, rendered } = await mountEditing(collection, 'a:0')
      const source = map.sources.get('pathways-authorized-project-locations')

      act(() => map.emit('mousedown', pin('a:0')))
      act(() => map.emit('mousemove', at(125, 18)))
      rendered.rerender(
        <AnalyticsCoverageMap featureCollection={collection} styleUrl="test-style" />,
      )

      await waitFor(() => expect(source?.setData).toHaveBeenLastCalledWith(collection))
      expect(map.dragPan.enable).toHaveBeenCalledTimes(1)
    })
  })
})
