import { sampleProjectReport } from '@/features/reports/print/print-report-sample'
import type { GenerateReportRequest } from '@pathways/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: browser.getSession } }),
}))

import { reportsClient } from './reports'

const authUserId = '78200000-0000-4000-8000-000000000001'
const organizationId = '78200000-0000-4000-8000-000000000002'
const userId = '78200000-0000-4000-8000-000000000003'
const projectId = '78200000-0000-4000-8000-000000000004'
const reportId = '78200000-0000-4000-8000-000000000005'
const otherId = '78200000-0000-4000-8000-000000000006'
const formId = '78200000-0000-4000-8000-000000000007'
const updatedAt = '2026-09-27T00:00:00.000Z'
const preview = {
  projectId,
  kind: 'SURVEY_FORM_RESULTS',
  formId,
  columns: ['Answer', 'Count'],
  rows: [['Recorded answer', 'Suppressed']],
  generatedAt: updatedAt,
  unavailableReasons: ['Small cells suppressed.'],
}
const form = { id: otherId, name: 'Fictional form', code: 'SYNTHETIC-1', version: 1 }
const round = {
  id: otherId,
  title: 'Midterm',
  status: 'SIGNED_OFF',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  signedOffAt: null,
  overallScore: '82.5',
}
const summaryPreview = {
  projectId,
  kind: 'PROJECT_SUMMARY',
  formId: null,
  columns: ['Answer', 'Count'],
  rows: [['Recorded answer', 'Suppressed']],
  generatedAt: updatedAt,
  unavailableReasons: ['Small cells suppressed.'],
}
const report = {
  id: reportId,
  name: 'Fictional report',
  type: 'PROJECT_SUMMARY',
  format: 'CSV',
  status: 'GENERATED',
  generatedAt: updatedAt,
  evaluation: null,
}
const generateBody: GenerateReportRequest = {
  clientRequestId: otherId,
  name: 'Fictional report',
  kind: 'PROJECT_SUMMARY',
  format: 'CSV',
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

type Client = typeof reportsClient
type Call = (client: Client, id: string, signal?: AbortSignal) => unknown

const requests: readonly (readonly [string, Call, string, string, unknown, unknown, boolean])[] = [
  [
    'surveyForms',
    (c, id, signal) => c.surveyForms(id, signal),
    '/reports/survey-forms',
    'GET',
    undefined,
    [form],
    true,
  ],
  [
    'evaluationRounds',
    (c, id, signal) => c.evaluationRounds(id, signal),
    '/reports/evaluation-rounds',
    'GET',
    undefined,
    [round],
    true,
  ],
  [
    'reportPreview',
    (c, id, signal) => c.reportPreview(id, 'PROJECT_SUMMARY', signal),
    '/reports/preview?kind=PROJECT_SUMMARY',
    'GET',
    undefined,
    summaryPreview,
    true,
  ],
  [
    'reports',
    (c, id, signal) => c.reports(id, signal),
    '/reports',
    'GET',
    undefined,
    [report],
    true,
  ],
  [
    'generateReport',
    (c, id) => c.generateReport(id, generateBody),
    '/reports',
    'POST',
    JSON.stringify(generateBody),
    { id: reportId, status: 'GENERATED' },
    false,
  ],
]

describe('reportsClient requests', () => {
  it.each(requests)(
    '%s sends the request unchanged and returns the parsed response',
    async (_member, call, suffix, method, body, response, readsSignal) => {
      const controller = new AbortController()
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(reportsClient, projectId, controller.signal)).resolves.toEqual(response)
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
      fetcher.mockResolvedValueOnce(
        json(
          Array.isArray(response)
            ? response.map((row) => ({ ...row, extra: 'x' }))
            : { ...(response as object), extra: 'x' },
        ),
      )
      await expect(call(reportsClient, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each(requests)('%s refuses a malformed project id before any request', (_member, call) => {
    expect(() => call(reportsClient, '../other')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('refuses a report kind outside the catalog before any request', () => {
    expect(() => reportsClient.reportPreview(projectId, 'OTHER' as 'PROJECT_SUMMARY')).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([
    ['form', (c, id) => c.reportPreview(id, 'SURVEY_FORM_RESULTS', undefined, 'not-a-uuid')],
    [
      'evaluation',
      (c, id) => c.reportPreview(id, 'EVALUATION_REPORT', undefined, undefined, 'not-a-uuid'),
    ],
  ] as readonly (readonly [string, Call])[])(
    'refuses a malformed %s id before any request',
    (_name, call) => {
      expect(() => call(reportsClient, projectId)).toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it('puts the form id before the evaluation id in the preview query', async () => {
    fetcher.mockResolvedValueOnce(
      json({ ...summaryPreview, kind: 'EVALUATION_REPORT', formId: otherId }),
    )
    await reportsClient.reportPreview(projectId, 'EVALUATION_REPORT', undefined, otherId, reportId)
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/reports/preview?kind=EVALUATION_REPORT&formId=${otherId}&evaluationId=${reportId}`,
    )
  })
  const sections = {
    reportDate: '2026-09-27',
    information: {
      code: 'SYNTHETIC-1',
      title: 'Fictional',
      status: 'ACTIVE',
      sector: 'Education',
      area: 'Region',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      partners: 'None',
      manager: null,
    },
    overview: [],
  }
  const reportEvaluation = { title: 'Midterm', periodStart: '2026-01-01', periodEnd: '2026-06-30' }
  it.each([
    [
      'a preview with more than 30 columns',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, columns: Array.from({ length: 31 }, () => 'Column') },
    ],
    [
      'a preview with more than 1000 rows',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: Array.from({ length: 1001 }, () => ['Answer']) },
    ],
    [
      'a preview cell over 2000 characters',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: [['x'.repeat(2001)]] },
    ],
    [
      'a preview with more than 20 unavailable reasons',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, unavailableReasons: Array.from({ length: 21 }, () => 'Reason') },
    ],
    [
      'more than 100 survey forms',
      (c, id) => c.surveyForms(id),
      Array.from({ length: 101 }, () => form),
    ],
    ['a survey form version of 0', (c, id) => c.surveyForms(id), [{ ...form, version: 0 }]],
    [
      'more than 100 evaluation rounds',
      (c, id) => c.evaluationRounds(id),
      Array.from({ length: 101 }, () => round),
    ],
    ['more than 100 reports', (c, id) => c.reports(id), Array.from({ length: 101 }, () => report)],
    [
      'a report format outside the catalog',
      (c, id) => c.reports(id),
      [{ ...report, format: 'DOC' }],
    ],
    [
      'a report status outside the catalog',
      (c, id) => c.reports(id),
      [{ ...report, status: 'LOST' }],
    ],
    [
      'a preview generation time that is not a timestamp',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, generatedAt: 'yesterday' },
    ],
    [
      'a preview with a null sections value',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, sections: null },
    ],
    [
      'a preview row with more than 30 cells',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: [Array.from({ length: 31 }, () => 'Cell')] },
    ],
    [
      'a report generation time that is not a timestamp',
      (c, id) => c.reports(id),
      [{ ...report, generatedAt: 'yesterday' }],
    ],
    [
      'a survey form version that is not an integer',
      (c, id) => c.surveyForms(id),
      [{ ...form, version: 1.5 }],
    ],
    [
      'an evaluation round start that is not date-only',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, periodStart: '2026-01-01T00:00:00.000Z' }],
    ],
    [
      'an evaluation round end that is not date-only',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, periodEnd: '2026-06-30T00:00:00.000Z' }],
    ],
    [
      'an evaluation round score that is not a decimal',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, overallScore: '1e2' }],
    ],
    [
      'a generated report with the PDF fallback flag set to false',
      (c, id) => c.generateReport(id, generateBody),
      { id: reportId, status: 'GENERATED', pdfFallback: false },
    ],
    [
      'a report evaluation with an extra key',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: { ...reportEvaluation, extra: 'x' } }],
    ],
    [
      'a report evaluation with a malformed date',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: { ...reportEvaluation, periodStart: '2026' } }],
    ],
    [
      'a preview for another project',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, projectId: otherId },
    ],
    [
      'a preview of another kind',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, kind: 'EVALUATION_REPORT' },
    ],
    [
      'a preview for another form',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, formId: otherId },
    ],
    [
      'a preview without the requested form',
      (c, id) => c.reportPreview(id, 'SURVEY_FORM_RESULTS', undefined, otherId),
      { ...summaryPreview, kind: 'SURVEY_FORM_RESULTS' },
    ],
    [
      'a preview with sections that have an extra key',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, sections: { ...sections, extra: 1 } },
    ],
    [
      'an evaluation round with a draft status',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, status: 'DRAFT' }],
    ],
    [
      'a generated report with another status',
      (c, id) => c.generateReport(id, generateBody),
      { id: reportId, status: 'DRAFT' },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'rejects %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(reportsClient, projectId)).rejects.toThrow('could not be validated')
    },
  )
  it.each([
    [
      'a report without a format, time or evaluation',
      (c, id) => c.reports(id),
      [{ ...report, format: null, generatedAt: null, evaluation: null }],
    ],
    [
      'a report with an evaluation',
      (c, id) => c.reports(id),
      [{ ...report, evaluation: reportEvaluation }],
    ],
    [
      'an evaluation round without a score',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, overallScore: null }],
    ],
    [
      'a preview with sections',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, sections },
    ],
    [
      'a preview row of exactly 30 cells',
      (c, id) => c.reportPreview(id, 'PROJECT_SUMMARY'),
      { ...summaryPreview, rows: [Array.from({ length: 30 }, () => 'Cell')] },
    ],
    [
      'an archived report in the XLS format',
      (c, id) => c.reports(id),
      [{ ...report, format: 'XLS', status: 'ARCHIVED' }],
    ],
    [
      'an archived evaluation round',
      (c, id) => c.evaluationRounds(id),
      [{ ...round, status: 'ARCHIVED' }],
    ],
    [
      'a generated report with the PDF fallback flag',
      (c, id) => c.generateReport(id, generateBody),
      { id: reportId, status: 'GENERATED', pdfFallback: true },
    ],
  ] as readonly (readonly [string, Call, unknown])[])(
    'accepts %s',
    async (_name, call, response) => {
      fetcher.mockResolvedValueOnce(json(response))
      await expect(call(reportsClient, projectId)).resolves.toEqual(response)
    },
  )
})

describe('reportsClient response boundaries', () => {
  it.each([
    { projectId: otherId },
    { kind: 'PROJECT_SUMMARY' },
    { formId: otherId },
    { formId: null },
  ])('rejects a mismatched survey preview context: %j', async (replacement) => {
    fetcher.mockResolvedValueOnce(json({ ...preview, ...replacement }))
    await expect(
      reportsClient.reportPreview(projectId, 'SURVEY_FORM_RESULTS', undefined, formId),
    ).rejects.toThrow('could not be validated')
  })
  it('requests the exact logical form and retains suppression rather than inventing zero', async () => {
    fetcher.mockResolvedValueOnce(json(preview))
    await expect(
      reportsClient.reportPreview(projectId, 'SURVEY_FORM_RESULTS', undefined, formId),
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
    await expect(reportsClient.reportPreview(projectId, 'EVALUATION_REPORT')).resolves.toEqual(
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
    await reportsClient.reportPreview(projectId, 'EVALUATION_REPORT', undefined, undefined, otherId)
    expect(fetcher.mock.calls[0][0]).toBe(
      `http://127.0.0.1:4000/api/projects/${projectId}/reports/preview?kind=EVALUATION_REPORT&evaluationId=${otherId}`,
    )
    fetcher.mockResolvedValueOnce(json([round]))
    await expect(reportsClient.evaluationRounds(projectId)).resolves.toEqual([round])
    fetcher.mockResolvedValueOnce(json([{ ...round, status: 'DRAFT' }]))
    await expect(reportsClient.evaluationRounds(projectId)).rejects.toThrow(
      'could not be validated',
    )
    fetcher.mockResolvedValueOnce(json([{ ...round, createdById: otherId }]))
    await expect(reportsClient.evaluationRounds(projectId)).rejects.toThrow(
      'could not be validated',
    )
  })
  it('parses a project summary preview with sections and rejects unknown section keys', async () => {
    const { sections } = sampleProjectReport
    const body = { ...preview, kind: 'PROJECT_SUMMARY', formId: null, sections }
    fetcher.mockResolvedValueOnce(json(body))
    await expect(reportsClient.reportPreview(projectId, 'PROJECT_SUMMARY')).resolves.toEqual(body)
    fetcher.mockResolvedValueOnce(json({ ...body, sections: { ...sections, extra: 1 } }))
    await expect(reportsClient.reportPreview(projectId, 'PROJECT_SUMMARY')).rejects.toThrow(
      'could not be validated',
    )
  })
  it('rejects a form-bearing response to a non-survey preview', async () => {
    fetcher.mockResolvedValueOnce(json({ ...preview, kind: 'PROJECT_SUMMARY' }))
    await expect(reportsClient.reportPreview(projectId, 'PROJECT_SUMMARY')).rejects.toThrow(
      'could not be validated',
    )
  })
})
