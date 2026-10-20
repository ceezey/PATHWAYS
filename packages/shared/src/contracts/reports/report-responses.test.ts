import { describe, expect, it } from 'vitest'

import {
  evaluationRoundResponse,
  generateReportResponse,
  reportPreviewResponse,
  reportResponse,
  surveyFormResponse,
} from './report-responses'

const uuid = '10000000-0000-4000-8000-000000000001'
const stamp = '2026-09-01T00:00:00.000Z'

describe('report response contracts', () => {
  it('accepts a preview with or without sections and rejects a kind outside the catalog', () => {
    const preview = {
      projectId: uuid,
      kind: 'PROJECT_SUMMARY',
      formId: null,
      columns: ['Title'],
      rows: [['Recorded project']],
      generatedAt: stamp,
      unavailableReasons: [],
    }
    expect(reportPreviewResponse.safeParse(preview).success).toBe(true)
    expect(reportPreviewResponse.safeParse({ ...preview, kind: 'OTHER' }).success).toBe(false)
    expect(reportPreviewResponse.safeParse({ ...preview, sections: {} }).success).toBe(false)
  })

  it('accepts a saved report of any stored type and leaves the kind check to the web client', () => {
    const report = {
      id: uuid,
      name: 'Summary',
      type: 'PROJECT_SUMMARY',
      format: 'PDF',
      status: 'GENERATED',
      generatedAt: stamp,
      evaluation: null,
    }
    expect(reportResponse.safeParse(report).success).toBe(true)
    expect(reportResponse.safeParse({ ...report, type: 'OTHER' }).success).toBe(true)
    expect(reportResponse.safeParse({ ...report, type: 'LEDGER' }).success).toBe(false)
  })

  it('accepts a round, a survey form and the generation receipt', () => {
    const round = {
      id: uuid,
      title: 'Mid-term',
      status: 'SIGNED_OFF',
      periodStart: '2026-01-01',
      periodEnd: '2026-06-30',
      signedOffAt: stamp,
      overallScore: '71.08',
    }
    expect(evaluationRoundResponse.safeParse(round).success).toBe(true)
    expect(
      surveyFormResponse.safeParse({ id: uuid, name: 'Survey', code: 'S', version: 1 }).success,
    ).toBe(true)
    expect(generateReportResponse.safeParse({ id: uuid, status: 'GENERATED' }).success).toBe(true)
    const plain = { id: uuid, status: 'GENERATED', pdfFallback: true }
    expect(generateReportResponse.safeParse(plain).success).toBe(true)
    expect(generateReportResponse.safeParse({ ...plain, pdfFallback: false }).success).toBe(false)
  })
})
