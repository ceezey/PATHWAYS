import type { Activity } from '@/types/pathways'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ transition: vi.fn(), permitted: true }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: {} }) }))
vi.mock('@/hooks/use-source-mutation-context', () => ({
  useSourceMutationContext: () =>
    state.permitted ? { principalKey: 'synthetic', isCurrent: () => state.permitted } : null,
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { transitionActivity: state.transition },
  recoverSourceMutation: vi.fn(),
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange }: { onValueChange: (value: string) => void }) => (
    <button type="button" onClick={() => onValueChange('Cancelled')}>
      Choose cancellation
    </button>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectTrigger: () => null,
}))
import { ActivityStatusControl } from './activity-status-control'
const activity = {
  id: '20000000-0000-4000-8000-000000000001',
  projectId: '20000000-0000-4000-8000-000000000002',
  title: 'Synthetic workshop',
  status: 'Planned',
  updatedAt: '2026-09-27T00:00:00.000Z',
} as Activity
beforeEach(() => {
  state.permitted = true
  state.transition.mockReset().mockResolvedValue({ ...activity, status: 'Cancelled' })
})
afterEach(cleanup)
describe('explicit activity cancellation reason', () => {
  it('opens a labelled reason dialog without mutation, rejects whitespace, and submits only the entered bounded reason', async () => {
    const updated = vi.fn()
    render(
      <ActivityStatusControl
        activity={activity}
        controlId="synthetic-status"
        onUpdated={updated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose cancellation' }))
    expect(screen.getByRole('dialog', { name: 'Cancel activity' })).toBeTruthy()
    expect(state.transition).not.toHaveBeenCalled()
    const reason = screen.getByLabelText('Cancellation reason')
    expect(reason.getAttribute('maxlength')).toBe('1000')
    fireEvent.change(reason, { target: { value: '   ' } })
    fireEvent.submit(reason.closest('form') as HTMLFormElement)
    await screen.findByText('Enter a cancellation reason of 1 to 1,000 characters.', {
      selector: 'p',
    })
    expect(state.transition).not.toHaveBeenCalled()
    fireEvent.change(reason, { target: { value: '  Approved weather cancellation  ' } })
    fireEvent.submit(reason.closest('form') as HTMLFormElement)
    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    expect(state.transition).toHaveBeenCalledWith(
      activity.projectId,
      activity.id,
      'CANCELLED',
      activity.updatedAt,
      'Approved weather cancellation',
      expect.objectContaining({ principalKey: 'synthetic' }),
    )
  })
  it('does not create a cancellation request when the reason dialog is dismissed', () => {
    render(
      <ActivityStatusControl
        activity={activity}
        controlId="synthetic-status"
        onUpdated={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Choose cancellation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep activity' }))
    expect(state.transition).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
