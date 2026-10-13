import type {
  CreateEvaluationRequest,
  ReturnEvaluationRequest,
  SaveEvaluationScoresRequest,
  SignOffEvaluationRequest,
  SubmitEvaluationRequest,
} from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { evaluationsClient } from './evaluations'

const authUserId = '78100000-0000-4000-8000-000000000001'
const organizationId = '78100000-0000-4000-8000-000000000002'
const userId = '78100000-0000-4000-8000-000000000003'
const projectId = '78100000-0000-4000-8000-000000000004'
const evaluationId = '78100000-0000-4000-8000-000000000008'
const otherId = '78100000-0000-4000-8000-000000000006'
const expenseId = '78100000-0000-4000-8000-000000000005'
const enrollmentId = '78100000-0000-4000-8000-000000000020'
const updatedAt = '2026-09-27T00:00:00.000Z'
const detail = {
  id: evaluationId,
  title: 'Mid-term',
  periodLabel: null,
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  overallScore: null,
  commentary: null,
  returnReason: null,
  status: 'DRAFT',
  updatedAt,
  evaluatedBy: null,
  evaluatedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewFeedback: null,
  signedOffBy: null,
  signedOffAt: null,
  scores: [],
}
const createBody: CreateEvaluationRequest = {
  clientRequestId: otherId,
  title: 'Mid-term',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
}
const scoresBody: SaveEvaluationScoresRequest = {
  expectedUpdatedAt: updatedAt,
  commentary: 'Fictional',
}
const submitBody: SubmitEvaluationRequest = { expectedUpdatedAt: updatedAt }
const returnBody: ReturnEvaluationRequest = { expectedUpdatedAt: updatedAt, reason: 'Fictional' }
const signoffBody: SignOffEvaluationRequest = {
  expectedUpdatedAt: updatedAt,
  feedback: 'Fictional',
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch and header path and the owned JSON read.
const fetcher = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
  })
  vi.stubGlobal('fetch', fetcher)
  browser.getSession.mockResolvedValue({
    data: { session: { access_token: 'synthetic-test-token', user: { id: authUserId } } },
    error: null,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type Client = typeof evaluationsClient
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'evaluation',
    (c, id, signal) => c.evaluation(id, signal),
    '/evaluation',
    'GET',
    undefined,
    { projectId, criteria: [], evaluations: [detail], hasMore: false },
    true,
  ],
  [
    'createEvaluation',
    (c, id) => c.createEvaluation(id, createBody),
    '/evaluation/evaluations',
    'POST',
    JSON.stringify(createBody),
    detail,
    false,
  ],
  [
    'saveEvaluationScores',
    (c, id) => c.saveEvaluationScores(id, evaluationId, scoresBody),
    `/evaluation/evaluations/${evaluationId}/scores`,
    'PATCH',
    JSON.stringify(scoresBody),
    detail,
    false,
  ],
  [
    'submitEvaluation',
    (c, id) => c.submitEvaluation(id, evaluationId, submitBody),
    `/evaluation/evaluations/${evaluationId}/submit`,
    'POST',
    JSON.stringify(submitBody),
    detail,
    false,
  ],
  [
    'returnEvaluation',
    (c, id) => c.returnEvaluation(id, evaluationId, returnBody),
    `/evaluation/evaluations/${evaluationId}/return`,
    'POST',
    JSON.stringify(returnBody),
    detail,
    false,
  ],
  [
    'signoffEvaluation',
    (c, id) => c.signoffEvaluation(id, evaluationId, signoffBody),
    `/evaluation/evaluations/${evaluationId}/signoff`,
    'POST',
    JSON.stringify(signoffBody),
    detail,
    false,
  ],
]

describe('evaluationsClient requests', () => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(evaluationsClient, projectId, controller.signal)).resolves.toEqual(response)
      const [url, init] = fetcher.mock.calls[0]
      expect(String(url)).toBe(`http://127.0.0.1:4000/api/projects/${projectId}${suffix}`)
      expect(init?.method ?? 'GET').toBe(method)
      expect(init?.body).toEqual(body)
      expect(init?.signal).toBe(readsSignal ? controller.signal : undefined)
    },
  )
  it.each(requests)(
    '%s rejects a response with an unknown key',
    async (_member, call, _suffix, _method, _body, response) => {
      fetcher.mockResolvedValueOnce(json({ ...(response as object), extra: 'x' }))
      await expect(call(evaluationsClient, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(evaluationsClient, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['saveEvaluationScores', (c, id) => c.saveEvaluationScores(id, 'not-a-uuid', scoresBody)],
    ['submitEvaluation', (c, id) => c.submitEvaluation(id, 'not-a-uuid', submitBody)],
    ['returnEvaluation', (c, id) => c.returnEvaluation(id, 'not-a-uuid', returnBody)],
    ['signoffEvaluation', (c, id) => c.signoffEvaluation(id, 'not-a-uuid', signoffBody)],
  ] as readonly (readonly [string, Call])[])(
    '%s refuses a malformed evaluation id before any request',
    (_member, call) => {
      expect(() => call(evaluationsClient, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['saveEvaluationScores', (c, id) => c.saveEvaluationScores(id, evaluationId, scoresBody)],
    ['submitEvaluation', (c, id) => c.submitEvaluation(id, evaluationId, submitBody)],
    ['returnEvaluation', (c, id) => c.returnEvaluation(id, evaluationId, returnBody)],
    ['signoffEvaluation', (c, id) => c.signoffEvaluation(id, evaluationId, signoffBody)],
  ] as readonly (readonly [string, Call])[])(
    '%s rejects a response for another evaluation',
    async (_member, call) => {
      fetcher.mockResolvedValueOnce(json({ ...detail, id: otherId }))
      await expect(call(evaluationsClient, projectId)).rejects.toThrow('could not be validated')
    },
  )
  const criterion = {
    id: otherId,
    code: 'REL',
    name: 'Relevance',
    description: null,
    type: 'OTHER',
    version: 1,
    weightPercentage: '60',
    maximumScore: '100',
    status: 'PUBLISHED',
    updatedAt,
  }
  const score = {
    criterionId: otherId,
    score: '50',
    maximumScore: '100',
    weightedScore: '30',
    source: 'manual',
    evidence: null,
    reason: null,
    note: null,
    criterion: {
      id: otherId,
      code: 'REL',
      version: 1,
      type: 'OTHER',
      name: 'Relevance',
      description: null,
      weight_percentage: '60',
      maximum_score: '100',
    },
  }
  const person = { id: userId, name: 'Fictional' }
  const populated = {
    projectId,
    criteria: [criterion],
    evaluations: [{ ...detail, scores: [score], evaluatedBy: person }],
    hasMore: false,
  }
  it('parses a populated evaluation read', async () => {
    fetcher.mockResolvedValueOnce(json(populated))
    await expect(evaluationsClient.evaluation(projectId)).resolves.toEqual(populated)
  })
  it.each([
    [
      'more than 20 evaluations',
      { ...populated, evaluations: Array.from({ length: 21 }, () => detail) },
    ],
    [
      'more than 100 criteria',
      { ...populated, criteria: Array.from({ length: 101 }, () => criterion) },
    ],
    [
      'more than 100 scores',
      {
        ...populated,
        evaluations: [{ ...detail, scores: Array.from({ length: 101 }, () => score) }],
      },
    ],
    [
      'a criterion type outside the catalog',
      { ...populated, criteria: [{ ...criterion, type: 'MADE_UP' }] },
    ],
    [
      'a criterion status outside the catalog',
      { ...populated, criteria: [{ ...criterion, status: 'MADE_UP' }] },
    ],
    [
      'a fractional criterion version',
      { ...populated, criteria: [{ ...criterion, version: 1.5 }] },
    ],
    [
      'a score source outside the catalog',
      { ...populated, evaluations: [{ ...detail, scores: [{ ...score, source: 'guess' }] }] },
    ],
    [
      'an evaluation status outside the catalog',
      { ...populated, evaluations: [{ ...detail, status: 'DONE' }] },
    ],
    [
      'a person reference with an extra key',
      { ...populated, evaluations: [{ ...detail, evaluatedBy: { ...person, email: 'x' } }] },
    ],
    ['a read for another project', { ...populated, projectId: otherId }],
    ['a response without hasMore', { projectId, criteria: [], evaluations: [] }],
  ])('rejects %s', async (_name, response) => {
    fetcher.mockResolvedValueOnce(json(response))
    await expect(evaluationsClient.evaluation(projectId)).rejects.toThrow('could not be validated')
  })
})

const assessment = {
  id: '78100000-0000-4000-8000-000000000021',
  type: 'PRE_TEST',
  activityId: null,
  stageId: null,
  score: '40',
  maximumScore: '50',
  assessmentDate: '2026-09-01',
  recordedAt: '2026-09-02T00:00:00.000Z',
}
describe('evaluationsClient beneficiary assessment list read', () => {
  it('requests the enrollment-scoped list with the signal and parses the rows', async () => {
    const controller = new AbortController()
    fetcher.mockResolvedValueOnce(json([assessment]))
    await expect(
      evaluationsClient.getBeneficiaryAssessments(projectId, enrollmentId, controller.signal),
    ).resolves.toEqual([assessment])
    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/evaluation/assessments?enrollmentId=${enrollmentId}`,
    )
    expect(init?.signal).toBe(controller.signal)
  })
  it('rejects a malformed row', async () => {
    fetcher.mockResolvedValueOnce(json([{ ...assessment, score: 40 }]))
    await expect(
      evaluationsClient.getBeneficiaryAssessments(projectId, enrollmentId),
    ).rejects.toThrow(PathwaysClientError)
  })
  it('encodes both ids in the request', async () => {
    fetcher.mockResolvedValueOnce(json([]))
    await evaluationsClient.getBeneficiaryAssessments('a/b c', 'd&e=f')
    expect(String(fetcher.mock.calls[0][0])).toBe(
      'http://127.0.0.1:4000/api/projects/a%2Fb%20c/evaluation/assessments?enrollmentId=d%26e%3Df',
    )
  })
  it('keeps only the known keys of a row with a stage id', async () => {
    fetcher.mockResolvedValueOnce(json([{ ...assessment, stageId: otherId, extra: 'x' }]))
    await expect(
      evaluationsClient.getBeneficiaryAssessments(projectId, enrollmentId),
    ).resolves.toEqual([{ ...assessment, stageId: otherId }])
  })
  it.each([
    ['more than 100 rows', Array.from({ length: 101 }, () => assessment)],
    ['a response that is not a list', { rows: [assessment] }],
    ['a numeric id', [{ ...assessment, id: 1 }]],
    ['a numeric activity id', [{ ...assessment, activityId: 1 }]],
    ['a numeric stage id', [{ ...assessment, stageId: 1 }]],
    ['a type outside the catalog', [{ ...assessment, type: 'EXAM' }]],
    ['a numeric maximum score', [{ ...assessment, maximumScore: 50 }]],
    ['a numeric assessment date', [{ ...assessment, assessmentDate: 20260901 }]],
    ['a numeric recorded time', [{ ...assessment, recordedAt: 1 }]],
  ])('rejects %s', async (_name, response) => {
    fetcher.mockResolvedValueOnce(json(response))
    await expect(
      evaluationsClient.getBeneficiaryAssessments(projectId, enrollmentId),
    ).rejects.toThrow(PathwaysClientError)
  })
})

describe('evaluationsClient response boundaries', () => {
  it('binds the evaluation read response to its project', async () => {
    fetcher.mockResolvedValueOnce(
      json({ projectId: otherId, evaluations: [], criteria: [], hasMore: false }),
    )
    await expect(evaluationsClient.evaluation(projectId)).rejects.toThrow('could not be validated')
  })
  describe('evaluation mutations', () => {
    const evaluationId = '78000000-0000-4000-8000-000000000008'
    const detail = {
      id: evaluationId,
      title: 'Mid-term',
      periodLabel: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      overallScore: null,
      commentary: null,
      returnReason: null,
      status: 'DRAFT',
      updatedAt,
      evaluatedBy: null,
      evaluatedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewFeedback: null,
      signedOffBy: null,
      signedOffAt: null,
      scores: [],
    }
    const body = { synthetic: 'body' }
    const base = `/projects/${projectId}/evaluation`
    const cases = [
      [
        'createEvaluation',
        (b: unknown) => evaluationsClient.createEvaluation(projectId, b as CreateEvaluationRequest),
        `${base}/evaluations`,
        'POST',
        detail,
        null,
      ],
      [
        'saveEvaluationScores',
        (b: unknown) =>
          evaluationsClient.saveEvaluationScores(
            projectId,
            evaluationId,
            b as SaveEvaluationScoresRequest,
          ),
        `${base}/evaluations/${evaluationId}/scores`,
        'PATCH',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'submitEvaluation',
        (b: unknown) =>
          evaluationsClient.submitEvaluation(projectId, evaluationId, b as SubmitEvaluationRequest),
        `${base}/evaluations/${evaluationId}/submit`,
        'POST',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'returnEvaluation',
        (b: unknown) =>
          evaluationsClient.returnEvaluation(projectId, evaluationId, b as ReturnEvaluationRequest),
        `${base}/evaluations/${evaluationId}/return`,
        'POST',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'signoffEvaluation',
        (b: unknown) =>
          evaluationsClient.signoffEvaluation(
            projectId,
            evaluationId,
            b as SignOffEvaluationRequest,
          ),
        `${base}/evaluations/${evaluationId}/signoff`,
        'POST',
        detail,
        { ...detail, id: otherId },
      ],
    ] as const
    it.each(cases)(
      '%s sends the request unchanged and binds the response',
      async (_name, call, url, method, ok, mismatched) => {
        fetcher.mockResolvedValueOnce(json(ok))
        await expect(call(body)).resolves.toEqual(ok)
        const [calledUrl, init] = fetcher.mock.calls[0]
        expect(String(calledUrl).endsWith(`/api${url}`)).toBe(true)
        expect(init?.method).toBe(method)
        expect(init?.body).toBe(JSON.stringify(body))
        if (mismatched) {
          fetcher.mockResolvedValueOnce(json(mismatched))
          await expect(call(body)).rejects.toThrow('could not be validated')
        }
      },
    )
    it.each(cases.filter((row) => row[4] === detail))(
      '%s rejects a detail without returnReason or with an extra key',
      async (_name, call) => {
        const { returnReason: _omitted, ...missing } = detail
        fetcher.mockResolvedValueOnce(json(missing))
        await expect(call(body)).rejects.toThrow('could not be validated')
        fetcher.mockResolvedValueOnce(json({ ...detail, extra: 'x' }))
        await expect(call(body)).rejects.toThrow('could not be validated')
      },
    )
  })
  it('parses a populated evaluation response and rejects an extra snapshot key', async () => {
    const criterion = {
      id: otherId,
      code: 'REL',
      version: 1,
      type: 'OTHER',
      name: 'Relevance',
      description: null,
      weight_percentage: '60',
      maximum_score: '100',
    }
    const evaluation = {
      id: expenseId,
      title: 'Mid-term',
      periodLabel: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      overallScore: '80',
      commentary: null,
      returnReason: null,
      status: 'SUBMITTED',
      updatedAt,
      evaluatedBy: { id: userId, name: 'Evaluator' },
      evaluatedAt: updatedAt,
      reviewedBy: null,
      reviewedAt: null,
      reviewFeedback: null,
      signedOffBy: null,
      signedOffAt: null,
      scores: [
        {
          criterionId: otherId,
          score: '80',
          maximumScore: '100',
          weightedScore: '48',
          source: 'no_data',
          evidence: null,
          reason: 'no paired pre/post assessments in the period',
          note: null,
          criterion,
        },
      ],
    }
    const body = { projectId, criteria: [], evaluations: [evaluation], hasMore: false }
    fetcher.mockResolvedValueOnce(json(body))
    await expect(evaluationsClient.evaluation(projectId)).resolves.toEqual(body)
    const leaking = structuredClone(body)
    Object.assign(leaking.evaluations[0].scores[0].criterion, { beneficiaryId: otherId })
    fetcher.mockResolvedValueOnce(json(leaking))
    await expect(evaluationsClient.evaluation(projectId)).rejects.toThrow('could not be validated')
  })
  it('rejects malformed project paths before fetching', () => {
    expect(() => evaluationsClient.evaluation('../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
