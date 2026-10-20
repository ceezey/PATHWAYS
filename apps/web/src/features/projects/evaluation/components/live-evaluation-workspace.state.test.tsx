/* @vitest-environment jsdom */
import type { EvaluationDetailResponse } from '@pathways/shared'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveEvaluationWorkspace } from './live-evaluation-workspace'

type EvaluationDetail = EvaluationDetailResponse
const state = vi.hoisted(() => ({
  user: 'evaluator',
  generation: 0,
  permissions: [] as string[],
  projectPending: false,
  evaluations: [] as EvaluationDetail[],
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
const evaluator = ['monitoring.read', 'evaluations.submit']
const manager = ['monitoring.read', 'evaluations.approve', 'evaluations.signoff']
const reviewer = ['monitoring.read', 'evaluations.approve']
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      userId: state.user,
      organizationId: 'org',
      roles: [
        state.permissions.includes('evaluations.approve')
          ? 'PROJECT_MANAGER'
          : 'MONITORING_AND_EVALUATION_OFFICER',
      ],
      permissions: state.permissions,
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
    data: state.projectPending ? undefined : { startDate: '2026-01-01', endDate: '2026-03-31' },
    isPending: state.projectPending,
  }),
}))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: () => ({
    data: { projectId, criteria: [], evaluations: state.evaluations, hasMore: false },
    isPending: false,
    isError: false,
    refetch: state.refetch,
  }),
}))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => state.success(...args),
    error: (...args: unknown[]) => state.error(...args),
  },
}))

const round = (
  status: EvaluationDetail['status'],
  extra: Partial<EvaluationDetail> = {},
): EvaluationDetail => ({
  id: '30000000-0000-4000-8000-000000000003',
  title: 'Mid-term 2026',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status,
  updatedAt: '2026-10-01T00:00:00.000Z',
  evaluatedBy: null,
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [],
  ...extra,
})
const scoreRow = (
  code: string,
  name: string,
  index: number,
): EvaluationDetail['scores'][number] => ({
  criterionId: `20000000-0000-4000-8000-00000000000${index}`,
  score: '50',
  maximumScore: '100',
  weightedScore: '10',
  source: 'computed',
  evidence: `Evidence for ${name}`,
  reason: null,
  note: null,
  criterion: {
    id: `20000000-0000-4000-8000-00000000001${index}`,
    code,
    version: 1,
    type: 'KPI',
    name,
    description: null,
    weight_percentage: '20',
    maximum_score: '100',
  },
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const settle = () => act(async () => new Promise((done) => setTimeout(done, 0)))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const inDialog = (name: string) =>
  within(screen.getByRole('dialog')).getByRole('button', { name }) as HTMLButtonElement
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const disabled = (name: string) =>
  (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
const mount = (permissions: string[], ...evaluations: EvaluationDetail[]) => {
  state.permissions = permissions
  state.evaluations = evaluations
  render(<LiveEvaluationWorkspace projectId={projectId} />)
}

const actions = [
  {
    name: 'start',
    permissions: evaluator,
    rounds: [],
    request: () => state.createEvaluation,
    success: 'Evaluation started and scored.',
    fallback: 'Starting an evaluation is unavailable.',
    prepare: () => {},
    fire: () => click('Start evaluation'),
    dialog: false,
  },
  {
    name: 'recompute',
    permissions: evaluator,
    rounds: [round('DRAFT')],
    request: () => state.saveScores,
    success: 'Scores recomputed.',
    fallback: 'Scores could not be recomputed.',
    prepare: () => {},
    fire: () => click('Recompute'),
    dialog: false,
  },
  {
    name: 'submit',
    permissions: evaluator,
    rounds: [round('DRAFT')],
    request: () => state.submit,
    success: 'Evaluation submitted for review.',
    fallback: 'Submission is unavailable.',
    prepare: () => click('Submit evaluation'),
    fire: () => fireEvent.click(inDialog('Submit evaluation')),
    dialog: true,
  },
  {
    name: 'return',
    permissions: manager,
    rounds: [round('SUBMITTED')],
    request: () => state.returnEvaluation,
    success: 'Evaluation returned for correction.',
    fallback: 'Returning this evaluation is unavailable.',
    prepare: () => {
      click('Return for correction')
      type('Reason for returning', 'Recheck the scores')
    },
    fire: () => fireEvent.click(inDialog('Return evaluation')),
    dialog: true,
  },
  {
    name: 'sign off',
    permissions: manager,
    rounds: [round('SUBMITTED')],
    request: () => state.signoff,
    success: 'Evaluation signed off.',
    fallback: 'Sign-off is unavailable.',
    prepare: () => {
      click('Sign off')
      type('Sign-off feedback', 'Scores agree with the records.')
    },
    fire: () => fireEvent.click(inDialog('Sign off')),
    dialog: true,
  },
]

describe('evaluation workspace round gates, dialogs and start form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'evaluator'
    state.generation = 0
    state.projectPending = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it.each(['DRAFT', 'SUBMITTED', 'REVIEWED'] as const)(
    'treats a %s round as open and offers no new round',
    (status) => {
      mount(evaluator, round(status))
      expect(screen.queryByText('Start an evaluation')).toBeNull()
    },
  )

  it.each(['SIGNED_OFF', 'ARCHIVED'] as const)('offers a new round after a %s one', (status) => {
    mount(evaluator, round(status))
    expect(screen.getByText('Start an evaluation')).toBeTruthy()
  })

  it.each(['SUBMITTED', 'REVIEWED'] as const)(
    'lets the score owner edit scores on a draft only, not on a %s round',
    (status) => {
      mount(evaluator, round(status))
      expect(screen.queryByLabelText('Evaluation narrative')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Recompute' })).toBeNull()
      expect(screen.queryByText(/^Review:/)).toBeNull()
    },
  )

  it.each(['DRAFT', 'REVIEWED'] as const)(
    'lets the review owner act on a submitted round only, not on a %s round',
    (status) => {
      mount(manager, round(status))
      expect(screen.queryByText(/^Review:/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Return for correction' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull()
    },
  )

  it('gives the review owner return and sign off but no score editing on a submitted round', () => {
    mount(manager, round('SUBMITTED'))
    expect(screen.getByRole('button', { name: 'Return for correction' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign off' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Recompute' })).toBeNull()
  })

  it('offers sign off only with the sign off permission', () => {
    mount(reviewer, round('SUBMITTED'))
    expect(screen.getByRole('button', { name: 'Return for correction' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign off' })).toBeNull()
  })

  it('shows the return notice on a draft only', () => {
    mount(manager, round('SUBMITTED', { returnReason: 'Recheck the scores' }))
    expect(screen.getByText(/^Review:/)).toBeTruthy()
    expect(screen.queryByText(/Returned for correction:/)).toBeNull()
  })

  it.each([
    ['Return for correction', 'Reason for returning', 'Return evaluation'],
    ['Sign off', 'Sign-off feedback', 'Sign off'],
  ])('keeps the %s dialog confirm disabled until the text is not blank', (open, field, confirm) => {
    mount(manager, round('SUBMITTED'))
    click(open)
    expect(inDialog(confirm).disabled).toBe(true)
    type(field, '   ')
    expect(inDialog(confirm).disabled).toBe(true)
    type(field, ' Reason ')
    expect(inDialog(confirm).disabled).toBe(false)
  })

  it.each([
    ['submit', evaluator, 'DRAFT', 'Submit evaluation', () => state.submit],
    ['return', manager, 'SUBMITTED', 'Return for correction', () => state.returnEvaluation],
    ['sign off', manager, 'SUBMITTED', 'Sign off', () => state.signoff],
  ] as const)(
    'closes the %s dialog on cancel without a request',
    async (_n, role, status, open, request) => {
      mount(role, round(status))
      click(open)
      fireEvent.click(inDialog('Cancel'))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(request()).not.toHaveBeenCalled()
    },
  )

  it('keeps the evaluation table in criterion order, then unknown criteria by name', () => {
    const names = ['Sustainability', 'Zeta', 'Impact', 'Alpha', 'Relevance', 'Coherence']
    const codes = ['SUSTAINABILITY', 'ZETA', 'IMPACT', 'ALPHA', 'RELEVANCE', 'COHERENCE']
    mount(
      evaluator,
      round('SIGNED_OFF', {
        scores: names.map((name, i) => scoreRow(codes[i] as string, name, i)),
      }),
    )
    const rows = [...document.querySelectorAll('tbody tr td:first-child')]
      .map((cell) => cell.textContent ?? '')
      .filter((text) => !text.startsWith('Overall'))
    expect(rows).toEqual(['Relevance', 'Coherence', 'Impact', 'Sustainability', 'Alpha', 'Zeta'])
  })

  it('disables start while the project read is pending', () => {
    state.projectPending = true
    mount(evaluator)
    expect(disabled('Start evaluation')).toBe(true)
  })

  it('disables start for a blank title and for a missing period start', () => {
    mount(evaluator)
    expect(disabled('Start evaluation')).toBe(false)
    type('Title', '   ')
    expect(disabled('Start evaluation')).toBe(true)
    type('Title', 'Round')
    expect(disabled('Start evaluation')).toBe(false)
    type('Period start', '')
    expect(disabled('Start evaluation')).toBe(true)
  })

  it('disables start while a request is pending', () => {
    state.createEvaluation.mockReturnValue(new Promise(() => {}))
    mount(evaluator)
    click('Start evaluation')
    expect(disabled('Start evaluation')).toBe(true)
  })

  it('sends the edited title and period, trimming the title', async () => {
    state.createEvaluation.mockResolvedValue(round('DRAFT'))
    mount(evaluator)
    type('Title', '  Custom round  ')
    type('Period start', '2026-02-01')
    type('Period end', '2026-03-15')
    click('Start evaluation')
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.createEvaluation.mock.calls[0][1]).toMatchObject({
      title: 'Custom round',
      periodStart: '2026-02-01',
      periodEnd: '2026-03-15',
    })
  })

  it('clears the edits and acknowledges the request after a start', async () => {
    state.createEvaluation.mockResolvedValue(round('DRAFT'))
    mount(evaluator)
    click('Start evaluation')
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    await settle()
    click('Start evaluation')
    await waitFor(() => expect(state.createEvaluation).toHaveBeenCalledTimes(2))
    const ids = state.createEvaluation.mock.calls.map((call) => call[1].clientRequestId)
    expect(ids[0]).not.toBe(ids[1])
    type('Title', 'Custom round')
    click('Start evaluation')
    await waitFor(() => expect(state.createEvaluation).toHaveBeenCalledTimes(3))
    await settle()
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
      'Evaluation 2026-01-01 to 2026-03-31',
    )
  })
})

describe('evaluation workspace actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'evaluator'
    state.generation = 0
    state.projectPending = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it.each(actions)('reports the $name success once and refreshes the read', async (action) => {
    action.request().mockResolvedValue({})
    mount(action.permissions, ...action.rounds)
    action.prepare()
    action.fire()
    await waitFor(() => expect(state.success).toHaveBeenCalledWith(action.success))
    expect(state.success).toHaveBeenCalledOnce()
    expect(state.refetch).toHaveBeenCalledOnce()
    expect(state.error).not.toHaveBeenCalled()
    if (action.dialog) await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each(actions)('reports the server message when $name fails', async (action) => {
    action.request().mockRejectedValue(Error('Server says no'))
    mount(action.permissions, ...action.rounds)
    action.prepare()
    action.fire()
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Server says no'))
    expect(state.success).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
    if (action.dialog) expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it.each(actions)('reports a fixed message when $name fails without a message', async (action) => {
    action.request().mockRejectedValue('offline')
    mount(action.permissions, ...action.rounds)
    action.prepare()
    action.fire()
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(action.fallback))
  })

  it('submits with the revision it was read at', async () => {
    state.submit.mockResolvedValue({})
    mount(evaluator, round('DRAFT'))
    click('Submit evaluation')
    fireEvent.click(inDialog('Submit evaluation'))
    await waitFor(() => expect(state.submit).toHaveBeenCalledOnce())
    expect(state.submit.mock.calls[0][2]).toEqual({ expectedUpdatedAt: '2026-10-01T00:00:00.000Z' })
  })

  it('returns with the trimmed reason, then closes and empties the dialog', async () => {
    state.returnEvaluation.mockResolvedValue({})
    mount(manager, round('SUBMITTED'))
    click('Return for correction')
    type('Reason for returning', '  Recheck the scores  ')
    fireEvent.click(inDialog('Return evaluation'))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.returnEvaluation.mock.calls[0][2]).toEqual({
      expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
      reason: 'Recheck the scores',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    click('Return for correction')
    expect((screen.getByLabelText('Reason for returning') as HTMLTextAreaElement).value).toBe('')
  })

  it('signs off with the trimmed feedback, then closes and empties the dialog', async () => {
    state.signoff.mockResolvedValue({})
    mount(manager, round('SUBMITTED'))
    click('Sign off')
    type('Sign-off feedback', '  Scores agree  ')
    fireEvent.click(inDialog('Sign off'))
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce())
    expect(state.signoff.mock.calls[0][2]).toEqual({
      expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
      feedback: 'Scores agree',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    click('Sign off')
    expect((screen.getByLabelText('Sign-off feedback') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('evaluation workspace stale owners and overlapping operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'evaluator'
    state.generation = 0
    state.projectPending = false
    state.refetch.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it.each(actions)('sends no $name request once its owner is stale', (action) => {
    mount(action.permissions, ...action.rounds)
    action.prepare()
    state.generation = 1
    action.fire()
    expect(action.request()).not.toHaveBeenCalled()
  })

  it.each(actions)(
    'ignores a $name response that lands after the owner changed',
    async (action) => {
      const pending = deferred<unknown>()
      action.request().mockReturnValue(pending.promise)
      mount(action.permissions, ...action.rounds)
      action.prepare()
      action.fire()
      state.user = 'other'
      pending.resolve({})
      await settle()
      expect(state.refetch).not.toHaveBeenCalled()
      expect(state.success).not.toHaveBeenCalled()
      if (action.dialog) expect(screen.getByRole('dialog')).toBeTruthy()
    },
  )

  it.each(actions)('ignores a $name failure that lands after the owner changed', async (action) => {
    const pending = deferred<unknown>()
    action.request().mockReturnValue(pending.promise)
    mount(action.permissions, ...action.rounds)
    action.prepare()
    action.fire()
    state.user = 'other'
    pending.reject(Error('Server says no'))
    await settle()
    expect(state.error).not.toHaveBeenCalled()
  })

  it.each(actions)(
    'shows no $name success when the owner changes during the refetch',
    async (action) => {
      const refetch = deferred<unknown>()
      action.request().mockResolvedValue({})
      state.refetch.mockReturnValue(refetch.promise)
      mount(action.permissions, ...action.rounds)
      action.prepare()
      action.fire()
      await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce())
      state.user = 'other'
      refetch.resolve(undefined)
      await settle()
      expect(state.success).not.toHaveBeenCalled()
    },
  )

  it('frees the screen when the owner of a pending operation changes', async () => {
    state.saveScores.mockReturnValue(new Promise(() => {}))
    mount(evaluator, round('DRAFT'))
    click('Recompute')
    expect(disabled('Recompute')).toBe(true)
    state.user = 'other'
    type('Evaluation narrative', 'Notes')
    expect(disabled('Recompute')).toBe(false)
    click('Recompute')
    expect(state.saveScores).toHaveBeenCalledTimes(2)
  })

  it('keeps a newer operation busy when an older stale one finishes', async () => {
    const older = deferred<unknown>()
    state.saveScores.mockReturnValueOnce(older.promise).mockReturnValue(new Promise(() => {}))
    mount(evaluator, round('DRAFT'))
    click('Recompute')
    state.user = 'other'
    type('Evaluation narrative', 'Notes')
    click('Recompute')
    expect(state.saveScores).toHaveBeenCalledTimes(2)
    older.resolve({})
    await settle()
    expect(state.success).not.toHaveBeenCalled()
    expect(disabled('Recompute')).toBe(true)
    click('Recompute')
    expect(state.saveScores).toHaveBeenCalledTimes(2)
  })
})
