import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common'
import type { DescriptiveAnalytics, SurveyAnalytics, TimelineAnalytics } from '@pathways/shared'
import { faultCause } from '../../prisma/transaction-diagnostic'
import {
  ReportArtifactInputError,
  createReportArtifact,
  reportMime,
} from '../reports/report-artifact'

/** Neutralizes spreadsheet formula prefixes and quotes every field. */
function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export type AnalyticsTable = Array<Array<string | number | null>>

const analyticsTableHeader = [
  'section',
  'key',
  'label',
  'state',
  'value',
  'share',
  'reason',
] as const

/** Serializes an export table as quoted, formula-safe CSV. */
export function analyticsTableCsv(table: AnalyticsTable): string {
  return `${table.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}

/** Aggregate-only table: suppressed cells export as their state with an empty value. */
export function descriptiveAnalyticsTable(data: DescriptiveAnalytics): AnalyticsTable {
  const header = [...analyticsTableHeader]
  const rows: Array<Array<string | number | null>> = [
    ...data.counts.map((row) => [
      'COUNT',
      row.key,
      row.label,
      row.metric.state,
      row.metric.value,
      null,
      row.metric.reason,
    ]),
    ...data.distributions.map((row) => [
      row.section,
      row.key,
      row.label,
      row.metric.state,
      row.metric.value,
      row.share,
      row.metric.reason,
    ]),
    ...data.indicatorSummaries.flatMap((row) => {
      const key = `${row.unitLabel ?? 'no-unit'}|${row.numericKind ?? 'no-kind'}`
      return [
        ['INDICATOR_SUMMARY', key, 'Indicator count', 'AVAILABLE', row.indicatorCount, null, null],
        ['INDICATOR_SUMMARY', key, 'Reported count', 'AVAILABLE', row.reportedCount, null, null],
        [
          'INDICATOR_SUMMARY',
          key,
          'Mean',
          row.mean ? 'AVAILABLE' : 'MISSING',
          row.mean,
          null,
          null,
        ],
        [
          'INDICATOR_SUMMARY',
          key,
          'Minimum',
          row.minimum ? 'AVAILABLE' : 'MISSING',
          row.minimum,
          null,
          null,
        ],
        [
          'INDICATOR_SUMMARY',
          key,
          'Maximum',
          row.maximum ? 'AVAILABLE' : 'MISSING',
          row.maximum,
          null,
          null,
        ],
      ]
    }),
  ]
  return [header, ...rows]
}

type SurveyMetricField = Exclude<keyof SurveyAnalytics['overall'], 'key' | 'label'>

/** Same header/marker convention as the combined CSV; one row per survey group cell. */
export function surveyAnalyticsTable(data: SurveyAnalytics): AnalyticsTable {
  const header = [...analyticsTableHeader]
  const cells: Array<[SurveyMetricField, string]> = [
    ['pairs', 'Paired assessments'],
    ['meanPre', 'Mean PRE_TEST (%)'],
    ['meanPost', 'Mean POST_TEST (%)'],
    ['meanChange', 'Mean change (pp)'],
    ['improved', 'Improved'],
    ['same', 'Same'],
    ['declined', 'Declined'],
  ]
  const rows: Array<Array<string | number | null>> = [
    ...[data.overall, ...data.byActivity].flatMap((group) =>
      cells.map(([field, label]) => {
        const metric = group[field]
        return [
          'SURVEY',
          group.key,
          `${group.label} - ${label}`,
          metric.state,
          metric.value,
          null,
          metric.reason,
        ]
      }),
    ),
  ]
  return [header, ...rows]
}

type TimelineMetricField = Exclude<
  keyof TimelineAnalytics,
  'contractVersion' | 'projectId' | 'generatedAt' | 'reportingDate'
>

/** Same header/marker convention as the combined CSV; one row per timeline metric. */
export function timelineAnalyticsTable(data: TimelineAnalytics): AnalyticsTable {
  const header = [...analyticsTableHeader]
  const cells: Array<[TimelineMetricField, string]> = [
    ['elapsedPercent', 'Timeline elapsed (%)'],
    ['remainingDays', 'Remaining days'],
    ['overdueDays', 'Overdue days'],
    ['activityCompletionPercent', 'Activity completion (%)'],
    ['activityOverdueCount', 'Overdue activities'],
    ['milestoneOnTimePercent', 'Milestones on time (%)'],
  ]
  const rows: Array<Array<string | number | null>> = cells.map(([field, label]) => {
    const metric = data[field]
    return ['TIMELINE', field, label, metric.state, metric.value, null, metric.reason]
  })
  return [header, ...rows]
}
const logger = new Logger('AnalyticsService')

const exportFormats = ['CSV', 'XLSX', 'XLS', 'PDF'] as const
type ExportFormat = (typeof exportFormats)[number]

/** Splits the optional file format off before the strict analytics query parse. */
export function parseExportFormat(input: unknown): { format: ExportFormat; query: unknown } {
  if (!input || typeof input !== 'object') return { format: 'CSV', query: input }
  const { format = 'CSV', ...query } = input as Record<string, unknown>
  if (!exportFormats.includes(format as ExportFormat))
    throw new BadRequestException('Export format must be CSV, XLSX, XLS or PDF.')
  return { format: format as ExportFormat, query }
}

export async function exportArtifact(
  format: ExportFormat,
  title: string,
  table: AnalyticsTable,
  fileBase: string,
) {
  if (format === 'CSV')
    return {
      bytes: Buffer.from(analyticsTableCsv(table), 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      fileName: `${fileBase}.csv`,
    }
  const rows = table.map((row) => row.map((cell) => (cell === null ? '' : String(cell))))
  try {
    return {
      bytes: await createReportArtifact(title, rows, format),
      contentType: reportMime[format],
      fileName: `${fileBase}.${format.toLowerCase()}`,
    }
  } catch (error) {
    if (error instanceof ReportArtifactInputError) throw new BadRequestException(error.message)
    logger.error({
      event: 'PATHWAYS_ANALYTICS_EXPORT_RENDER_FAILED',
      format,
      cause: faultCause(error),
    })
    throw new ServiceUnavailableException(
      `The ${format} file could not be generated on this server. Export CSV instead.`,
    )
  }
}
