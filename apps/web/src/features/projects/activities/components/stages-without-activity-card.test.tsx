/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActivitySummary, JourneyStageConfig } from '@/types/pathways'

import { StagesWithoutActivityCard } from './stages-without-activity-card'

const api = vi.hoisted(() => ({ createActivity: vi.fn() }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: {} }) }))
vi.mock('@/hooks/use-source-mutation-context', () => ({
  useSourceMutationContext: () => ({ principalKey: 'synthetic', isCurrent: () => true }),
}))

const stage = (id: string, name: string, mappedActivityIds: string[] = [], archived = false) =>
  ({ id, name, mappedActivityIds, archived }) as JourneyStageConfig
const activity = (id: string, status: ActivitySummary['status'] = 'Planned') =>
  ({ id, status }) as ActivitySummary
const stages = [
  stage('s-1', 'Pre-test'),
  stage('s-2', 'Training day', ['act-1']),
  stage('s-3', 'Post-test'),
  stage('s-4', 'Old stage', [], true),
  stage('s-5', 'Follow-up', ['act-2']),
]
const activities = [activity('act-1'), activity('act-2', 'Cancelled')]
const onCreated = vi.fn()

const show = (over: Record<string, unknown> = {}) =>
  render(
    <StagesWithoutActivityCard
      activities={activities}
      canCreate
      endDate="2026-12-31"
      onCreated={onCreated}
      projectId="project-1"
      stages={stages}
      startDate="2026-01-01"
      {...over}
    />,
  )
const rows = () =>
  screen.getAllByRole('listitem').map((item) => item.textContent?.replace('Create activity', ''))

describe('stages without an activity card', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.createActivity.mockImplementation(async (input) => ({ id: `new-${input.journeyStageId}` }))
  })
  afterEach(cleanup)

  it('lists only stages with no activity', () => {
    show()
    // A cancelled activity does not count and an archived stage is not listed.
    expect(rows()).toEqual(['Pre-test', 'Post-test', 'Follow-up'])
  })

  it('shows nothing when every stage has an activity', () => {
    const { container } = show({ stages: [stage('s-2', 'Training day', ['act-1'])] })
    expect(container.textContent).toBe('')
  })

  it('create activity sends the stage and project dates', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Create activity for Post-test' }))
    await waitFor(() => expect(api.createActivity).toHaveBeenCalledTimes(1))
    expect(api.createActivity.mock.calls[0][0]).toEqual({
      projectId: 'project-1',
      title: 'Post-test',
      description: '',
      activityType: 'SURVEY',
      startDate: '2026-01-01',
      dueDate: '2026-12-31',
      assignedUserIds: [],
      journeyStageId: 's-3',
    })
    expect(api.createActivity.mock.calls[0][1]).toMatchObject({ principalKey: 'synthetic' })
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    // The created stage leaves the list at once.
    await waitFor(() => expect(rows()).toEqual(['Pre-test', 'Follow-up']))
  })

  it('create all creates each one once', async () => {
    api.createActivity.mockImplementation(async (input) => {
      if (input.journeyStageId === 's-3') throw new Error('Dates are outside the project.')
      return { id: `new-${input.journeyStageId}` }
    })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Create all' }))
    await waitFor(() => expect(api.createActivity).toHaveBeenCalledTimes(3))
    expect(api.createActivity.mock.calls.map((call) => call[0].journeyStageId)).toEqual([
      's-1',
      's-3',
      's-5',
    ])
    await screen.findByText('Post-test: Dates are outside the project.')
    // Pressing again only retries the one that was refused.
    api.createActivity.mockImplementation(async (input) => ({ id: `new-${input.journeyStageId}` }))
    api.createActivity.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Create all' }))
    await waitFor(() => expect(api.createActivity).toHaveBeenCalledTimes(1))
    expect(api.createActivity.mock.calls[0][0].journeyStageId).toBe('s-3')
  })

  it('create all keeps every refusal, each naming its stage', async () => {
    api.createActivity.mockImplementation(async (input) => {
      throw new Error(`Refused ${input.journeyStageId}.`)
    })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Create all' }))
    await screen.findByText('Follow-up: Refused s-5.')
    const alert = screen.getByRole('alert')
    expect(within(alert).getAllByText(/^(Pre-test|Post-test|Follow-up): Refused/)).toHaveLength(3)
  })

  it('disables both buttons while a create runs and labels the pressed one', async () => {
    let finish: (value: { id: string }) => void = () => {}
    api.createActivity.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Create activity for Pre-test' }))
    const pressed = await screen.findByRole('button', { name: 'Create activity for Pre-test' })
    await waitFor(() => expect(pressed.textContent).toBe('Creating...'))
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(screen.getByRole('button', { name: 'Create all' }).textContent).toBe('Create all')
    fireEvent.click(screen.getByRole('button', { name: 'Create all' }))
    expect(api.createActivity).toHaveBeenCalledTimes(1)
    finish({ id: 'new-s-1' })
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Create all' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
  })

  it('no dates shows the reason and no button', () => {
    show({ startDate: null })
    expect(screen.getByText("Set the project's dates first.")).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('hidden without activities.create', () => {
    const { container } = show({ canCreate: false })
    expect(container.textContent).toBe('')
  })

  it("a refused create shows the server's message", async () => {
    api.createActivity.mockRejectedValue(new Error('The activity dates are outside the project.'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Create activity for Pre-test' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Pre-test: The activity dates are outside the project.')
    expect(within(screen.getByRole('list')).getByText('Pre-test')).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
