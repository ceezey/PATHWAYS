/* @vitest-environment jsdom */

import type { ProjectMapProject } from '@pathways/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectMapCard } from './project-map-card'

const cell = (value: string) =>
  value === '0'
    ? { state: 'ZERO' as const, value, reason: null }
    : { state: 'AVAILABLE' as const, value, reason: null }
const place = (name: string, reach: ProjectMapProject['places'][number]['reach']) => ({
  name,
  province: 'Eastern Samar',
  longitude: 125.4,
  latitude: 11.6,
  reach,
})
const project: ProjectMapProject = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'SSG-ES',
  title: 'Safe Schools for Girls',
  status: 'ONGOING',
  implementationArea: 'Borongan City and Guiuan, Eastern Samar',
  places: [
    place('Borongan', {
      total: cell('5'),
      sex: [
        { key: 'MALE', label: 'Male', metric: cell('0') },
        { key: 'FEMALE', label: 'Female', metric: cell('5') },
      ],
      disability: cell('2'),
    }),
    place('Guiuan', null),
  ],
  overview: null,
  sadddSex: null,
  sadddDisability: null,
}

afterEach(cleanup)

describe('ProjectMapCard', () => {
  it('shows the tapped place reach with only the groups that hold people', () => {
    render(<ProjectMapCard onClose={vi.fn()} place="Borongan" project={project} />)
    expect(screen.getByText('Reached in Borongan (SADDD)')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('Female 5 · With disability 2')).toBeTruthy()
    expect(screen.queryByText(/Male 0/)).toBeNull()
  })

  it('leaves out every row the role cannot read', () => {
    render(<ProjectMapCard onClose={vi.fn()} place="Guiuan" project={project} />)
    expect(screen.queryByText(/Reached in Guiuan/)).toBeNull()
    expect(screen.queryByText('Whole project')).toBeNull()
    expect(screen.queryByText(/Not available for your role/)).toBeNull()
    expect(screen.getByText('Open project')).toBeTruthy()
  })
})
