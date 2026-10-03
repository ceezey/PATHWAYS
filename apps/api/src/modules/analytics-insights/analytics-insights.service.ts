import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES,
  type AnalyticsInsightsQuery,
  type BudgetSummary,
  type IndicatorTrends,
  type ParticipationBreakdown,
  analyticsInsightsQuerySchema,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { type AtomicPermission, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import type { ApplicationIdentity } from '../auth/developer-access'
import { currentMeasurements, summarizeBudget, suppressBreakdown } from './insights-math'

const logger = new Logger('AnalyticsInsightsService')
const MAX_INDICATORS = 50
const MAX_POINTS = 120

// Participation reads join enrollments, beneficiaries and submissions, whose row policies need these.
const participationPermissions: AtomicPermission[] = [
  'monitoring.read',
  'journeys.read',
  'beneficiaries.records.read',
]
const participationAnyOf: AtomicPermission[] = ['submissions.write', 'assessments.detail.read']

export function parseInsightsQuery(value: unknown): AnalyticsInsightsQuery {
  const parsed = analyticsInsightsQuerySchema.safeParse(value)
  if (!parsed.success)
    throw new BadRequestException(
      'Analytics insights require one authorized project and an optional complete, ordered period.',
    )
  return parsed.data
}

const utcDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
const range = (query: AnalyticsInsightsQuery) =>
  query.periodStart && query.periodEnd
    ? { gte: utcDate(query.periodStart), lte: utcDate(query.periodEnd) }
    : undefined

type Compute<T> = (
  tx: Prisma.TransactionClient,
  actor: ApplicationIdentity,
  query: AnalyticsInsightsQuery,
) => Promise<T>

@Injectable()
export class AnalyticsInsightsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private require(
    actor: ApplicationIdentity,
    permissions: AtomicPermission[],
    anyOf?: AtomicPermission[],
  ) {
    const has = (p: AtomicPermission) => hasAtomicPermission(actor.roles[0], actor.permissions, p)
    if (!permissions.every(has) || (anyOf && !anyOf.some(has)))
      throw new ForbiddenException('Required application permission is missing.')
  }

  /** Runs one view: permission checks, project scope, compute, then exactly one audit row. */
  private async run<T>(
    identity: ApplicationIdentity,
    input: unknown,
    view: string,
    permissions: AtomicPermission[],
    compute: Compute<T>,
    anyOf?: AtomicPermission[],
  ) {
    const query = parseInsightsQuery(input)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'analytics.descriptive.read',
      async (tx, actor) => {
        try {
          this.require(actor, permissions, anyOf)
          const project = await tx.project.findFirst({
            where: { AND: [projectScope(actor), { id: query.projectId }] },
            select: { id: true },
          })
          if (!project) throw new NotFoundException('Project unavailable.')
          const data = await compute(tx, actor, query)
          await tx.auditLog.create({
            data: {
              organizationId: actor.organizationId,
              projectId: query.projectId,
              actorUserId: actor.userId,
              action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
              entityType: 'Project',
              entityId: query.projectId,
              changes: {
                view,
                periodStart: query.periodStart ?? null,
                periodEnd: query.periodEnd ?? null,
              },
            },
          })
          return data
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException ||
            error instanceof BadRequestException
          )
            throw error
          logger.error({ event: 'PATHWAYS_ANALYTICS_INSIGHTS_RETRIEVAL_FAILED', view })
          throw new ServiceUnavailableException('Analytics insights could not be retrieved.')
        }
      },
    )
  }

  participation(identity: ApplicationIdentity, input: unknown) {
    const compute: Compute<ParticipationBreakdown> = async (tx, actor, query) => {
      const groups = await tx.beneficiaryActivityParticipation.groupBy({
        by: ['activityId', 'participationDate', 'attendanceStatus'],
        where: {
          organizationId: actor.organizationId,
          projectId: query.projectId,
          participationDate: range(query),
          enrollment: { is: { beneficiary: { is: { archivedAt: null, isDummyRecord: false } } } },
          activity: { is: { archivedAt: null, status: { not: 'CANCELLED' } } },
          sourceSubmission: { is: { status: 'VALIDATED', isDummyRecord: false } },
        },
        _count: { _all: true },
      })
      const activities = await tx.projectActivity.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: query.projectId,
          id: { in: [...new Set(groups.map((g) => g.activityId))] },
        },
        select: { id: true, title: true },
      })
      const names = new Map(activities.map((a) => [a.id, a.title]))
      const tally = <K>(key: (g: (typeof groups)[number]) => K) => {
        const out = new Map<K, number>()
        for (const g of groups) out.set(key(g), (out.get(key(g)) ?? 0) + g._count._all)
        return out
      }
      const total = groups.reduce((sum, g) => sum + g._count._all, 0)
      const byActivity = suppressBreakdown(
        total,
        [...tally((g) => g.activityId)].map(([activityId, count]) => ({
          activityId,
          activityName: names.get(activityId) ?? 'Activity',
          count,
        })),
      )
      const byMonth = suppressBreakdown(
        total,
        [...tally((g) => g.participationDate.toISOString().slice(0, 7))]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count })),
      )
      const statusCounts = tally((g) => g.attendanceStatus)
      const byStatus = suppressBreakdown(
        total,
        ANALYTICS_INSIGHTS_ATTENDANCE_STATUSES.map((status) => ({
          status,
          count: statusCounts.get(status) ?? 0,
        })),
      )
      return {
        projectId: query.projectId,
        total: byActivity.total,
        totalSuppressed: byActivity.totalSuppressed,
        byActivity: byActivity.items,
        byMonth: byMonth.items,
        byAttendanceStatus: byStatus.items,
      }
    }
    return this.run(
      identity,
      input,
      'participation-breakdown',
      participationPermissions,
      compute,
      participationAnyOf,
    )
  }

  indicatorTrends(identity: ApplicationIdentity, input: unknown) {
    const compute: Compute<IndicatorTrends> = async (tx, actor, query) => {
      const indicators = await tx.projectIndicator.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: query.projectId,
          archivedAt: null,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: MAX_INDICATORS,
        select: { id: true, name: true, unit: true, unitLabel: true, targetValue: true },
      })
      const rows = await tx.projectIndicatorMeasurement.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: query.projectId,
          indicatorId: { in: indicators.map((i) => i.id) },
          periodEnd: range(query),
        },
        orderBy: [{ periodEnd: 'desc' }, { recordedAt: 'desc' }],
        take: MAX_INDICATORS * MAX_POINTS * 4,
        select: {
          id: true,
          indicatorId: true,
          periodStart: true,
          periodEnd: true,
          value: true,
          correctsMeasurementId: true,
          recordedAt: true,
        },
      })
      const points = currentMeasurements(rows)
      return {
        projectId: query.projectId,
        indicators: indicators.map((i) => ({
          indicatorId: i.id,
          name: i.name,
          unit: i.unitLabel ?? i.unit,
          target: i.targetValue === null ? null : Number(i.targetValue),
          points: points
            .filter((p) => p.indicatorId === i.id)
            .slice(-MAX_POINTS)
            .map(({ periodStart, periodEnd, value }) => ({ periodStart, periodEnd, value })),
        })),
      }
    }
    return this.run(
      identity,
      input,
      'indicator-trends',
      ['monitoring.read', 'indicators.read'],
      compute,
    )
  }

  budget(identity: ApplicationIdentity, input: unknown) {
    const compute: Compute<BudgetSummary> = async (tx, actor, query) => {
      const base = { organizationId: actor.organizationId, projectId: query.projectId }
      const budgets = await tx.projectBudgetRecord.findMany({
        where: { ...base, archivedAt: null },
        select: { currency: true, plannedBudget: true },
      })
      const entries = await tx.budgetExpenseEntry.findMany({
        where: {
          ...base,
          status: { in: ['PENDING', 'VERIFIED', 'APPROVED'] },
          expenseDate: range(query),
          budgetRecord: { is: { archivedAt: null } },
        },
        select: { amount: true, status: true, budgetRecord: { select: { currency: true } } },
      })
      return {
        projectId: query.projectId,
        currencies: summarizeBudget(
          budgets,
          entries.map((e) => ({
            currency: e.budgetRecord.currency,
            amount: e.amount,
            status: e.status,
          })),
        ),
      }
    }
    return this.run(
      identity,
      input,
      'budget-summary',
      ['monitoring.read', 'budgets.read', 'expenses.read'],
      compute,
    )
  }
}
