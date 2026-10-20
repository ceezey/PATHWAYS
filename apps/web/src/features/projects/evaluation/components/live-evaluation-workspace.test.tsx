/* @vitest-environment jsdom */
import type { EvaluationDetailResponse } from '@pathways/shared'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveEvaluationWorkspace } from './live-evaluation-workspace'

type EvaluationDetail = EvaluationDetailResponse
const state = vi.hoisted(() => ({
  readError: false,
  role: 'MONITORING_AND_EVALUATION_OFFICER',
  user: 'evaluator',
  generation: 0,
  evaluation: null as EvaluationDetail | null,
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
const evaluationId = '30000000-0000-4000-8000-000000000003'
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: [state.role],
      permissions:
        state.role === 'PROJECT_MANAGER'
          ? ['monitoring.read', 'evaluations.approve', 'evaluations.signoff']
          : state.role === 'PROGRAM_MANAGER'
            ? ['monitoring.read']
            : ['monitoring.read', 'evaluations.submit'],
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
    return {
      key: `${kind}:${user}:${resource}`,
      generation,
      isCurrent: () => user === state.user && generation === state.generation,
    }
  },
}))
vi.mock('@/lib/api/evaluations', () => ({
  evaluationsClient: {
    createEvaluation: (...args: unknown[]) => state.createEvaluation(...args),
    saveEvaluationScores: (...args: unknown[]) => state.saveScores(...args),
    submitEvaluation: (...args: unknown[]) => state.submit(...args),
    returnEvaluation: (...args: unknown[]) => state.returnEvaluation(...args),
    signoffEvaluation: (...args: unknown[]) => state.signoff(...args),
  },
}))
vi.mock('../../projects.reads', () => ({
  useProjectRead: () => ({
    data: { startDate: '2026-01-01', endDate: '2026-03-31' },
    isPending: false,
  }),
}))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: () => ({
    data: {
      projectId,
      criteria: [],
      evaluations: state.evaluation ? [state.evaluation] : [],
      hasMore: false,
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

const score = (
  code: string,
  name: string,
  weight: string,
  value: string,
  extra: Partial<EvaluationDetail['scores'][number]> = {},
): EvaluationDetail['scores'][number] => ({
  criterionId: `20000000-0000-4000-8000-0000000000${code.length}${weight}`,
  score: value,
  maximumScore: '100',
  weightedScore: String((Number(value) * Number(weight)) / 100),
  source: 'computed',
  evidence: `Evidence for ${name}`,
  reason: null,
  note: null,
  criterion: {
    id: '20000000-0000-4000-8000-000000000002',
    code,
    version: 1,
    type: 'KPI',
    name,
    description: null,
    weight_percentage: weight,
    maximum_score: '100',
  },
  ...extra,
})
const scores = [
  score('IMPACT', 'Impact', '15', '0', {
    source: 'no_data',
    evidence: null,
    reason: 'no paired pre/post assessments in the period',
  }),
  score('RELEVANCE', 'Relevance', '15', '82', { evidence: 'Reach 82% of target' }),
  score('COHERENCE', 'Coherence', '85', '90', { evidence: '4 of 6 activities linked' }),
]
const openEvaluation: EvaluationDetail = {
  id: evaluationId,
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
  scores,
}

describe('automatic evaluation workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.readError = false
    state.role = 'MONITORING_AND_EVALUATION_OFFICER'
    state.user = 'evaluator'
    state.generation = 0
    state.evaluation = null
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('offers no rubric, weights, publish or manual score controls', () => {
    state.evaluation = { ...openEvaluation }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.queryByText(/Initial draft rubric/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Publish criteria/ })).toBeNull()
    expect(screen.queryByLabelText(/^Score for/)).toBeNull()
    expect(screen.queryByLabelText(/^Weight/)).toBeNull()
  })

  it('prefills the title and period from the project dates and starts with that request', async () => {
    state.createEvaluation.mockResolvedValue({ ...openEvaluation })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect((screen.getByLabelText('Period start') as HTMLInputElement).value).toBe('2026-01-01')
    expect((screen.getByLabelText('Period end') as HTMLInputElement).value).toBe('2026-03-31')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Evaluation 2026-01-01 to 2026-03-31',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start evaluation' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.createEvaluation.mock.calls[0][1]).toMatchObject({
      title: 'Evaluation 2026-01-01 to 2026-03-31',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    })
  })

  it('shows weight, score and source per criterion with a labeled no-data row and overall', () => {
    state.evaluation = { ...openEvaluation }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('Reach 82% of target')).toBeTruthy()
    expect(screen.getByText('4 of 6 activities linked')).toBeTruthy()
    expect(screen.getByText('No data')).toBeTruthy()
    expect(screen.getByText('no paired pre/post assessments in the period')).toBeTruthy()
    expect(screen.getByText('82 / 100')).toBeTruthy()
    expect(screen.getByText('1 criterion had no data')).toBeTruthy()
    // 0.15 * 82 + 0.85 * 90 = 88.8
    expect(screen.getByText('88.8 / 100')).toBeTruthy()
  })

  it('renders the score table headers with the sticky table head classes', () => {
    state.evaluation = { ...openEvaluation }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getAllByRole('columnheader').map((cell) => cell.className)).toEqual(
      Array(4).fill(
        'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
      ),
    )
  })

  it('shows a manual row without a note as a manual score with no note', () => {
    state.evaluation = {
      ...openEvaluation,
      scores: [score('EFFECT', 'Effectiveness', '100', '99', { source: 'manual', evidence: null })],
    }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('Manual score: no note')).toBeTruthy()
  })

  it('recomputes with the narrative and submits after confirmation', async () => {
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockResolvedValue({ ...openEvaluation })
    state.submit.mockResolvedValue({ ...openEvaluation, status: 'SUBMITTED' })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Notes' } })
    expect(screen.getByRole('button', { name: 'Submit evaluation' }).hasAttribute('disabled')).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }))
    await waitFor(() => expect(state.saveScores).toHaveBeenCalledOnce())
    expect(state.saveScores.mock.calls[0][2]).toEqual({
      expectedUpdatedAt: openEvaluation.updatedAt,
      commentary: 'Notes',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit evaluation' }))
    const confirm = screen.getAllByRole('button', { name: 'Submit evaluation' })
    fireEvent.click(confirm[confirm.length - 1] as HTMLElement)
    await waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
  })

  it('keeps submit locked until the unsaved narrative is recomputed and saved', async () => {
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockResolvedValue({ ...openEvaluation })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    const notice = 'Recompute to save the narrative before submitting.'
    expect(screen.queryByText(notice)).toBeNull()
    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Notes' } })
    expect(screen.getByText(notice)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }))
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('Scores recomputed.'))
    expect(screen.queryByText(notice)).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit evaluation' }).hasAttribute('disabled')).toBe(
      false,
    )
  })

  it('shows the server message when a recompute fails and keeps the narrative unsaved', async () => {
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockRejectedValue(Error('Scores are locked'))
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Evaluation narrative'), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Scores are locked'))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
    expect(screen.getByText('Recompute to save the narrative before submitting.')).toBeTruthy()
  })

  it('sends one request while an operation is pending', () => {
    state.evaluation = { ...openEvaluation }
    state.saveScores.mockReturnValue(new Promise(() => {}))
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    const button = screen.getByRole('button', { name: 'Recompute' })
    act(() => {
      button.click()
      button.click()
    })
    expect(state.saveScores).toHaveBeenCalledOnce()
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('refuses to start a round that ends before it begins', () => {
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2025-12-31' } })
    expect(screen.getByRole('button', { name: 'Start evaluation' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('shows the return reason and keeps it out of the narrative', () => {
    state.evaluation = { ...openEvaluation, returnReason: 'Recheck the scores' }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('Returned for correction: Recheck the scores')).toBeTruthy()
    expect((screen.getByLabelText('Evaluation narrative') as HTMLTextAreaElement).value).toBe('')
  })

  it('shows a read-only role an evaluation-not-started state instead of an error', () => {
    state.role = 'PROGRAM_MANAGER'
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('Evaluation not started')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start evaluation' })).toBeNull()
    expect(state.error).not.toHaveBeenCalled()
  })

  it('shows the scores of a signed-off round without any editing control', () => {
    state.role = 'PROGRAM_MANAGER'
    state.evaluation = { ...openEvaluation, status: 'SIGNED_OFF', overallScore: '76.3' }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getByText('76.3 / 100')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Recompute' })).toBeNull()
  })

  it('lets the Project Manager return a submitted evaluation for correction', async () => {
    state.role = 'PROJECT_MANAGER'
    state.evaluation = { ...openEvaluation, status: 'SUBMITTED' }
    state.returnEvaluation.mockResolvedValue({ ...openEvaluation })
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
    state.evaluation = { ...openEvaluation, status: 'SUBMITTED' }
    state.signoff.mockResolvedValue({ ...openEvaluation, status: 'SIGNED_OFF' })
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign off' }))
    fireEvent.change(screen.getByLabelText('Sign-off feedback'), {
      target: { value: 'Scores agree with the records.' },
    })
    const confirm = screen.getAllByRole('button', { name: 'Sign off' })
    fireEvent.click(confirm[confirm.length - 1] as HTMLElement)
    await waitFor(() => expect(state.signoff).toHaveBeenCalledOnce())
    expect(state.signoff.mock.calls[0][2]).toMatchObject({
      feedback: 'Scores agree with the records.',
    })
  })
})
