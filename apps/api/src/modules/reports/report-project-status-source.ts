import { readApiEnv } from '@pathways/config'
import type { MetricCell } from '@pathways/shared'
import { Prisma } from '@prisma/client'
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
const BUDGET_CAP = 50
const LINE_LABELS: Record<string, string> = {
  PROJECT_PROFILE_TOTAL: 'Project budget',
  ACTIVITY_PROFILE_TOTAL: 'Activity budget',
}
const money = (value: Prisma.Decimal) =>
  value.toNumber().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Each budget line with its approved spending, spending still in review, and what remains. */
async function budgetRows(tx: Prisma.TransactionClient, organizationId: string, projectId: string) {
  const lines = await tx.projectBudgetRecord.findMany({
    where: { organizationId, projectId, archivedAt: null },
    select: {
      id: true,
      category: true,
      currency: true,
      plannedBudget: true,
      activity: { select: { title: true } },
    },
    orderBy: [{ category: 'desc' }, { id: 'asc' }],
    take: BUDGET_CAP + 1,
  })
  const shown = lines.slice(0, BUDGET_CAP)
  const sums = await tx.budgetExpenseEntry.groupBy({
    by: ['budgetRecordId', 'status'],
    where: {
      organizationId,
      projectId,
      budgetRecordId: { in: shown.map((line) => line.id) },
      status: { not: 'REJECTED' },
    },
    _sum: { amount: true },
  })
  const total = (id: string, approved: boolean) =>
    sums
      .filter((row) => row.budgetRecordId === id && (row.status === 'APPROVED') === approved)
      .reduce((sum, row) => sum.add(row._sum.amount ?? 0), new Prisma.Decimal(0))
  const rows = shown.map((line) => {
    const approved = total(line.id, true)
    const label = LINE_LABELS[line.category] ?? line.category
    return {
      line: clip(line.activity ? `${label}: ${line.activity.title}` : label),
      currency: line.currency,
      planned: money(line.plannedBudget),
      approved: money(approved),
      inReview: money(total(line.id, false)),
      remaining: money(line.plannedBudget.sub(approved)),
    }
  })
  return { rows, capped: lines.length > BUDGET_CAP }
}
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

/** Builds the Project summary sections, reading and showing each one only when its permission is held. */
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
  }

  let indicators: ProjectSections['indicators']
  if (can('monitoring.read')) {
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

  let budget: ProjectSections['budget']
  if (can('budgets.read') && can('expenses.read')) {
    const read = await budgetRows(tx, actor.organizationId, projectId)
    budget = read.rows
    if (read.capped) unavailableReasons.push(`Only the first ${BUDGET_CAP} budget lines are shown.`)
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
  }
  // Areas outside the actor's grants are left out entirely rather than shown as unavailable.
  const inScope: Record<string, boolean> = {
    Schedule: milestones !== undefined,
    Budget: overview.budgetUtilization !== null,
    Indicators: overview.kpiAchievement !== null,
  }

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
    }).filter((row) => inScope[row.area]),
    keyFigures,
    ...(budget ? { budget } : {}),
    ...(milestones ? { milestones } : {}),
    ...(indicators ? { indicators } : {}),
    ...(alerts ? { alerts } : {}),
  }
  return { sections, unavailableReasons }
}
