/* @vitest-environment jsdom */

import type { ProjectMap, ProjectMapProject } from '@pathways/shared'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type ReactNode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MapProps = {
  selectedId?: string
  editing?: { key: string; onDrop: (coordinates: [number, number]) => void }
  onPick?: (point: { id: string; key: string } | null) => void
  renderPopup?: (point: unknown, close: () => void) => ReactNode
}

const state = vi.hoisted(() => ({
  map: undefined as unknown,
  data: undefined as unknown,
  permissions: ['projects.read', 'projects.update'],
  refetch: vi.fn(),
  saveMapPin: vi.fn(),
}))
const lastMap = () => state.map as MapProps

vi.mock('@/lib/api/projects', () => ({
  projectsClient: { saveMapPin: state.saveMapPin, resetMapPin: vi.fn() },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { permissions: state.permissions } }),
}))
vi.mock('@/lib/rbac/policy', () => ({
  principalHasAtomicPermission: (profile: { permissions?: string[] } | null, permission: string) =>
    Boolean(profile?.permissions?.includes(permission)),
}))
vi.mock('../hooks/use-project-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-project-map')>()),
  useProjectMap: () => ({ data: state.data, isError: false, refetch: state.refetch }),
}))
// A stub keeps MapLibre out; it records its props and offers a button per pin.
vi.mock('./analytics-coverage-map', () => ({
  AnalyticsCoverageMap: (props: MapProps) => {
    state.map = props
    const [open, setOpen] = useState<{ id: string; key: string } | null>(null)
    return (
      <div data-testid="map">
        {Object.entries(ids).map(([name, id]) => (
          <button
            key={id}
            onClick={() => {
              const point = { id, key: `${id}:0` }
              props.onPick?.(point)
              setOpen(point)
            }}
            type="button"
          >
            Pin {name}
          </button>
        ))}
        {open
          ? props.renderPopup?.(open, () => {
              props.onPick?.(null)
              setOpen(null)
            })
          : null}
      </div>
    )
  },
}))

const ids = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222' }
const place = (locked: boolean) => ({
  name: 'Borongan',
  province: 'Eastern Samar',
  longitude: 125.4,
  latitude: 11.6,
  saved: false,
  locked,
  reach: null,
})
const projectOf = (id: string, title: string, locked = false): ProjectMapProject => ({
  id,
  code: title.slice(0, 3).toUpperCase(),
  title,
  status: 'ONGOING',
  implementationArea: 'Borongan City, Eastern Samar',
  places: [place(locked)],
  overview: null,
  sadddSex: null,
  sadddDisability: null,
})
const mapOf = (...projects: ProjectMapProject[]) =>
  ({ projects, unmappedCount: 0 }) as unknown as ProjectMap

import { PathwaysClientError } from '@/lib/api/core/request'

import { ProjectCoverageMapPanel } from './project-coverage-map-panel'

const scrollIntoView = vi.fn()
const onSelectProject = vi.fn()
const renderAnalytics = () =>
  render(
    <ProjectCoverageMapPanel
      mode="analytics"
      onSelectProject={onSelectProject}
      selectedProjectId={ids.a}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = ['projects.read', 'projects.update']
  state.data = mapOf(projectOf(ids.a, 'Alpha'), projectOf(ids.b, 'Bravo'))
  state.saveMapPin.mockResolvedValue(undefined)
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView
})
afterEach(cleanup)

describe('ProjectCoverageMapPanel in analytics mode', () => {
  it('shows the side panel for the selected project and highlights it on the map', () => {
    renderAnalytics()
    expect(screen.getByRole('complementary', { name: 'Alpha details' })).toBeTruthy()
    expect(lastMap().selectedId).toBe(ids.a)
  })

  it('shows the place card with the project name and SADDD split over a pin', () => {
    const count = (value: number) => ({
      state: 'AVAILABLE' as const,
      value: String(value),
      reason: null,
    })
    const reached = {
      ...projectOf(ids.b, 'Bravo'),
      places: [
        {
          ...place(false),
          name: 'Llorente',
          reach: {
            total: count(150),
            sex: [
              { key: 'male', label: 'Male', metric: count(24) },
              { key: 'female', label: 'Female', metric: count(126) },
            ],
            disability: count(14),
          },
        },
      ],
    } as ProjectMapProject
    state.data = mapOf(projectOf(ids.a, 'Alpha'), reached)
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Pin b' }))

    const card = screen.getByRole('button', { name: 'Close place overview' }).closest('div')
      ?.parentElement as HTMLElement
    expect(within(card).getByText('Llorente')).toBeTruthy()
    expect(within(card).getByText('Bravo')).toBeTruthy()
    expect(within(card).getByText('Male 24 · Female 126 · With disability 14')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close place overview' }))
    expect(screen.queryByRole('button', { name: 'Close place overview' })).toBeNull()
  })

  it('hides the place card while a pin is being moved', () => {
    renderAnalytics()
    expect(lastMap().renderPopup).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }))
    expect(lastMap().renderPopup).toBeUndefined()
  })

  it('previews the project of a clicked pin and switches the filter on request', () => {
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Pin b' }))
    expect(screen.getByRole('complementary', { name: 'Bravo details' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Move pin' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Switch filter to this project' }))
    expect(onSelectProject).toHaveBeenCalledWith(ids.b)
    expect(screen.getByRole('complementary', { name: 'Alpha details' })).toBeTruthy()
  })

  it('shows the side panel only while a pin is picked when no project is selected', () => {
    render(
      <ProjectCoverageMapPanel
        mode="analytics"
        onSelectProject={onSelectProject}
        selectedProjectId=""
      />,
    )
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pin b' }))
    expect(screen.getByRole('complementary', { name: 'Bravo details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close place overview' }))
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('keeps the filtered project panel when the card closes', () => {
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Pin b' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close place overview' }))
    expect(screen.getByRole('complementary', { name: 'Alpha details' })).toBeTruthy()
  })

  it('scrolls the place row into view when a selected-project pin is clicked', () => {
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Pin a' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('makes only the moved pin draggable and fills the inputs from a drop', () => {
    renderAnalytics()
    expect(lastMap().editing).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }))
    expect(lastMap().editing?.key).toBe(`${ids.a}:0`)

    act(() => lastMap().editing?.onDrop([125.123456789, 11.987654321]))
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('125.12346')
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('11.98765')
  })

  it('never makes a locked pin draggable', () => {
    state.data = mapOf(projectOf(ids.a, 'Alpha', true), projectOf(ids.b, 'Bravo'))
    renderAnalytics()
    const move = screen.getByRole('button', { name: 'Move pin' })
    expect(move.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(move)
    expect(lastMap().editing).toBeUndefined()
  })

  it('snaps the pin back by ending the edit when the server rejects a drop', async () => {
    state.saveMapPin.mockRejectedValue(new PathwaysClientError('Rejected.', 'invalid', [], 400))
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Move pin' }))
    act(() => lastMap().editing?.onDrop([125.5, 11.7]))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    await waitFor(() => expect(lastMap().editing).toBeUndefined())
    expect(screen.getByText('Pick a spot inside the Philippines map area.')).toBeTruthy()
  })

  it('clears a pin error when another project is shown', async () => {
    state.saveMapPin.mockRejectedValue(new PathwaysClientError('Locked.', 'invalid', [], 409))
    renderAnalytics()
    fireEvent.click(screen.getByRole('button', { name: 'Lock pin' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pin b' }))
    expect(screen.getByRole('complementary', { name: 'Bravo details' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows no edit buttons without the update permission', () => {
    state.permissions = ['projects.read']
    renderAnalytics()
    expect(screen.queryByRole('button', { name: 'Move pin' })).toBeNull()
  })
})

describe('ProjectCoverageMapPanel in dashboard mode', () => {
  it('keeps the floating card and links it to the Analytics map', () => {
    render(<ProjectCoverageMapPanel mode="dashboard" />)
    expect(screen.queryByRole('complementary', { name: 'Alpha details' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pin a' }))
    expect(screen.getByRole('link', { name: 'Open in Analytics' }).getAttribute('href')).toBe(
      `/analytics?view=map&project=${ids.a}`,
    )
  })
})
