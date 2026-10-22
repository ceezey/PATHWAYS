/* @vitest-environment jsdom */

import type { ProjectMapProject } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectMapCard } from './project-map-card'

const cell = (value: string) =>
  value === '0'
    ? { state: 'ZERO' as const, value, reason: null }
    : { state: 'AVAILABLE' as const, value, reason: null }
const place = (
  name: string,
  reach: ProjectMapProject['places'][number]['reach'],
  province = 'Eastern Samar',
) => ({
  name,
  province,
  longitude: 125.4,
  latitude: 11.6,
  reach,
})
const borongan = place('Borongan', {
  total: cell('5'),
  sex: [
    { key: 'MALE', label: 'Male', metric: cell('0') },
    { key: 'FEMALE', label: 'Female', metric: cell('5') },
  ],
  disability: cell('2'),
})
const guiuan = place('Guiuan', null)
const project: ProjectMapProject = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SSG-ES',
  title: 'Safe Schools for Girls',
  status: 'ONGOING',
  implementationArea: 'Borongan City and Guiuan, Eastern Samar',
  places: [borongan, guiuan],
  overview: null,
  sadddSex: null,
  sadddDisability: null,
}

afterEach(cleanup)

describe('ProjectMapCard', () => {
  it('shows the tapped place reach with only the groups that hold people', () => {
    render(<ProjectMapCard onClose={vi.fn()} place={borongan} project={project} />)
    expect(screen.getByText('Reached in Borongan (SADDD)')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('Female 5 · With disability 2')).toBeTruthy()
    expect(screen.queryByText(/Male 0/)).toBeNull()
  })

  it('leaves out every row the role cannot read', () => {
    render(<ProjectMapCard onClose={vi.fn()} place={guiuan} project={project} />)
    expect(screen.queryByText(/Reached in Guiuan/)).toBeNull()
    expect(screen.queryByText('Whole project')).toBeNull()
    expect(screen.queryByText(/Not available for your role/)).toBeNull()
    expect(screen.getByText('Open project')).toBeTruthy()
  })

  it('shows each same-name place its own reach', () => {
    const reach = (value: string) => ({ total: cell(value), sex: [], disability: cell('0') })
    const union = place('San Fernando', reach('4'), 'La Union')
    const pampanga = place('San Fernando', reach('9'), 'Pampanga')
    const twins = { ...project, places: [union, pampanga] }
    render(<ProjectMapCard onClose={vi.fn()} place={pampanga} project={twins} />)
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.queryByText('4')).toBeNull()
  })

  it('keeps a withheld group by name instead of dropping it like an empty one', () => {
    const withheld = { state: 'SUPPRESSED' as const, value: null, reason: 'ROLE_LEASE' }
    const reach = {
      total: cell('5'),
      sex: [
        { key: 'MALE', label: 'Male', metric: withheld },
        { key: 'FEMALE', label: 'Female', metric: cell('5') },
      ],
      disability: cell('0'),
    }
    render(<ProjectMapCard onClose={vi.fn()} place={place('Borongan', reach)} project={project} />)
    expect(screen.getByText('Male Suppressed · Female 5')).toBeTruthy()
  })

  it('reads an unmatched town as not recorded, never as zero', () => {
    const missing = { state: 'MISSING' as const, value: null, reason: 'NO_RESIDENCE_MATCH' }
    const reach = { total: missing, sex: [], disability: missing }
    render(<ProjectMapCard onClose={vi.fn()} place={place('Guiuan', reach)} project={project} />)
    expect(screen.getByText('Town not recorded')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })
})
