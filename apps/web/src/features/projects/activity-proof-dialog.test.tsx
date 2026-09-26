import type { Activity } from '@/types/pathways'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: {
    organizationId: 'org-a',
    userId: 'actor-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['activities.proof.submit'],
    assignedProjectIds: ['project-a', 'project-b'],
  },
  register: vi.fn(),
  submit: vi.fn(),
  release: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: state.profile }) }))
vi.mock('@/lib/files/proof-file-previews', () => ({
  registerProofFilePreviews: state.register,
  releaseProofFilePreviews: state.release,
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { submitActivityProof: state.submit },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
import { ActivityProofDialog } from './activity-proof-dialog'
const activity = { id: 'activity-a', projectId: 'project-a', progress: 0 } as Activity
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function submit() {
  fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
    target: { value: 'Synthetic proof note' },
  })
  fireEvent.change(screen.getByLabelText(/Upload proof of conduct/), {
    target: { files: [new File(['synthetic'], 'proof.txt')] },
  })
  fireEvent.click(screen.getByRole('button', { name: /Submit update & proof/ }))
}
describe('proof dialog scope boundary', () => {
  it('cannot submit captured files after its project changes while preview registration awaits', async () => {
    let resolve!: (files: []) => void
    state.register.mockReturnValue(
      new Promise<[]>((done) => {
        resolve = done
      }),
    )
    const props = { activity, open: true, onSubmitted: vi.fn(), onOpenChange: vi.fn() }
    const view = render(<ActivityProofDialog {...props} />)
    submit()
    await waitFor(() => expect(state.register).toHaveBeenCalledOnce())
    view.rerender(
      <ActivityProofDialog {...props} activity={{ ...activity, projectId: 'project-b' }} />,
    )
    resolve([])
    await waitFor(() => expect(state.release).toHaveBeenCalled())
    expect(state.submit).not.toHaveBeenCalled()
    expect(props.onSubmitted).not.toHaveBeenCalled()
    expect((screen.getByLabelText(/Narrative Notes/) as HTMLTextAreaElement).value).toBe('')
  })
  it('handles rejected preview registration without sending an API request', async () => {
    state.register.mockRejectedValue(Error('File preview session changed.'))
    render(
      <ActivityProofDialog activity={activity} open onSubmitted={vi.fn()} onOpenChange={vi.fn()} />,
    )
    submit()
    await screen.findByRole('alert')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('File preview session changed.'),
    )
    expect(state.submit).not.toHaveBeenCalled()
  })
})
