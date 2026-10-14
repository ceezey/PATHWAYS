import { describe, expect, it } from 'vitest'

import { generateReportRequest, reportPreviewQuery } from './report-requests'

const formId = '10000000-0000-4000-8000-000000000001'
const evaluationId = '20000000-0000-4000-8000-000000000002'
const request = {
  clientRequestId: '30000000-0000-4000-8000-000000000003',
  name: ' Quarterly summary ',
  kind: 'PROJECT_SUMMARY',
  format: 'PDF',
}

describe('report request contracts', () => {
  it.each([
    [{ kind: 'SURVEY_FORM_RESULTS', formId }, true],
    [{ kind: 'EVALUATION_REPORT', evaluationId }, true],
    [{ kind: 'SURVEY_FORM_RESULTS' }, false],
    [{ kind: 'INDICATOR_SUMMARY', formId }, false],
    [{ kind: 'MONITORING_REPORT', evaluationId }, false],
  ])('decides preview %j as %s', (query, accepted) => {
    expect(reportPreviewQuery.safeParse(query).success).toBe(accepted)
  })

  it('keeps the survey refinement message', () => {
    const result = reportPreviewQuery.safeParse({ kind: 'SURVEY_FORM_RESULTS' })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      'Survey reports require a form; other reports do not accept one.',
    ])
  })

  it('trims the report name and refuses an unknown format', () => {
    expect(generateReportRequest.parse(request).name).toBe('Quarterly summary')
    expect(generateReportRequest.safeParse({ ...request, format: 'DOCX' }).success).toBe(false)
  })

  it('keeps the evaluation round message, alone and with the survey message', () => {
    const messages = (query: object) => {
      const result = reportPreviewQuery.safeParse(query)
      return result.success ? [] : result.error.issues.map((issue) => issue.message)
    }
    expect(messages({ kind: 'PROJECT_SUMMARY', evaluationId })).toEqual([
      'Only evaluation reports accept an evaluation round.',
    ])
    expect(messages({ kind: 'SURVEY_FORM_RESULTS', evaluationId })).toEqual([
      'Survey reports require a form; other reports do not accept one.',
      'Only evaluation reports accept an evaluation round.',
    ])
  })

  it.each(['CSV', 'XLSX', 'XLS', 'PDF'])('accepts the format %s', (format) => {
    expect(generateReportRequest.safeParse({ ...request, format }).success).toBe(true)
  })

  it.each(['pdf', 'DOCX', undefined])('rejects the format %j', (format) => {
    expect(generateReportRequest.safeParse({ ...request, format }).success).toBe(false)
  })

  it('bounds the report name at 200 characters and refuses a blank one', () => {
    const parse = (name: string) => generateReportRequest.safeParse({ ...request, name }).success
    expect(parse('x'.repeat(200))).toBe(true)
    expect(parse('x'.repeat(201))).toBe(false)
    expect(parse('   ')).toBe(false)
  })

  it.each(['PROJECT_SUMMARY', 'INDICATOR_SUMMARY', 'BENEFICIARY_SUMMARY', 'MONITORING_REPORT'])(
    'accepts the plain kind %s',
    (kind) => {
      expect(generateReportRequest.safeParse({ ...request, kind }).success).toBe(true)
      expect(reportPreviewQuery.safeParse({ kind }).success).toBe(true)
    },
  )

  it('accepts the survey and evaluation kinds only with their context', () => {
    expect(
      generateReportRequest.safeParse({ ...request, kind: 'SURVEY_FORM_RESULTS', formId }).success,
    ).toBe(true)
    expect(generateReportRequest.safeParse({ ...request, kind: 'EVALUATION_REPORT' }).success).toBe(
      true,
    )
    expect(
      generateReportRequest.safeParse({ ...request, kind: 'EVALUATION_REPORT', evaluationId })
        .success,
    ).toBe(true)
  })

  it.each([undefined, 'OTHER'])('rejects the kind %j', (kind) => {
    expect(generateReportRequest.safeParse({ ...request, kind }).success).toBe(false)
    expect(reportPreviewQuery.safeParse({ kind }).success).toBe(false)
  })

  it.each([
    { kind: 'SURVEY_FORM_RESULTS', formId: 'nope' },
    { kind: 'EVALUATION_REPORT', evaluationId: 'nope' },
    { kind: 'EVALUATION_REPORT', clientRequestId: 'nope' },
  ])('rejects the non-uuid %j', (override) => {
    expect(generateReportRequest.safeParse({ ...request, ...override }).success).toBe(false)
  })

  it('enforces the form and round refinements when generating', () => {
    const parse = (override: object) =>
      generateReportRequest.safeParse({ ...request, ...override }).success
    expect(parse({ kind: 'SURVEY_FORM_RESULTS' })).toBe(false)
    expect(parse({ formId })).toBe(false)
    expect(parse({ evaluationId })).toBe(false)
  })

  it('rejects an unknown key on a preview query and a report request', () => {
    expect(
      reportPreviewQuery.safeParse({ kind: 'PROJECT_SUMMARY', periodStart: 'x' }).success,
    ).toBe(false)
    expect(generateReportRequest.safeParse({ ...request, extra: 1 }).success).toBe(false)
  })
})
