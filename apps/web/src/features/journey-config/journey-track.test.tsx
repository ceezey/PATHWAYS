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
    expect(screen.queryByText('Locked')).toBeNull()
  })

  it('shows done, current and locked states with stageState', () => {
    const order = ['done', 'current', 'upcoming'] as const
    render(
      <JourneyTrack stages={stages} stageState={(item) => order[item.order - 1] ?? 'upcoming'} />,
    )
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.getByText('Current')).toBeTruthy()
    expect(screen.getByText('Locked')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'J2 Stage 2: Current' }).getAttribute('aria-current'),
    ).toBe('step')
  })
})
