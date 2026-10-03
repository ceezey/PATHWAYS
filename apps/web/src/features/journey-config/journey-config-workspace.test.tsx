/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JourneyStageConfig, ProjectDetail } from '@/types/pathways'

import { branchSummary, moveStage, nextStageCode, removeStage } from './journey-config-utils'
import { JourneyConfigWorkspace } from './journey-config-workspace'

const access = vi.hoisted(() => ({
  role: 'Project Manager' as string,
  canManage: true,
  profile: { fullName: 'Test User', roles: [], permissions: [] },
}))

vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/rbac/ui-action-availability', () => ({
  isUiActionAvailable: () => access.canManage,
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { saveJourneyStages: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const stage = (over: Partial<JourneyStageConfig>): JourneyStageConfig => ({
  id: 'x',
  projectId: 'p',
  code: 'A1',
  name: 'Stage',
  order: 1,
  type: 'Core',
  terminal: false,
  mappedActivityIds: [],
  description: '',
  ...over,
})
const stages = [
  stage({
    id: 's1',
    code: 'A1',
    name: 'Intake',
    order: 1,
    type: 'Entry',
    mappedActivityIds: ['a1'],
  }),
  stage({ id: 's2', code: 'A2', name: 'Support', order: 2 }),
  stage({
    id: 's3',
    code: 'A2.1',
    name: 'Alt path',
    order: 3,
    type: 'Branch',
    parentStageId: 's2',
  }),
]
const project = { id: 'p', title: 'Project' } as ProjectDetail
const activities = [{ id: 'a1', title: 'Activity one', journeyStageId: 's1' }]
const mount = () =>
  render(
    <JourneyConfigWorkspace project={project} activities={activities} initialStages={stages} />,
  )

afterEach(() => {
  cleanup()
  access.canManage = true
})

describe('JourneyConfigWorkspace', () => {
  it('renders the track with branches and the summary pills', () => {
    mount()
    const track = within(screen.getByTestId('journey-track'))
    expect(track.getByRole('list', { name: 'Branches of A2' })).toBeTruthy()
    expect(screen.getByText('3 stages configured')).toBeTruthy()
    expect(screen.getByText('1 activities mapped')).toBeTruthy()
    expect(screen.getByText('Branching enabled · A2 -> A2.1')).toBeTruthy()
  })

  it('lists stages with meta lines and opens details on selection', () => {
    mount()
    expect(screen.getAllByTestId('stage-row')).toHaveLength(3)
    expect(screen.getByText('Branch · branch of A2 · 0 acts mapped')).toBeTruthy()
    expect(screen.getByText(/Select a stage from the list/)).toBeTruthy()
    fireEvent.click(within(screen.getAllByTestId('stage-row')[0]).getAllByRole('button')[0])
    expect((screen.getByDisplayValue('Intake') as HTMLInputElement).disabled).toBe(false)
    expect(screen.getByText('Activity one')).toBeTruthy()
  })

  it('hides edit controls for read-only roles', () => {
    access.canManage = false
    mount()
    expect(screen.queryByText('Save configuration')).toBeNull()
    expect(screen.queryByText('Add stage')).toBeNull()
    expect(screen.queryByLabelText('Reorder A1')).toBeNull()
    fireEvent.click(within(screen.getAllByTestId('stage-row')[0]).getAllByRole('button')[0])
    expect((screen.getByDisplayValue('Intake') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('journey config utils', () => {
  it('summarises branches and renumbers on move', () => {
    expect(branchSummary(stages)).toBe('A2 -> A2.1')
    const moved = moveStage(stages, 's3', 's1')
    expect(moved.find((item) => item.id === 's3')?.order).toBe(1)
    expect(moved.find((item) => item.id === 's1')?.order).toBe(2)
  })

  it('numbers new stages after the highest code and unparents branches on remove', () => {
    expect(
      nextStageCode([
        { ...stages[0], code: 'J1' },
        { ...stages[1], code: 'J2' },
      ]),
    ).toBe('J3')
    const parentId = stages.find((item) => item.parentStageId)?.parentStageId ?? ''
    const left = removeStage(stages, parentId)
    expect(left.some((item) => item.id === parentId)).toBe(false)
    expect(left.every((item) => !item.parentStageId)).toBe(true)
  })
})
