import { overviewMetricLabel } from '@/features/projects/project-utils'
import type { DashboardMetric } from '@/types/pathways'
import type { MonitoringDashboard } from '@pathways/shared'

const PERIOD_NOTE = 'Covers the last 12 months.'

/** Role dashboard reach cards; suppressed and withheld counts keep their label instead of reading 0. */
export const monitoringReachMetrics = (result: MonitoringDashboard): DashboardMetric[] => [
  {
    id: 'projects',
    label: 'Authorized projects',
    value: String(result.scopeProjectCount),
    helperText: 'Server-derived project scope.',
  },
  {
    id: 'participation',
    label: 'Participation records',
    value: overviewMetricLabel(result.participationRecords, 'count'),
    helperText: `Committed records, not a count of people. ${PERIOD_NOTE}`,
  },
  {
    id: 'attending',
    label: 'Distinct attending individuals',
    value: overviewMetricLabel(result.attendingIndividuals, 'count'),
    helperText: `Present/completed attendance; deduplicated across projects. ${PERIOD_NOTE}`,
  },
  {
    id: 'enrolled',
    label: 'Enrolled individuals',
    value: overviewMetricLabel(result.enrolledIndividuals, 'count'),
    helperText: 'Enrollment overlaps the last 12 months; privacy suppression applies.',
  },
]
