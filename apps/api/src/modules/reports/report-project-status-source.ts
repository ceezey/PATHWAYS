import { readApiEnv } from '@pathways/config'
import { type MetricCell, businessCalendarDate } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import {
  type Figure,
  type ProjectSections,
  indicatorRows,
  isOverdue,
  metricPercent,
  overviewRows,
  topAlerts,
} from './report-project-status'
import { monitoringReportPeriod } from './report-sources-extra'

type Deps = {
  overview: Pick<ProjectOverviewMetricsService, 'readInTransaction'>
  dashboards: Pick<DashboardsService, 'monitoringInTransaction'>
  rules: Pick<RulesHumanService, 'listAlertsInTransaction'>
}
type ProjectRow = {
  code: string
  title: string
  status: string
  implementationArea: string | null
  sector: string | null
  startDate: Date | null
  endDate: Date | null
  implementingPartners: string | null
  programManager: { fullName: string } | null
}
const OPEN_ALERTS = new Set(['NEW', 'REVIEWED', 'ACTIONED'])
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null
const figure = (
  label: string,
  cell: MetricCell,
  detail = '',
  suffix = '',
  bar = false,
): Figure => ({
  label,
  state: cell.state,
  value: cell.value === null ? null : `${cell.value}${suffix}`,
  reason: cell.reason,
  detail,
  percent: bar ? metricPercent(cell) : null,
})

/** Builds the Project summary sections, reading each one only when its permission is held. */
export async function projectStatusSource(
  deps: Deps,
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  projectId: string,
  project: ProjectRow,
) {
  const can = (permission: AtomicPermission) =>
    hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  const zone = readApiEnv(process.env).BUSINESS_TIME_ZONE
  const reportDate = businessCalendarDate(new Date(), zone)
  const unavailableReasons: string[] = []
  const overview = await deps.overview.readInTransaction(tx, actor, projectId)

  const keyFigures = [
    figure('Timeline elapsed', overview.timeline.metric, '', '%', true),
    ...(overview.budgetUtilization
      ? [
          figure(
            'Budget used',
            overview.budgetUtilization.metric,
            `Approved ${overview.budgetUtilization.approvedBudget ?? 'not set'}; spent ${overview.budgetUtilization.countableSpending}`,
            '%',
            true,
          ),
        ]
      : []),
    ...(overview.kpiAchievement
      ? [figure('KPI achievement', overview.kpiAchievement.metric, '', '%', true)]
      : []),
    ...(overview.beneficiariesReached
      ? [
          figure(
            'Beneficiaries reached',
            overview.beneficiariesReached.metric,
            overview.beneficiariesReached.target === null
              ? ''
              : `Target ${overview.beneficiariesReached.target}`,
          ),
        ]
      : []),
  ]
  if (!overview.budgetUtilization)
    unavailableReasons.push(
      'Budget figures are not included: budget and expense access is required.',
    )
  if (!overview.kpiAchievement)
    unavailableReasons.push(
      'KPI achievement is not included: indicator and monitoring access is required.',
    )
  if (!overview.beneficiariesReached)
    unavailableReasons.push('Beneficiaries reached is not included: aggregate access is required.')

  let milestones: ProjectSections['milestones']
  if (can('activities.read')) {
    const rows = await tx.projectMilestone.findMany({
      where: { organizationId: actor.organizationId, projectId, archivedAt: null },
      orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
      take: 100,
    })
    milestones = rows.map((row) => {
      const item = { status: row.status as string, targetDate: day(row.targetDate) }
      return {
        title: row.title,
        status: item.status,
        targetDate: item.targetDate,
        completionDate: day(row.completionDate),
        overdue: isOverdue(item, reportDate),
      }
    })
  } else unavailableReasons.push('Milestones are not included: activity access is required.')

  let indicators: ProjectSections['indicators']
  if (!can('monitoring.read'))
    unavailableReasons.push('Indicators are not included: monitoring access is required.')
  else {
    const period = monitoringReportPeriod(project)
    if (!period) unavailableReasons.push('Indicators are not included: project dates are required.')
    else {
      const data = await deps.dashboards.monitoringInTransaction(
        tx,
        actor,
        { projectId, ...period },
        { ...period, businessTimeZone: zone },
      )
      indicators = indicatorRows(data.indicators)
    }
  }

  let alerts: ProjectSections['alerts']
  if (can('alerts.read')) {
    const page = await deps.rules.listAlertsInTransaction(tx, actor, { projectId, limit: '100' })
    alerts = topAlerts(page.items.filter((item) => OPEN_ALERTS.has(item.lifecycle))).map(
      (item) => ({
        title: item.title,
        severity: item.severity,
        explanation: item.explanation,
        evaluatedAt: item.evaluatedAt,
      }),
    )
  } else unavailableReasons.push('Open alerts are not included: alert access is required.')

  const sections: ProjectSections = {
    reportDate,
    information: {
      code: project.code,
      title: project.title,
      status: project.status,
      sector: project.sector ?? 'Not specified',
      area: project.implementationArea ?? 'Not specified',
      startDate: day(project.startDate) ?? 'Not specified',
      endDate: day(project.endDate) ?? 'Not specified',
      manager: project.programManager?.fullName ?? null,
      partners: project.implementingPartners ?? 'Not specified',
    },
    overview: overviewRows({
      reportDate,
      milestones: milestones ?? null,
      timeline: metricPercent(overview.timeline.metric),
      budget: metricPercent(overview.budgetUtilization?.metric ?? null),
      kpi: metricPercent(overview.kpiAchievement?.metric ?? null),
    }),
    keyFigures,
    ...(milestones ? { milestones } : {}),
    ...(indicators ? { indicators } : {}),
    ...(alerts ? { alerts } : {}),
  }
  return { sections, unavailableReasons }
}
