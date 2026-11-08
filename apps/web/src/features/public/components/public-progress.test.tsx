/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PublicAnalyticsResponse } from '@pathways/shared'

import { PublicProgress } from './public-progress'

vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

class MapMock {
  readonly handlers = new Map<string, () => void>()
  readonly addControl = vi.fn()
  readonly addLayer = vi.fn()
  readonly addSource = vi.fn()
  readonly fitBounds = vi.fn()
  readonly jumpTo = vi.fn()
  readonly remove = vi.fn()
  readonly resize = vi.fn()
  readonly easeTo = vi.fn()
  readonly setPaintProperty = vi.fn()
  readonly setLayoutProperty = vi.fn()
  readonly project = vi.fn(() => ({ x: 100, y: 100 }))
  readonly getContainer = vi.fn(() => ({ clientWidth: 600, clientHeight: 400 }))
  readonly getCanvas = vi.fn(() => ({ style: {} }))
  readonly getSource = vi.fn()
  readonly off = vi.fn()
  constructor() {
    queueMicrotask(() => this.handlers.get('load')?.())
  }
  on(event: string, handler: () => void) {
    this.handlers.set(event, handler)
  }
}
vi.mock('maplibre-gl', () => ({
  Map: MapMock,
  NavigationControl: class {},
  setWorkerUrl: vi.fn(),
}))

const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
const bucket = (label: string, value: string) => ({ key: label, label, metric: cell(value) })
const projectId = '10000000-0000-4000-8000-000000000001'

const data = {
  kpi: {
    view: 'kpi',
    indicators: [{ id: 'i1', name: 'Trainees certified', progress: cell('40') }],
  },
  saddd: {
    view: 'saddd',
    total: cell('30'),
    sex: [bucket('Female', '20'), bucket('Male', '10')],
    age: [bucket('18-24', '30')],
    disability: [bucket('With disability', '3')],
  },
  participation: {
    view: 'participation',
    projectId,
    total: 12,
    totalSuppressed: false,
    byActivity: [],
    byMonth: [],
    byAttendanceStatus: [],
  },
  timeline: {
    view: 'timeline',
    elapsedPercent: cell('50'),
    activityCompletionPercent: cell('25'),
    activityOverdueCount: cell('2'),
  },
  map: {
    view: 'map',
    places: [
      {
        name: 'Tacloban City',
        province: 'Leyte',
        longitude: 125,
        latitude: 11.2,
        reach: { total: cell('15'), sex: [], disability: cell('1') },
      },
    ],
  },
} as unknown as Record<string, PublicAnalyticsResponse>

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('public progress section', () => {
  it('shows the views in snapshot order under Project progress with a Live marker', () => {
    render(<PublicProgress views={['timeline', 'kpi', 'participation']} data={data} />)
    expect(screen.getByRole('heading', { name: 'Project progress' })).toBeTruthy()
    expect(screen.getByText('Live')).toBeTruthy()
    const titles = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(titles).toEqual(['Project progress', 'Timeline', 'Indicator progress', 'Participation'])
    expect(screen.getByText('Activity completion')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
  })

  it('draws the three SADDD breakdowns with their accessible tables', () => {
    render(<PublicProgress views={['saddd']} data={data} />)
    for (const name of ['Sex values', 'Age values', 'Disability values'])
      expect(screen.getByRole('table', { name, hidden: true })).toBeTruthy()
  })

  it('shows Data unavailable only on the failed view and still draws the others', () => {
    render(<PublicProgress views={['kpi', 'saddd', 'timeline']} data={{ ...data, saddd: null }} />)
    expect(screen.getAllByText('Data unavailable')).toHaveLength(1)
    const saddd = screen.getByRole('heading', { name: 'People reached' }).closest('section')
    expect(within(saddd as HTMLElement).getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Elapsed')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Indicator progress' })).toBeTruthy()
  })

  it('treats a view that was not loaded as unavailable', () => {
    render(<PublicProgress views={['kpi']} data={{}} />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
  })

  it('shows the placeholder for each view and makes no request', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<PublicProgress views={['kpi', 'map']} placeholder />)
    expect(screen.getAllByText('Live chart appears here once published')).toHaveLength(2)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('renders nothing when no view is chosen', () => {
    render(<PublicProgress views={[]} data={data} />)
    expect(screen.queryByText('Project progress')).toBeNull()
  })

  it('opens a map popup with the place name and reach and never a budget', async () => {
    render(<PublicProgress views={['map']} data={data} />)
    fireEvent.click(await screen.findByRole('button', { name: /Tacloban City/ }))
    const popup = await waitFor(() => screen.getByRole('dialog'))
    expect(within(popup).getByText('Tacloban City')).toBeTruthy()
    expect(within(popup).getByText('15')).toBeTruthy()
    expect(screen.queryByText(/budget/i)).toBeNull()
  })
})
