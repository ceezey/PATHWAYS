import { sampleProjectReport } from '@/features/reports/print/print-report-sample'
import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { coreDataClient, coreFeatureClient, downloadCoreArtifact } from './core-feature-client'

const authUserId = '78000000-0000-4000-8000-000000000001'
const organizationId = '78000000-0000-4000-8000-000000000002'
const userId = '78000000-0000-4000-8000-000000000003'
const projectId = '78000000-0000-4000-8000-000000000004'
const expenseId = '78000000-0000-4000-8000-000000000005'
const otherId = '78000000-0000-4000-8000-000000000006'
const formId = '78000000-0000-4000-8000-000000000007'
const updatedAt = '2026-09-27T00:00:00.000Z'
const acknowledgement = {
  id: expenseId,
  projectId,
  status: 'PENDING',
  updatedAt,
  receiptEvidenceId: null,
}
const publication = {
  revision: 1,
  state: 'FOR_REVIEW',
  summary: 'A fictional approved project summary.',
  snapshot: {
    id: projectId,
    title: 'Fictional project',
    code: 'SYNTHETIC-1',
    approvedSummary: 'A fictional approved project summary.',
    area: null,
    sector: null,
    startDate: null,
    endDate: null,
  },
  submittedById: userId,
  approvedById: null,
  publishedById: null,
  updatedAt,
}
const preview = {
  projectId,
  kind: 'SURVEY_FORM_RESULTS',
  formId,
  columns: ['Answer', 'Count'],
  rows: [['Recorded answer', 'Suppressed']],
  generatedAt: updatedAt,
  unavailableReasons: ['Small cells suppressed.'],
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

// Exercise the real foundation fetch/header path and Core stream/Zod boundary.
const fetcher = vi.fn<typeof fetch>()
const click = vi.fn()
const remove = vi.fn()
const append = vi.fn()
let link: { href: string; download: string; click: typeof click; remove: typeof remove }
beforeEach(() => {
  vi.clearAllMocks()
  link = { href: '', download: '', click, remove }
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', {
    cookie: `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId, organizationId, userId }))}`,
    createElement: vi.fn(() => link),
    body: { append },
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
  vi.useRealTimers()
})

function delayedBody(contentType: string) {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
  })
  const response = new Response(body, { headers: { 'Content-Type': contentType } })
  const reader = body.getReader()
  const read = vi.spyOn(reader, 'read')
  const cancel = vi.spyOn(reader, 'cancel')
  const release = vi.spyOn(reader, 'releaseLock')
  vi.spyOn(body, 'getReader').mockReturnValue(reader)
  return {
    response,
    read,
    cancel,
    release,
    send: (bytes: Uint8Array) => controller?.enqueue(bytes),
  }
}

describe('Core client request and strict response boundaries', () => {
  it('uses authenticated scoped headers and preserves a valid expense acknowledgement', async () => {
    fetcher.mockResolvedValueOnce(json(acknowledgement))
    const body = { clientRequestId: otherId, amount: '125.00', description: 'Fictional delivery' }
    await expect(coreDataClient.submitExpense(projectId, body)).resolves.toEqual(acknowledgement)
    expect(fetcher).toHaveBeenCalledWith(
      `http://127.0.0.1:4000/api/projects/${projectId}/finance/expenses`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-test-token',
          'X-Pathways-Organization-Id': organizationId,
          'X-Pathways-User-Id': userId,
        }),
      }),
    )
  })
  it('rejects a validly shaped submission acknowledgement for another project', async () => {
    fetcher.mockResolvedValueOnce(json({ ...acknowledgement, projectId: otherId }))
    await expect(coreDataClient.submitExpense(projectId, {})).rejects.toThrow(
      'could not be validated',
    )
  })
  it('accepts a distinct replacement allocation ID while preserving the scoped request', async () => {
    fetcher.mockResolvedValueOnce(json({ id: otherId, updatedAt }))
    await expect(coreDataClient.replaceBudget(projectId, expenseId, {})).resolves.toEqual({
      id: otherId,
      updatedAt,
    })
    expect(fetcher.mock.calls[0][0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/finance/budgets/${expenseId}`,
    )
    expect(fetcher.mock.calls[0][1]?.method).toBe('PATCH')
  })
  it.each([
    { id: 'malformed', updatedAt },
    { id: otherId, updatedAt, privateNotes: 'Unexpected' },
  ])('rejects an invalid replacement allocation acknowledgement: %j', async (receipt) => {
    fetcher.mockResolvedValueOnce(json(receipt))
    await expect(coreDataClient.replaceBudget(projectId, expenseId, {})).rejects.toThrow(
      'could not be validated',
    )
  })
  it.each([{ projectId: otherId }, { id: otherId }])(
    'rejects a review acknowledgement outside the requested record: %j',
    async (replacement) => {
      fetcher.mockResolvedValueOnce(json({ ...acknowledgement, ...replacement }))
      await expect(coreDataClient.reviewExpense(projectId, expenseId, {})).rejects.toThrow(
        'could not be validated',
      )
    },
  )
  it('rejects a receipt upload acknowledgement for another expense', async () => {
    fetcher.mockResolvedValueOnce(json({ ...acknowledgement, id: otherId }))
    await expect(
      coreDataClient.uploadReceipt(
        projectId,
        expenseId,
        updatedAt,
        new File(['synthetic'], 'receipt.pdf'),
      ),
    ).rejects.toThrow('could not be validated')
    const request = fetcher.mock.calls[0][1]
    expect(request?.body).toBeInstanceOf(FormData)
    expect(request?.headers).not.toHaveProperty('Content-Type')
  })
  it('rejects another expense final sign-off', async () => {
    fetcher.mockResolvedValueOnce(
      json({ expenseId: otherId, signedOffById: userId, signedOffAt: updatedAt }),
    )
    await expect(coreDataClient.signoffExpense(projectId, expenseId)).rejects.toThrow(
      'could not be validated',
    )
  })
  it('binds the evaluation read response to its project', async () => {
    fetcher.mockResolvedValueOnce(
      json({ projectId: otherId, evaluations: [], criteria: [], hasMore: false }),
    )
    await expect(coreDataClient.evaluation(projectId)).rejects.toThrow('could not be validated')
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
        (b: unknown) => coreDataClient.createEvaluation(projectId, b),
        `${base}/evaluations`,
        'POST',
        detail,
        null,
      ],
      [
        'saveEvaluationScores',
        (b: unknown) => coreDataClient.saveEvaluationScores(projectId, evaluationId, b),
        `${base}/evaluations/${evaluationId}/scores`,
        'PATCH',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'submitEvaluation',
        (b: unknown) => coreDataClient.submitEvaluation(projectId, evaluationId, b),
        `${base}/evaluations/${evaluationId}/submit`,
        'POST',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'returnEvaluation',
        (b: unknown) => coreDataClient.returnEvaluation(projectId, evaluationId, b),
        `${base}/evaluations/${evaluationId}/return`,
        'POST',
        detail,
        { ...detail, id: otherId },
      ],
      [
        'signoffEvaluation',
        (b: unknown) => coreDataClient.signoffEvaluation(projectId, evaluationId, b),
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
    await expect(coreDataClient.evaluation(projectId)).resolves.toEqual(body)
    const leaking = structuredClone(body)
    Object.assign(leaking.evaluations[0].scores[0].criterion, { beneficiaryId: otherId })
    fetcher.mockResolvedValueOnce(json(leaking))
    await expect(coreDataClient.evaluation(projectId)).rejects.toThrow('could not be validated')
  })
  it('accepts only the allowlisted publication snapshot for the requested project', async () => {
    fetcher.mockResolvedValueOnce(json(publication))
    await expect(coreFeatureClient.publication(projectId)).resolves.toEqual(publication)
    fetcher.mockResolvedValueOnce(
      json({ ...publication, snapshot: { ...publication.snapshot, id: otherId } }),
    )
    await expect(coreFeatureClient.publication(projectId)).rejects.toThrow('could not be validated')
  })
  it.each(['privateNotes', 'beneficiaries', 'expenseAmount'])(
    'rejects private snapshot field %s',
    async (key) => {
      fetcher.mockResolvedValueOnce(
        json({
          ...publication,
          snapshot: { ...publication.snapshot, [key]: 'synthetic private data' },
        }),
      )
      await expect(coreFeatureClient.publication(projectId)).rejects.toThrow(
        'could not be validated',
      )
    },
  )
  it.each([
    { projectId: otherId },
    { kind: 'PROJECT_SUMMARY' },
    { formId: otherId },
    { formId: null },
  ])('rejects a mismatched survey preview context: %j', async (replacement) => {
    fetcher.mockResolvedValueOnce(json({ ...preview, ...replacement }))
    await expect(
      coreDataClient.reportPreview(projectId, 'SURVEY_FORM_RESULTS', undefined, formId),
    ).rejects.toThrow('could not be validated')
  })
  it('requests the exact logical form and retains suppression rather than inventing zero', async () => {
    fetcher.mockResolvedValueOnce(json(preview))
    await expect(
      coreDataClient.reportPreview(projectId, 'SURVEY_FORM_RESULTS', undefined, formId),
    ).resolves.toEqual(preview)
    expect(fetcher.mock.calls[0][0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/reports/preview?kind=SURVEY_FORM_RESULTS&formId=${formId}`,
    )
  })
  it.each([
    { rows: [['Criterion', 'C1 Relevance', '50']], unavailableReasons: [] },
    { rows: [], unavailableReasons: ['No signed-off evaluation.'] },
  ])('parses an evaluation report preview: %j', async (body) => {
    const evaluation = { ...preview, kind: 'EVALUATION_REPORT', formId: null, ...body }
    fetcher.mockResolvedValueOnce(json(evaluation))
    await expect(coreDataClient.reportPreview(projectId, 'EVALUATION_REPORT')).resolves.toEqual(
      evaluation,
    )
  })
  it('requests an exact evaluation round and parses the rounds list strictly', async () => {
    const round = {
      id: otherId,
      title: 'Midterm',
      status: 'SIGNED_OFF',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      signedOffAt: null,
      overallScore: '82.5',
    }
    fetcher.mockResolvedValueOnce(json({ ...preview, kind: 'EVALUATION_REPORT', formId: null }))
    await coreDataClient.reportPreview(
      projectId,
      'EVALUATION_REPORT',
      undefined,
      undefined,
      otherId,
    )
    expect(fetcher.mock.calls[0][0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/reports/preview?kind=EVALUATION_REPORT&evaluationId=${otherId}`,
    )
    fetcher.mockResolvedValueOnce(json([round]))
    await expect(coreDataClient.evaluationRounds(projectId)).resolves.toEqual([round])
    fetcher.mockResolvedValueOnce(json([{ ...round, status: 'DRAFT' }]))
    await expect(coreDataClient.evaluationRounds(projectId)).rejects.toThrow(
      'could not be validated',
    )
    fetcher.mockResolvedValueOnce(json([{ ...round, createdById: otherId }]))
    await expect(coreDataClient.evaluationRounds(projectId)).rejects.toThrow(
      'could not be validated',
    )
  })
  it('parses a project summary preview with sections and rejects unknown section keys', async () => {
    const { sections } = sampleProjectReport
    const body = { ...preview, kind: 'PROJECT_SUMMARY', formId: null, sections }
    fetcher.mockResolvedValueOnce(json(body))
    await expect(coreDataClient.reportPreview(projectId, 'PROJECT_SUMMARY')).resolves.toEqual(body)
    fetcher.mockResolvedValueOnce(json({ ...body, sections: { ...sections, extra: 1 } }))
    await expect(coreDataClient.reportPreview(projectId, 'PROJECT_SUMMARY')).rejects.toThrow(
      'could not be validated',
    )
  })
  it('rejects a form-bearing response to a non-survey preview', async () => {
    fetcher.mockResolvedValueOnce(json({ ...preview, kind: 'PROJECT_SUMMARY' }))
    await expect(coreDataClient.reportPreview(projectId, 'PROJECT_SUMMARY')).rejects.toThrow(
      'could not be validated',
    )
  })
  it('rejects malformed project paths before fetching', () => {
    expect(() => coreDataClient.evaluation('../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('honors an already aborted read signal before dispatch', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(coreDataClient.evaluation(projectId, controller.signal)).rejects.toThrow(
      'Current workspace access',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('cancels a JSON response arriving after ownership invalidation before reading its body', async () => {
    const response = json({ projectId, evaluations: [], criteria: [] })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    let finish: (value: Response) => void = () => {}
    fetcher.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const rejection = expect(coreDataClient.evaluation(projectId)).rejects.toThrow(
      'Response ownership or format changed',
    )
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    clearSensitiveDraftStorage()
    finish(response)
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('cancels an unexpected JSON response MIME before body parsing', async () => {
    const response = new Response('synthetic unexpected content', {
      headers: { 'Content-Type': 'text/html' },
    })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const read = vi.spyOn(response.body, 'getReader')
    fetcher.mockResolvedValueOnce(response)
    await expect(coreDataClient.evaluation(projectId)).rejects.toThrow(
      'Response ownership or format changed',
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })
  it('drops a body that completes after logout and return to the same cookie owner', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(coreDataClient.evaluation(projectId)).rejects.toThrow(
      'Response unavailable',
    )
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    clearSensitiveDraftStorage()
    delayed.send(
      new TextEncoder().encode(JSON.stringify({ projectId, evaluations: [], criteria: [] })),
    )
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('cancels an oversized JSON body before parsing or accepting it', async () => {
    const delayed = delayedBody('application/json')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(coreDataClient.evaluation(projectId)).rejects.toThrow(
      'Response unavailable',
    )
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    delayed.send(new Uint8Array(2_000_001))
    await rejection
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
})

describe('owned private artifact delivery', () => {
  it('does not save delayed bytes after the local project owner changes', async () => {
    const delayed = delayedBody('application/pdf')
    fetcher.mockResolvedValueOnce(delayed.response)
    const create = vi.spyOn(URL, 'createObjectURL')
    let current = true
    const rejection = expect(
      downloadCoreArtifact(
        `/projects/${projectId}/reports/${otherId}/export`,
        `report-${otherId}.pdf`,
        () => current,
      ),
    ).rejects.toThrow('Artifact unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    current = false
    delayed.send(new TextEncoder().encode('synthetic private bytes'))
    await rejection
    expect(create).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('rejects ownership loss before transport completion without creating a download', async () => {
    const response = new Response('synthetic', { headers: { 'Content-Type': 'application/pdf' } })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    const create = vi.spyOn(URL, 'createObjectURL')
    let finish: (response: Response) => void = () => {}
    fetcher.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const rejection = expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact ownership changed')
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    document.cookie = 'pathways-context=another-owner'
    finish(response)
    await rejection
    expect(cancel).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
  it('cancels artifacts exceeding 10 MiB and never saves them', async () => {
    const delayed = delayedBody('application/pdf')
    fetcher.mockResolvedValueOnce(delayed.response)
    const rejection = expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact unavailable')
    await vi.waitFor(() => expect(delayed.read).toHaveBeenCalled())
    delayed.send(new Uint8Array(10_485_761))
    await rejection
    expect(click).not.toHaveBeenCalled()
    expect(delayed.cancel).toHaveBeenCalledOnce()
    expect(delayed.release).toHaveBeenCalledOnce()
  })
  it('saves valid current bytes with the server MIME extension and releases the object URL', async () => {
    vi.useFakeTimers()
    fetcher.mockResolvedValueOnce(
      new Response('synthetic image bytes', { headers: { 'Content-Type': 'image/png' } }),
    )
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await downloadCoreArtifact('/synthetic-receipt', 'receipt-synthetic.pdf', () => true)
    expect(create).toHaveBeenCalledOnce()
    expect(link.download).toBe('receipt-synthetic.png')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(revoke).toHaveBeenCalledWith('blob:synthetic')
  })
  it('saves a readable report name produced by the reporting workspace', async () => {
    fetcher.mockResolvedValueOnce(
      new Response('synthetic pdf bytes', { headers: { 'Content-Type': 'application/pdf' } }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic')
    await downloadCoreArtifact('/synthetic-artifact', 'Hygiene Kits – Guiuan Evaluation report.pdf')
    expect(link.download).toBe('Hygiene Kits – Guiuan Evaluation report.pdf')
    expect(click).toHaveBeenCalledOnce()
  })
  it.each(['../report.pdf', 'a\\b.pdf', '.hidden.pdf', 'report.exe', `${'a'.repeat(201)}.pdf`])(
    'rejects the unsafe file name %j before fetching',
    async (name) => {
      await expect(downloadCoreArtifact('/synthetic-artifact', name)).rejects.toThrow(
        'Current artifact access is required',
      )
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('rejects an unapproved MIME before saving', async () => {
    const response = new Response('<script>synthetic</script>', {
      headers: { 'Content-Type': 'text/html' },
    })
    if (!response.body) throw new Error('Test response requires a stream')
    const cancel = vi.spyOn(response.body, 'cancel')
    fetcher.mockResolvedValueOnce(response)
    await expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Artifact format unavailable')
    expect(cancel).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })
})
