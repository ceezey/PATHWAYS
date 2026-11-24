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
  type AnalyticsInsightsQuery,
  type AtomicPermission,
  type BudgetSummary,
  type IndicatorTrends,
  type ParticipationBreakdown,
  analyticsInsightsQuerySchema,
  hasAtomicPermission,
  participationBreakdownSchema,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProject } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { projectEnvelopeWhere } from '../projects/project-budget.service'
import { currentMeasurements, summarizeBudget } from './analytics-insights.helpers'

const logger = new Logger('AnalyticsInsightsService')
const MAX_INDICATORS = 50
const MAX_POINTS = 120

// Participation is the exact aggregate from p06_participation_breakdown, so aggregate-only roles read it too.
const participationPermissions: AtomicPermission[] = [
  'monitoring.read',
  'beneficiaries.aggregates.read',
]

function parseInsightsQuery(value: unknown): AnalyticsInsightsQuery {
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

type Compute<T> = (tx: Tx, actor: ApplicationIdentity, query: AnalyticsInsightsQuery) => Promise<T>

@Injectable()
export class AnalyticsInsightsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private require(actor: ApplicationIdentity, permissions: AtomicPermission[]) {
    const has = (p: AtomicPermission) => hasAtomicPermission(actor.roles[0], actor.permissions, p)
    if (!permissions.every(has))
      throw new ForbiddenException('Required application permission is missing.')
  }

  /** Runs one view: permission checks, project scope, compute, then exactly one audit row. */
  private async run<T>(
    identity: ApplicationIdentity,
    input: unknown,
    view: string,
    permissions: AtomicPermission[],
    compute: Compute<T>,
  ) {
    const query = parseInsightsQuery(input)
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'analytics.descriptive.read',
      async (tx, actor) => {
        try {
          this.require(actor, permissions)
          await requireScopedProject(tx, actor, query.projectId)
          const data = await compute(tx, actor, query)
          await writeAuditLog(tx, actor, {
            projectId: query.projectId,
            action: 'ANALYTICS_DESCRIPTIVE_VIEWED',
            entityType: 'Project',
            entityId: query.projectId,
            changes: {
              view,
              periodStart: query.periodStart ?? null,
              periodEnd: query.periodEnd ?? null,
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
    const compute: Compute<ParticipationBreakdown> = async (tx, _actor, query) => {
      const [row] = await tx.$queryRaw<Array<{ data: unknown }>>`
        SELECT pathways.p06_participation_breakdown(${query.projectId}::uuid,
          ${query.periodStart ?? null}::date, ${query.periodEnd ?? null}::date) AS data`
      return participationBreakdownSchema.parse(row?.data)
    }
    return this.run(identity, input, 'participation-breakdown', participationPermissions, compute)
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
      const envelope = await tx.projectBudgetRecord.findFirst({
        where: projectEnvelopeWhere(actor.organizationId, query.projectId),
        select: { currency: true, plannedBudget: true },
      })
      // Spending covers the whole project; the period is recorded in the audit row but does not filter.
      const entries = await tx.budgetExpenseEntry.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: query.projectId,
          status: { in: ['PENDING', 'VERIFIED', 'APPROVED'] },
        },
        select: { amount: true, status: true, budgetRecord: { select: { currency: true } } },
      })
      return {
        projectId: query.projectId,
        currencies: summarizeBudget(
          envelope,
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
