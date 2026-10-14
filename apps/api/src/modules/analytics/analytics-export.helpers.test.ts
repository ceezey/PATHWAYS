import type { DescriptiveAnalytics, SurveyAnalytics, TimelineAnalytics } from '@pathways/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as reportArtifact from '../reports/report-artifact'
import {
  type AnalyticsTable,
  descriptiveAnalyticsTable,
  exportArtifact,
  parseExportFormat,
  surveyAnalyticsTable,
  timelineAnalyticsTable,
} from './analytics-export.helpers'

const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
const cell = { state: 'MISSING', value: null, reason: 'NO_DATA' }
const group = {
  key: 'OVERALL',
  label: 'All',
  pairs: cell,
  meanPre: cell,
  meanPost: cell,
  meanChange: cell,
  improved: cell,
  same: cell,
  declined: cell,
}

describe('analytics export tables', () => {
  it('starts the descriptive, survey and timeline tables with the same seven-column header', () => {
    const descriptive = { counts: [], distributions: [], indicatorSummaries: [] }
    const survey = { overall: group, byActivity: [] }
    const timeline = Object.fromEntries(
      [
        'elapsedPercent',
        'remainingDays',
        'overdueDays',
        'activityCompletionPercent',
        'activityOverdueCount',
        'milestoneOnTimePercent',
      ].map((field) => [field, cell]),
    )
    expect(descriptiveAnalyticsTable(descriptive as unknown as DescriptiveAnalytics)).toEqual([
      header,
    ])
    expect(surveyAnalyticsTable(survey as unknown as SurveyAnalytics)[0]).toEqual(header)
    expect(timelineAnalyticsTable(timeline as unknown as TimelineAnalytics)[0]).toEqual(header)
  })

  it('writes one survey row per metric under the header', () => {
    const survey = surveyAnalyticsTable({
      overall: group,
      byActivity: [],
    } as unknown as SurveyAnalytics)
    expect(survey).toHaveLength(8)
    expect(survey[1]).toEqual([
      'SURVEY',
      'OVERALL',
      'All - Paired assessments',
      'MISSING',
      null,
      null,
      'NO_DATA',
    ])
  })
})

describe('analytics export file names, formats and empty cells', () => {
  const table: AnalyticsTable = [
    ['section', 'value'],
    ['A', null],
  ]

  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['CSV', 'synthetic-base.csv', 'text/csv; charset=utf-8'],
    ['XLSX', 'synthetic-base.xlsx', reportArtifact.reportMime.XLSX],
    ['XLS', 'synthetic-base.xls', reportArtifact.reportMime.XLS],
    ['PDF', 'synthetic-base.pdf', reportArtifact.reportMime.PDF],
  ] as const)(
    'names the %s file base plus its lowercase extension',
    async (format, fileName, contentType) => {
      const result = await exportArtifact(format, 'Synthetic', table, 'synthetic-base')
      expect(result.fileName).toBe(fileName)
      expect(result.contentType).toBe(contentType)
    },
  )

  it('accepts CSV, XLSX, XLS and PDF, defaults to CSV and rejects any other format', () => {
    for (const format of ['CSV', 'XLSX', 'XLS', 'PDF'])
      expect(parseExportFormat({ projectId: 'p', format })).toEqual({
        format,
        query: { projectId: 'p' },
      })
    expect(parseExportFormat({ projectId: 'p' }).format).toBe('CSV')
    expect(() => parseExportFormat({ projectId: 'p', format: 'DOCX' })).toThrow(
      'Export format must be CSV, XLSX, XLS or PDF.',
    )
  })

  it.each(['XLSX', 'PDF'] as const)(
    'renders a null cell as an empty string in %s rows',
    async (format) => {
      const render = vi
        .spyOn(reportArtifact, 'createReportArtifact')
        .mockResolvedValue(Buffer.from('synthetic'))
      await exportArtifact(format, 'Synthetic', [['A', null, 7]], 'synthetic-base')
      expect(render).toHaveBeenCalledWith('Synthetic', [['A', '', '7']], format)
    },
  )
})
