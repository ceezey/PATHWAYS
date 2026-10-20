import {
  DESCRIPTIVE_ANALYTICS_CONTRACT_VERSION,
  type DescriptiveAnalytics,
  type DescriptiveSection,
  type MetricCell,
  type MonitoringDashboard,
  type SadddDashboard,
} from '@pathways/shared'
import { suppressSmallCount } from '../dashboards/dashboards.helpers'

type Bucket = { key: string; label: string; metric: MetricCell }
type Distribution = DescriptiveAnalytics['distributions'][number]

const visible = (cell: MetricCell) => cell.state === 'AVAILABLE' || cell.state === 'ZERO'

/** Four-decimal fixed output without trailing zeros; inputs are already bounded decimals. */
function formatDescriptiveDecimal(value: number): string {
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
    const group = groups.get(key)
    if (group) group.push(indicator)
    else groups.set(key, [indicator])
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
  // Complementary suppression: a suppressed SADDD total also suppresses every
  // person-derived monitoring count so it cannot be reconstructed by subtraction.
  const sadddTotalHidden = saddd !== null && !visible(saddd.total)
  const person = (metric: MetricCell): MetricCell =>
    sadddTotalHidden && visible(metric) && metric.state !== 'ZERO'
      ? { state: 'SUPPRESSED', value: null, reason: 'COMPLEMENTARY_SUPPRESSION' }
      : suppressSmallCount(metric)
  const counts: DescriptiveAnalytics['counts'] = [
    {
      key: 'participationRecords',
      label: 'Participation records',
      metric: person(monitoring.participationRecords),
    },
    {
      key: 'attendingIndividuals',
      label: 'Attending individuals',
      metric: person(monitoring.attendingIndividuals),
    },
    {
      key: 'enrolledBeneficiaryRecords',
      label: 'Enrolled Beneficiary records',
      metric: person(monitoring.enrolledBeneficiaryRecords),
    },
    // The monitoring individual total duplicates the SADDD total, so it is
    // omitted whenever a SADDD release is present.
    ...(saddd
      ? []
      : [
          {
            key: 'enrolledIndividuals',
            label: 'Enrolled individuals',
            metric: person(monitoring.enrolledIndividuals),
          },
        ]),
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
  if (saddd)
    counts.push({
      key: 'sadddTotal',
      label: 'SADDD individuals',
      metric: suppressSmallCount(saddd.total),
    })
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
