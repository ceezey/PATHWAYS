import {
  DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
  type DescriptiveAnalytics,
  type DescriptiveSection,
  type MetricCell,
  type MonitoringDashboard,
  type SadddDashboard,
} from '@pathways/shared'

type Bucket = { key: string; label: string; metric: MetricCell }
type Distribution = DescriptiveAnalytics['distributions'][number]

const visible = (cell: MetricCell) => cell.state === 'AVAILABLE' || cell.state === 'ZERO'

/** Four-decimal fixed output without trailing zeros; inputs are already bounded decimals. */
export function formatDescriptiveDecimal(value: number): string {
  const fixed = (Math.round(value * 10_000) / 10_000).toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

/**
 * Shares are derived only when every cell of the section is visible. A suppressed
 * or missing cell withholds all shares so no hidden value can be recovered by
 * subtraction (complementary suppression is preserved, never undone).
 */
function distribution(section: DescriptiveSection, buckets: readonly Bucket[]): Distribution[] {
  const allVisible = buckets.length > 0 && buckets.every((bucket) => visible(bucket.metric))
  const total = allVisible
    ? buckets.reduce((sum, bucket) => sum + Number(bucket.metric.value), 0)
    : 0
  return buckets.map((bucket) => ({
    section,
    key: bucket.key,
    label: bucket.label,
    metric: bucket.metric,
    share:
      allVisible && total > 0
        ? formatDescriptiveDecimal(Number(bucket.metric.value) / total)
        : null,
  }))
}

function indicatorSummaries(indicators: MonitoringDashboard['indicators']) {
  const groups = new Map<string, MonitoringDashboard['indicators']>()
  for (const indicator of indicators) {
    // Different units are never averaged together.
    const key = JSON.stringify([indicator.unitLabel, indicator.numericKind])
    groups.set(key, [...(groups.get(key) ?? []), indicator])
  }
  return [...groups.values()].map((group) => {
    const values = group
      .filter((indicator) => visible(indicator.current))
      .map((indicator) => Number(indicator.current.value))
    return {
      unitLabel: group[0]?.unitLabel ?? null,
      numericKind: group[0]?.numericKind ?? null,
      indicatorCount: group.length,
      reportedCount: values.length,
      mean: values.length
        ? formatDescriptiveDecimal(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
      minimum: values.length ? formatDescriptiveDecimal(Math.min(...values)) : null,
      maximum: values.length ? formatDescriptiveDecimal(Math.max(...values)) : null,
    }
  })
}

/**
 * Builds descriptive statistics exclusively from the already-validated aggregate
 * contracts. SADDD cells arrive banded and suppressed by the p06_saddd release;
 * this function never receives Beneficiary rows.
 */
export function buildDescriptiveAnalytics(input: {
  projectId: string
  monitoring: MonitoringDashboard
  saddd: SadddDashboard | null
  generatedAt: string
}): DescriptiveAnalytics {
  const { monitoring, saddd } = input
  const counts: DescriptiveAnalytics['counts'] = [
    {
      key: 'participationRecords',
      label: 'Participation records',
      metric: monitoring.participationRecords,
    },
    {
      key: 'attendingIndividuals',
      label: 'Attending individuals',
      metric: monitoring.attendingIndividuals,
    },
    {
      key: 'enrolledBeneficiaryRecords',
      label: 'Enrolled Beneficiary records',
      metric: monitoring.enrolledBeneficiaryRecords,
    },
    {
      key: 'enrolledIndividuals',
      label: 'Enrolled individuals',
      metric: monitoring.enrolledIndividuals,
    },
    {
      key: 'indicatorDefinitions',
      label: 'Indicator definitions',
      metric: {
        state: monitoring.indicators.length ? 'AVAILABLE' : 'ZERO',
        value: String(monitoring.indicators.length),
        reason: null,
      },
    },
  ]
  if (saddd) counts.push({ key: 'sadddTotal', label: 'SADDD individuals', metric: saddd.total })
  return {
    contractVersion: DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    monitoringPeriod: {
      periodStart: monitoring.periodStart,
      periodEnd: monitoring.periodEnd,
      businessTimeZone: monitoring.businessTimeZone,
    },
    sadddPeriod: {
      periodStart: saddd?.periodStart ?? null,
      periodEnd: saddd?.periodEnd ?? null,
    },
    sadddReleaseState: saddd?.releaseState ?? 'UNAVAILABLE',
    privacy: {
      threshold: 5,
      complementarySuppression: true,
      source: 'P06_SADDD_RELEASE',
      beneficiaryRows: false,
    },
    counts,
    distributions: [
      ...distribution('ACTIVITY_STATE', monitoring.activities),
      ...distribution('MILESTONE_STATE', monitoring.milestones),
      ...(saddd
        ? [
            ...distribution('SADDD_SEX', saddd.sex),
            ...distribution('SADDD_AGE', saddd.age),
            ...distribution('SADDD_DISABILITY', saddd.disability),
          ]
        : []),
    ],
    indicatorSummaries: indicatorSummaries(monitoring.indicators),
  }
}

/** Neutralizes spreadsheet formula prefixes and quotes every field. */
function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

/** Aggregate-only CSV: suppressed cells export as their state with an empty value. */
export function descriptiveAnalyticsCsv(data: DescriptiveAnalytics): string {
  const header = ['section', 'key', 'label', 'state', 'value', 'share', 'reason']
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
  return `${[header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}
