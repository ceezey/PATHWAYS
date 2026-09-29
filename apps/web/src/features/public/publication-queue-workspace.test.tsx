import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicationQueueWorkspace } from './publication-queue-workspace'

const state = vi.hoisted(() => ({
  user: 'reviewer-1',
  projectsError: false,
  projectsPending: false,
  publicationError: false,
  canApprove: true,
  canPublish: true,
  publicationState: 'FOR_REVIEW',
  capturedOwnerInvalid: false,
  transition: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  refetch: vi.fn(),
}))
const projectId = '10000000-0000-4000-8000-000000000001'
vi.mock('@/lib/auth/sensitive-drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/sensitive-drafts')>()
  return {
    ...actual,
    useSensitiveDraftOwner: (...args: Parameters<typeof actual.useSensitiveDraftOwner>) => {
      const owner = actual.useSensitiveDraftOwner(...args)
      return (
        owner && {
          ...owner,
          // A controlled timing seam: authority can become stale before passive cleanup runs.
          isCurrent: () => owner.isCurrent() && !state.capturedOwnerInvalid,
        }
      )
    },
  }
})
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'fictional-org',
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: [
        'public.preview',
        ...(state.canApprove ? ['public.approve'] : []),
        ...(state.canPublish ? ['public.publish'] : []),
      ],
      assignedProjectIds: [projectId],
    },
  }),
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreFeatureClient: {
    transitionPublication: (...args: unknown[]) => state.transition(...args),
  },
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: { getProjects: vi.fn() } }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: (key: string) => ({
    // Retain the old authorized data while reporting failure to stress the renderer gate.
    data:
      key === 'publication-projects'
        ? [
            {
              id: projectId,
              title: 'Private project title',
              area: 'Private area',
              sector: 'Private sector',
            },
          ]
        : {
            revision: 1,
            state: state.publicationState,
            summary: 'Private proposed summary',
            submittedById: 'another-reviewer',
            approvedById: null,
            publishedById: null,
          },
    isPending: key === 'publication-projects' && state.projectsPending,
    isError: key === 'publication-projects' ? state.projectsError : state.publicationError,
    refetch: state.refetch,
  }),
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))

describe('publication current project and revision boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer-1'
    state.projectsError = false
    state.projectsPending = false
    state.publicationError = false
    state.canApprove = true
    state.canPublish = true
    state.publicationState = 'FOR_REVIEW'
    state.capturedOwnerInvalid = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)
  it('exposes the selected project to assistive technology', () => {
    render(<PublicationQueueWorkspace />)
    const project = screen.getByRole('button', { name: 'Private project title' })
    expect(project.getAttribute('aria-pressed')).toBe('true')
  })
  it.each(['error', 'pending'] as const)(
    'hides cached title, summary and actions when parent verification is %s',
    (boundary) => {
      const view = render(<PublicationQueueWorkspace />)
      expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
        'Private proposed summary',
      )
      state.projectsError = boundary === 'error'
      state.projectsPending = boundary === 'pending'
      view.rerender(<PublicationQueueWorkspace />)
      expect(screen.queryAllByText('Private project title')).toHaveLength(0)
      expect(screen.queryByLabelText('Public summary')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Approve revision' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Submit summary' })).toBeNull()
      expect(state.transition).not.toHaveBeenCalled()
    },
  )
  it('does not expose cached publication data when its own current read fails', () => {
    const view = render(<PublicationQueueWorkspace />)
    state.publicationError = true
    view.rerender(<PublicationQueueWorkspace />)
    expect(screen.queryByLabelText('Public summary')).toBeNull()
    expect(screen.queryByText('Revision 1')).toBeNull()
    expect(screen.getByText('Publication unavailable')).toBeTruthy()
  })
  it.each(['approve', 'publish'] as const)(
    'drops a delayed %s completion when only that purpose grant is revoked',
    async (purpose) => {
      let finish: (value: unknown) => void = () => {}
      state.transition.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      state.publicationState = purpose === 'approve' ? 'FOR_REVIEW' : 'APPROVED'
      const view = render(<PublicationQueueWorkspace />)
      fireEvent.click(
        screen.getByRole('button', {
          name: purpose === 'approve' ? 'Approve revision' : 'Publish',
        }),
      )
      if (purpose === 'approve') state.canApprove = false
      else state.canPublish = false
      view.rerender(<PublicationQueueWorkspace />)
      expect(screen.getByLabelText('Public summary')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
        false,
      )
      await act(async () =>
        finish({ revision: 1, state: purpose === 'approve' ? 'APPROVED' : 'PUBLISHED' }),
      )
      expect(state.success).not.toHaveBeenCalled()
      expect(state.refetch).not.toHaveBeenCalled()
    },
  )
  it('retries the exact revision and normalized body after an uncertain response', async () => {
    state.transition
      .mockRejectedValueOnce(Error('Response lost'))
      .mockResolvedValue({ revision: 2, state: 'FOR_REVIEW' })
    render(<PublicationQueueWorkspace />)
    fireEvent.change(screen.getByLabelText('Public summary'), {
      target: { value: '  Updated fictional summary  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.transition.mock.calls[1]).toEqual(state.transition.mock.calls[0])
    expect(state.transition.mock.calls[0][2]).toMatchObject({
      expectedRevision: 1,
      summary: 'Updated fictional summary',
    })
  })
  it('keeps a current submit pending when an unrelated approval grant changes', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<PublicationQueueWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    state.canApprove = false
    view.rerender(<PublicationQueueWorkspace />)
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      true,
    )
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.success).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      false,
    )
  })
  it('releases only its pending marker when authority is invalidated before passive cleanup', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<PublicationQueueWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      true,
    )
    // Do not rerender an owner dependency: the completion arrives before its cleanup effect.
    state.capturedOwnerInvalid = true
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.refetch).not.toHaveBeenCalled()
    expect(state.success).not.toHaveBeenCalled()
    expect(state.error).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      false,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    expect(state.transition).toHaveBeenCalledOnce()
  })
  it('suppresses an old completion after parent denial and clears its private draft and busy state', async () => {
    let finish: (value: unknown) => void = () => {}
    state.transition.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<PublicationQueueWorkspace />)
    fireEvent.change(screen.getByLabelText('Public summary'), {
      target: { value: 'Old private draft' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
    state.projectsError = true
    view.rerender(<PublicationQueueWorkspace />)
    await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
    state.projectsError = false
    view.rerender(<PublicationQueueWorkspace />)
    expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
      'Private proposed summary',
    )
    expect(screen.getByRole('button', { name: 'Submit summary' }).hasAttribute('disabled')).toBe(
      false,
    )
  })
  it.each(['identity', 'generation'] as const)(
    'drops callbacks and clears the draft when %s changes',
    async (boundary) => {
      let finish: (value: unknown) => void = () => {}
      state.transition.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const view = render(<PublicationQueueWorkspace />)
      fireEvent.change(screen.getByLabelText('Public summary'), {
        target: { value: 'Actor one draft' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Submit summary' }))
      if (boundary === 'identity') state.user = 'reviewer-2'
      else act(() => clearSensitiveDraftStorage())
      view.rerender(<PublicationQueueWorkspace />)
      await act(async () => finish({ revision: 2, state: 'FOR_REVIEW' }))
      expect(state.success).not.toHaveBeenCalled()
      expect(state.refetch).not.toHaveBeenCalled()
      expect((screen.getByLabelText('Public summary') as HTMLTextAreaElement).value).toBe(
        'Private proposed summary',
      )
    },
  )
})
