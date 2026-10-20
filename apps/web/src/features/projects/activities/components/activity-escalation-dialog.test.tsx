/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Activity } from '@/types/pathways'

const api = vi.hoisted(() => ({ raiseActivityEscalation: vi.fn() }))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
vi.mock('@/lib/api/activity-escalations', () => ({ activityEscalationsClient: api }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { ActivityEscalationDialog } from './activity-escalation-dialog'

const activity = {
  id: '30000000-0000-4000-8000-000000000003',
  projectId: '20000000-0000-4000-8000-000000000002',
} as Activity

const fill = (text: string) => {
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Raise/ }))
}

describe('ActivityEscalationDialog', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(cleanup)

  const renderDialog = (onRaised = vi.fn()) =>
    render(
      <ActivityEscalationDialog
        activity={activity}
        onOpenChange={vi.fn()}
        onRaised={onRaised}
        open
      />,
    )

  it('shows the privacy hint', () => {
    renderDialog()
    expect(screen.getByText('Do not include beneficiary names or contact details.')).toBeTruthy()
  })

  it('rejects a reason shorter than 10 characters', () => {
    renderDialog()
    fill('  too short ')
    expect(screen.getByRole('alert').textContent).toContain('10 to 2000 characters')
    expect(api.raiseActivityEscalation).not.toHaveBeenCalled()
  })

  it('posts the trimmed reason and a client mutation id', async () => {
    const onRaised = vi.fn()
    api.raiseActivityEscalation.mockResolvedValueOnce({})
    renderDialog(onRaised)
    fill('  The venue is not available.  ')
    await waitFor(() => expect(onRaised).toHaveBeenCalled())
    const [projectId, activityId, body] = api.raiseActivityEscalation.mock.calls[0]
    expect([projectId, activityId]).toEqual([activity.projectId, activity.id])
    expect(body.reason).toBe('The venue is not available.')
    expect(body.clientMutationId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('shows the server message when the raise is refused', async () => {
    api.raiseActivityEscalation.mockRejectedValueOnce(new Error('An escalation is already open.'))
    renderDialog()
    fill('The venue is not available.')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('An escalation is already open.'),
    )
  })

  it('refreshes the panel when the raise conflicts with an open escalation', async () => {
    const onRaised = vi.fn()
    api.raiseActivityEscalation.mockRejectedValueOnce(
      new PathwaysClientError('Conflict', 'invalid', [], 409),
    )
    renderDialog(onRaised)
    fill('The venue is not available.')
    await waitFor(() => expect(onRaised).toHaveBeenCalled())
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
