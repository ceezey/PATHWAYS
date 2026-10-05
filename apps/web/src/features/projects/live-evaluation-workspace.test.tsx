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
  published: false,
  criterionType: 'OTHER',
  evaluation: null as Record<string, unknown> | null,
  configure: vi.fn(),
  initialize: vi.fn(),
  createCriteria: vi.fn(),
  publish: vi.fn(),
  createEvaluation: vi.fn(),
  saveScores: vi.fn(),
  submit: vi.fn(),
  returnEvaluation: vi.fn(),
  signoff: vi.fn(),
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
          : state.role === 'PROJECT_MANAGER'
            ? ['monitoring.read', 'evaluations.approve', 'evaluations.signoff']
            : [
                'monitoring.read',
                'evaluations.weights.configure',
                'evaluations.submit',
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
    createCriteria: (...args: unknown[]) => state.createCriteria(...args),
    publishCriteria: (...args: unknown[]) => state.publish(...args),
    createEvaluation: (...args: unknown[]) => state.createEvaluation(...args),
    saveEvaluationScores: (...args: unknown[]) => state.saveScores(...args),
    submitEvaluation: (...args: unknown[]) => state.submit(...args),
    returnEvaluation: (...args: unknown[]) => state.returnEvaluation(...args),
    signoffEvaluation: (...args: unknown[]) => state.signoff(...args),
  },
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({
    data: {
      projectId,
      criteria: state.empty
        ? []
        : [
            {
              id: criterionId,
              name: 'Recorded criterion',
              code: 'outcomes',
              description: null,
              type: state.criterionType,
              version: 1,
              status: state.published ? 'PUBLISHED' : 'DRAFT',
              weightPercentage: '100',
              maximumScore: '100',
              updatedAt: state.revision,
            },
          ],
      evaluations: state.evaluation ? [state.evaluation] : [],
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
    state.published = false
    state.criterionType = 'OTHER'
    state.evaluation = null
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
const openEvaluation = {
  id: 'evaluation-1',
  title: 'Mid-term 2026',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt: '2026-10-01T00:00:00.000Z',
  evaluatedBy: null,
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [] as unknown[],
}
describe('evaluation rounds: criteria publishing, scoring, submit and review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.readError = false
    state.role = 'MONITORING_AND_EVALUATION_OFFICER'
    state.user = 'evaluator'
    state.generation = 0
    state.revision = '2026-09-27T00:00:00.000Z'
    state.empty = false
    state.extraSettings = false
    state.published = false
    state.criterionType = 'OTHER'
    state.evaluation = null
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)
  it('publishes draft criteria after confirmation', async () => {
    state.publish.mockResolvedValue({ projectId, published: 1 })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish criteria' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'Publish criteria' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.publish).toHaveBeenCalledWith(projectId, {
      criteria: [{ id: criterionId, expectedUpdatedAt: state.revision }],
    })
  })
  it('starts an evaluation once criteria are published', async () => {
    state.published = true
    state.createEvaluation.mockResolvedValue({ ...openEvaluation })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mid-term 2026' } })
    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-06-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.createEvaluation).toHaveBeenCalledOnce()
  })
  it('scores and submits an open draft evaluation', async () => {
    state.published = true
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockResolvedValue({ ...openEvaluation })
    state.submit.mockResolvedValue({ ...openEvaluation, status: 'SUBMITTED' })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Score for Recorded criterion'), {
      target: { value: '80' },
    })
    fireEvent.change(screen.getByLabelText('Note for Recorded criterion'), {
      target: { value: 'Evidence note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save scores' }))
    await waitFor(() => expect(state.saveScores).toHaveBeenCalledOnce())
    expect(state.saveScores.mock.calls[0][2].scores[0]).toMatchObject({
      criterionId,
      manualScore: 80,
      note: 'Evidence note',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit evaluation' }))
    const confirmButtons = screen.getAllByRole('button', { name: 'Submit evaluation' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
  })
  it('prefills saved manual scores and keeps the return reason out of the narrative', () => {
    state.published = true
    state.evaluation = {
      ...openEvaluation,
      returnReason: 'Recheck the scores',
      scores: [
        {
          criterionId,
          score: '80',
          maximumScore: '100',
          weightedScore: '80',
          commentary: 'Evidence note',
          source: 'manual',
          note: 'Evidence note',
        },
      ],
    }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect((screen.getByLabelText('Score for Recorded criterion') as HTMLInputElement).value).toBe(
      '80',
    )
    expect(
      (screen.getByLabelText('Note for Recorded criterion') as HTMLTextAreaElement).value,
    ).toBe('Evidence note')
    expect(screen.getByText('Returned for correction: Recheck the scores')).toBeTruthy()
    expect((screen.getByLabelText('Evaluation narrative') as HTMLTextAreaElement).value).toBe('')
  })
  it('disables submitting while there are unsaved edits', () => {
    state.published = true
    state.evaluation = { ...openEvaluation }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    const submit = screen.getByRole('button', { name: 'Submit evaluation' })
    expect(submit.hasAttribute('disabled')).toBe(false)
    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Draft' } })
    expect(submit.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Save before submitting.')).toBeTruthy()
  })
  it('offers manual inputs for a computed criterion only after the server reports it', async () => {
    state.published = true
    state.criterionType = 'BENEFICIARY_REACH'
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockRejectedValue(
      Object.assign(new Error('Review the highlighted form fields.'), {
        fieldErrors: [
          {
            fieldCode: criterionId,
            code: 'NOT_COMPUTABLE',
            message: 'Not computable: small cell.',
          },
        ],
      }),
    )
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.queryByLabelText('Score for Recorded criterion')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save scores' }))
    await waitFor(() => expect(screen.getByLabelText('Score for Recorded criterion')).toBeTruthy())
    expect(screen.getByText('Not computable: small cell.')).toBeTruthy()
  })
  it('lets the Project Manager return a submitted evaluation for correction', async () => {
    state.role = 'PROJECT_MANAGER'
    state.published = true
    state.evaluation = {
      ...openEvaluation,
      status: 'SUBMITTED',
      scores: [
        {
          criterionId,
          score: '80',
          maximumScore: '100',
          weightedScore: '80',
          commentary: 'Evidence note',
        },
      ],
    }
    state.returnEvaluation.mockResolvedValue({ ...state.evaluation, status: 'DRAFT' })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Return for correction' }))
    fireEvent.change(screen.getByLabelText('Reason for returning'), {
      target: { value: 'Please recheck scores' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Return evaluation' }))
    await waitFor(() => expect(state.returnEvaluation).toHaveBeenCalledOnce())
    expect(state.returnEvaluation.mock.calls[0][2]).toMatchObject({
      reason: 'Please recheck scores',
    })
  })
  it('lets the Project Manager sign off a submitted evaluation', async () => {
    state.role = 'PROJECT_MANAGER'
    state.published = true
    state.evaluation = {
      ...openEvaluation,
      status: 'SUBMITTED',
      scores: [
        {
          criterionId,
          score: '80',
          maximumScore: '100',
          weightedScore: '80',
          commentary: 'Evidence note',
        },
      ],
    }
    state.signoff.mockResolvedValue({ ...state.evaluation, status: 'SIGNED_OFF' })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign off' }))
    fireEvent.change(screen.getByLabelText('Sign-off feedback'), {
      target: { value: 'Scores agree with the records.' },
    })
    const confirmButtons = screen.getAllByRole('button', { name: 'Sign off' })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])
    await waitFor(() => expect(state.signoff).toHaveBeenCalledOnce())
    expect(state.signoff.mock.calls[0][2]).toMatchObject({
      feedback: 'Scores agree with the records.',
    })
  })
})
