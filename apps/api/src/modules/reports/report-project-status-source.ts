import { readApiEnv } from '@pathways/config'
import type { MetricCell } from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import type { ApplicationIdentity } from '../auth/developer-access'
import type { DashboardsService } from '../dashboards/dashboards.service'
import type { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import type { RulesHumanService } from '../rules/rules-human.service'
import {
  type Figure,
  INDICATOR_CAP,
  type ProjectSections,
  TIMELINE_LABEL,
  clip,
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
  implementingPartnerLinks: Array<{ partner: { name: string } }>
  programManager: { fullName: string } | null
}
const OPEN_ALERTS = ['NEW', 'REVIEWED', 'ACTIONED'] as const
const ALERT_CAP = 10
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
  const unavailableReasons: string[] = []
  const overview = await deps.overview.readInTransaction(tx, actor, projectId)
  const reportDate = overview.businessDate

  const keyFigures = [
    figure(TIMELINE_LABEL, overview.timeline.metric, '', '%', true),
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
        title: clip(row.title),
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
      if (data.indicators.length > INDICATOR_CAP)
        unavailableReasons.push(`Only the first ${INDICATOR_CAP} indicators are shown.`)
    }
  }

  let alerts: ProjectSections['alerts']
  if (can('alerts.read')) {
    const pages = []
    for (const status of OPEN_ALERTS)
      pages.push(
        await deps.rules.listAlertsInTransaction(tx, actor, { projectId, status, limit: '10' }),
      )
    const open = pages.flatMap((page) => page.items)
    if (open.length > ALERT_CAP || pages.some((page) => page.nextCursor))
      unavailableReasons.push(`Only the ${ALERT_CAP} highest-severity open alerts are shown.`)
    alerts = topAlerts(open).map((item) => ({
      title: item.title,
      severity: item.severity,
      explanation: clip(item.explanation),
      evaluatedAt: item.evaluatedAt,
    }))
  } else unavailableReasons.push('Open alerts are not included: alert access is required.')

  const sections: ProjectSections = {
    reportDate,
    information: {
      code: project.code,
      title: clip(project.title),
      status: project.status,
      sector: clip(project.sector ?? 'Not specified'),
      area: clip(project.implementationArea ?? 'Not specified'),
      startDate: day(project.startDate) ?? 'Not specified',
      endDate: day(project.endDate) ?? 'Not specified',
      manager: project.programManager?.fullName ?? null,
      partners: project.implementingPartnerLinks.length
        ? clip(project.implementingPartnerLinks.map((link) => link.partner.name).join(', '), 1000)
        : 'Not specified',
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
