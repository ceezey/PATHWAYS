/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({
  listActivityExtensions: vi.fn(),
  verifyActivityExtension: vi.fn(),
  decideActivityExtension: vi.fn(),
}))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import { PathwaysClientError } from '@/lib/services/pathways-client'
import { ActivityExtensionPanel } from './activity-extension-panel'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as Activity
const request = (status: string) => ({
  id: '40000000-0000-4000-8000-000000000004',
  projectId: activity.projectId,
  activityId: activity.id,
  currentEndDate: '2026-11-30',
  requestedEndDate: '2026-12-15',
  reason: 'Rains delayed the delivery partner.',
  status,
  requestedBy: { id: '50000000-0000-4000-8000-000000000005', name: 'Officer' },
  requestedAt: '2026-10-01T00:00:00.000Z',
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  updatedAt: '2026-10-02T00:00:00.000Z',
})

const renderPanel = (status: string, canVerify: boolean, canDecide: boolean) => {
  api.listActivityExtensions.mockResolvedValue([request(status)])
  render(
    <ActivityExtensionPanel
      activity={activity}
      canDecide={canDecide}
      canVerify={canVerify}
      onDecided={vi.fn()}
    />,
  )
  return screen.findByText('Extension request')
}

describe('ActivityExtensionPanel', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  it('shows Verify and Return only to the M&E officer on a pending request', async () => {
    await renderPanel('PENDING', true, false)
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Return' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('shows Approve and Decline only to the Project Manager on a verified request', async () => {
    await renderPanel('VERIFIED', false, true)
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull()
  })

  it('shows status only to Program and Grant Managers', async () => {
    await renderPanel('VERIFIED', false, false)
    expect(screen.getByText('Awaiting approval')).toBeTruthy()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('approves with the activity version and shows a reload message on 409', async () => {
    api.decideActivityExtension.mockRejectedValueOnce(
      new PathwaysClientError('Conflict', 'invalid', [], 409),
    )
    await renderPanel('VERIFIED', false, true)
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Approved after review.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'This request changed; reload before deciding.',
      ),
    )
    expect(api.decideActivityExtension.mock.calls[0][3]).toMatchObject({
      decision: 'APPROVE',
      expectedUpdatedAt: '2026-10-02T00:00:00.000Z',
      activityExpectedUpdatedAt: activity.updatedAt,
    })
  })
})
