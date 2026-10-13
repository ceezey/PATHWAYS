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
})
