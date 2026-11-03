/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { JourneyStageConfig } from '@/types/pathways'

import { JourneyTrack } from './journey-track'

const stage = (id: string, order: number): JourneyStageConfig => ({
  id,
  projectId: 'p',
  code: `J${order}`,
  name: `Stage ${order}`,
  order,
  type: 'Core',
  terminal: false,
  mappedActivityIds: [],
  description: '',
})

const stages = [stage('a', 1), stage('b', 2), stage('c', 3)]

afterEach(cleanup)

describe('JourneyTrack', () => {
  it('renders unchanged without stageState', () => {
    render(<JourneyTrack stages={stages} />)
    expect(screen.getByRole('button', { name: 'J1 Stage 1' })).toBeTruthy()
    expect(screen.queryByText('Done')).toBeNull()
    expect(screen.queryByText('Upcoming')).toBeNull()
  })

  it('cuts a long code to the node width and shows it in full on hover', () => {
    const long = { ...stage('a', 1), code: 'TECHNICAL_SKILLS_SURVEY' }
    render(<JourneyTrack stages={[long]} />)
    const code = screen.getByText('TECHNICAL_SKILLS_SURVEY')
    expect(code.getAttribute('title')).toBe('TECHNICAL_SKILLS_SURVEY')
    expect(code.className).toContain('truncate')
    expect(code.className).toContain('w-full')
  })

  it('shows done, current and locked states with stageState', () => {
    const order = ['done', 'current', 'upcoming'] as const
    render(
      <JourneyTrack stages={stages} stageState={(item) => order[item.order - 1] ?? 'upcoming'} />,
    )
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.getByText('Upcoming')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'J2 Stage 2: Current' }).getAttribute('aria-current'),
    ).toBe('step')
  })

  it('colors each connector by whether the stage it leads into is reached', () => {
    const order = ['done', 'current', 'upcoming'] as const
    const { container } = render(
      <JourneyTrack stages={stages} stageState={(item) => order[item.order - 1] ?? 'upcoming'} />,
    )
    const connectors = [...container.querySelectorAll('ol > li > span')].map((line) =>
      line.classList.contains('bg-primary'),
    )
    expect(connectors).toEqual([true, true, false, false])
  })
})
