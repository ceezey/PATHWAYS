/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({
  listActivityEscalations: vi.fn(),
  stepActivityEscalation: vi.fn(),
}))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('@/lib/api/activity-escalations', () => ({ activityEscalationsClient: api }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { PathwaysClientError } from '@/lib/api/core/request'
import { ActivityEscalationPanel, type EscalationTier } from './activity-escalation-panel'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
} as Activity
const raiser = '50000000-0000-4000-8000-000000000005'
const manager = '50000000-0000-4000-8000-000000000006'
const escalation = (status: string, extra = {}) => ({
  id: '40000000-0000-4000-8000-000000000004',
  projectId: activity.projectId,
  activityId: activity.id,
  reason: 'The venue is not available.',
  status,
  raisedBy: { id: raiser, name: 'Officer' },
  raisedAt: '2026-10-19T00:00:00.000Z',
  forwardedBy: null,
  forwardedAt: null,
  forwardNote: null,
  resolvedBy: null,
  resolvedAt: null,
  resolutionNote: null,
  resolutionLevel: null,
  updatedAt: '2026-10-19T01:00:00.000Z',
  ...extra,
})

const renderPanel = (row: object, tier: EscalationTier, userId = manager) => {
  api.listActivityEscalations.mockResolvedValue([row])
  render(<ActivityEscalationPanel activity={activity} tier={tier} userId={userId} />)
  return screen.findByText('Escalations')
}

describe('ActivityEscalationPanel', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('shows Resolve and Forward to the Project Manager on an open escalation', async () => {
    await renderPanel(escalation('OPEN'), 'PROJECT')
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy()
  })

  it('offers only Forward when the Project Manager raised it', async () => {
    await renderPanel(escalation('OPEN'), 'PROJECT', raiser)
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
  })

  it('shows Resolve to the Program Manager on a forwarded escalation only', async () => {
    await renderPanel(
      escalation('FORWARDED', { forwardedBy: { id: raiser, name: 'PM' } }),
      'PROGRAM',
    )
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull()
    cleanup()
    await renderPanel(escalation('OPEN'), 'PROGRAM')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('hides Resolve from a Program Manager who forwarded it', async () => {
    await renderPanel(
      escalation('FORWARDED', { forwardedBy: { id: manager, name: 'PM' } }),
      'PROGRAM',
    )
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('shows status only to other roles and the resolution trail', async () => {
    await renderPanel(
      escalation('RESOLVED', {
        resolvedBy: { id: manager, name: 'Program Lead' },
        resolutionNote: 'Venue replaced.',
        resolutionLevel: 'PROGRAM',
      }),
      null,
    )
    expect(screen.getByText('Program level')).toBeTruthy()
    expect(screen.getByText(/Resolved by Program Lead: Venue replaced\./)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('requires a note, then forwards with the escalation version', async () => {
    api.stepActivityEscalation.mockResolvedValueOnce({})
    await renderPanel(escalation('OPEN'), 'PROJECT')
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByRole('alert').textContent).toContain('10 to 2000 characters')
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Needs program funds.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await waitFor(() => expect(api.stepActivityEscalation).toHaveBeenCalled())
    const [, , escalationId, step, body] = api.stepActivityEscalation.mock.calls[0]
    expect([escalationId, step]).toEqual(['40000000-0000-4000-8000-000000000004', 'forward'])
    expect(body).toEqual({
      note: 'Needs program funds.',
      expectedUpdatedAt: '2026-10-19T01:00:00.000Z',
    })
  })

  it('reloads on 409 so the next decision uses the new version', async () => {
    api.stepActivityEscalation
      .mockRejectedValueOnce(new PathwaysClientError('Conflict', 'invalid', [], 409))
      .mockResolvedValueOnce({})
    await renderPanel(escalation('OPEN'), 'PROJECT')
    api.listActivityEscalations.mockResolvedValue([
      escalation('OPEN', { updatedAt: '2026-10-19T02:00:00.000Z' }),
    ])
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Resolved on site.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This escalation changed and was reloaded; review it and decide again.',
      ),
    )
    await waitFor(() => expect(api.listActivityEscalations).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(api.stepActivityEscalation).toHaveBeenCalledTimes(2))
    expect(api.stepActivityEscalation.mock.calls[1][4].expectedUpdatedAt).toBe(
      '2026-10-19T02:00:00.000Z',
    )
  })

  it('shows the privacy hint on the decision note', async () => {
    await renderPanel(escalation('OPEN'), 'PROJECT')
    expect(screen.getByText('Do not include beneficiary names or contact details.')).toBeTruthy()
  })

  it('shows a message when the list cannot be loaded', async () => {
    api.listActivityEscalations.mockRejectedValue(new Error('offline'))
    render(<ActivityEscalationPanel activity={activity} tier={null} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Escalations could not be loaded.')
  })

  it('keeps the rows and shows the error when a refresh fails', async () => {
    api.listActivityEscalations.mockResolvedValueOnce([escalation('OPEN')])
    const view = render(<ActivityEscalationPanel activity={activity} tier={null} />)
    await screen.findByText('Escalations')
    api.listActivityEscalations.mockRejectedValue(new Error('offline'))
    view.rerender(<ActivityEscalationPanel activity={activity} refreshKey={1} tier={null} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Escalations could not be loaded.')
    expect(screen.getByText('The venue is not available.')).toBeTruthy()
  })
})
