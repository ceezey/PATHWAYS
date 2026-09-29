/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveEvaluationWorkspace } from './live-evaluation-workspace'
const state = vi.hoisted(() => ({
  readError: false,
  role: 'MONITORING_AND_EVALUATION_OFFICER',
  user: 'evaluator',
  generation: 0,
  revision: '2026-09-27T00:00:00.000Z',
  empty: false,
  extraSettings: false,
  configure: vi.fn(),
  initialize: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
const projectId = '10000000-0000-4000-8000-000000000001'
const criterionId = '20000000-0000-4000-8000-000000000002'
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: [state.role],
      permissions:
        state.role === 'SYSTEM_ADMINISTRATOR'
          ? ['monitoring.read', 'settings.configure']
          : [
              'monitoring.read',
              'evaluations.weights.configure',
              ...(state.extraSettings ? ['settings.configure'] : []),
            ],
      assignedProjectIds: [projectId],
    },
  }),
}))
vi.mock('@/lib/auth/sensitive-drafts', () => ({
  useSensitiveDraftOwner: (
    profile: { permissions: string[] },
    kind: string,
    permission: string,
    _project: string,
    resource: string,
    enabled = true,
  ) => {
    if (!enabled || !profile.permissions.includes(permission)) return null
    const user = state.user
    const generation = state.generation
    const revision = state.revision
    return {
      key: `${kind}:${user}:${resource}`,
      generation,
      isCurrent: () =>
        user === state.user &&
        generation === state.generation &&
        (permission !== 'settings.configure' ||
          state.role === 'SYSTEM_ADMINISTRATOR' ||
          state.extraSettings) &&
        (kind !== 'evaluation-weights' || revision === state.revision),
    }
  },
}))
vi.mock('@/lib/services/core-feature-client', () => ({
  coreDataClient: {
    configureWeights: (...args: unknown[]) => state.configure(...args),
    initializeCriteria: (...args: unknown[]) => state.initialize(...args),
  },
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({
    data: {
      projectId,
      evaluation: null,
      criteria: state.empty
        ? []
        : [
            {
              id: criterionId,
              name: 'Recorded criterion',
              code: 'outcomes',
              type: 'KPI',
              version: 1,
              status: 'DRAFT',
              weightPercentage: '100',
              maximumScore: '100',
              updatedAt: state.revision,
            },
          ],
    },
    isPending: false,
    isError: state.readError,
    refetch: state.refetch,
  }),
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))
describe('evaluation editor revisions and retry identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.readError = false
    state.role = 'MONITORING_AND_EVALUATION_OFFICER'
    state.user = 'evaluator'
    state.generation = 0
    state.revision = '2026-09-27T00:00:00.000Z'
    state.empty = false
    state.extraSettings = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)
  it('does not unlock a pending weight operation when an independent initialization owner is lost', async () => {
    // Synthetic hook ownership seam; this does not claim a human role receives both permissions.
    state.extraSettings = true
    let finish: (value: unknown) => void = () => {}
    state.configure.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const view = render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft weights' }))
    state.extraSettings = false
    view.rerender(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByRole('button', { name: 'Saving' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Saving' }))
    expect(state.configure).toHaveBeenCalledOnce()
    await act(async () => finish({ projectId, configured: 1 }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
  })
  it('hides an obsolete weight draft during the first render of a new criterion revision', () => {
    const firstRenderValues: string[] = []
    function Observer() {
      useLayoutEffect(() => {
        firstRenderValues.push((screen.getByLabelText('Weight (%)') as HTMLInputElement).value)
      })
      return <LiveEvaluationWorkspace projectId={projectId} />
    }
    const view = render(<Observer />)
    fireEvent.change(screen.getByLabelText('Weight (%)'), { target: { value: '75' } })
    state.revision = '2026-09-27T00:00:01.000Z'
    view.rerender(<Observer />)
    expect(firstRenderValues.at(-1)).toBe('100')
  })
  it('hides cached criterion names and commands when current monitoring read is denied', () => {
    const view = render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('Recorded criterion')).toBeTruthy()
    state.readError = true
    view.rerender(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.queryByText('Recorded criterion')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save draft weights' })).toBeNull()
    expect(screen.getByText(/Current criteria access could not be verified/)).toBeTruthy()
    expect(state.configure).not.toHaveBeenCalled()
  })
  it('clears busy and obsolete weights when successful refetch changes the criterion revision', async () => {
    state.configure.mockResolvedValue({ projectId, configured: 1 })
    const view = render(<LiveEvaluationWorkspace projectId={projectId} />)
    state.refetch.mockImplementation(async () => {
      state.revision = '2026-09-27T00:00:01.000Z'
      view.rerender(<LiveEvaluationWorkspace projectId={projectId} />)
      await Promise.resolve()
    })
    fireEvent.change(screen.getByLabelText('Weight (%)'), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft weights' }))
    await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save draft weights' }).hasAttribute('disabled'),
      ).toBe(false),
    )
    expect((screen.getByLabelText('Weight (%)') as HTMLInputElement).value).toBe('100')
    expect(state.success).not.toHaveBeenCalled()
  })
  it('recovers the original initialized criterion IDs by retaining the exact request after response loss', async () => {
    state.role = 'SYSTEM_ADMINISTRATOR'
    state.empty = true
    state.initialize
      .mockRejectedValueOnce(Error('Response lost'))
      .mockResolvedValue({ criteria: [{ id: criterionId }] })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'outcomes' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Recorded outcomes' } })
    fireEvent.change(screen.getByLabelText('Weight (%)'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Initialize draft rubric' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Initialize draft rubric' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.initialize.mock.calls[1][1]).toEqual(state.initialize.mock.calls[0][1])
  })
})
