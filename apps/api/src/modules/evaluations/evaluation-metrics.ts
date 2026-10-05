import { Inject, Injectable } from '@nestjs/common'
import {
  type MetricCell,
  budgetUtilization,
  efficiencyRatio,
  kpiAchievement,
  missingMetric,
} from '@pathways/shared'
import type { Prisma } from '@prisma/client'
import type { ApplicationIdentity } from '../auth/developer-access'
import { IndicatorsService } from '../indicators/indicators.service'

type Tx = Prisma.TransactionClient
const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'

export const computedCriterionTypes = [
  'KPI',
  'TIMELINE_COMPLIANCE',
  'BUDGET_EFFICIENCY',
  'BENEFICIARY_REACH',
] as const
export type ComputedCriterionType = (typeof computedCriterionTypes)[number]

export type ComputedScoreResult =
  | { score: string; commentary: string }
  | { score: null; commentary: string }

export function isComputedCriterionType(type: string): type is ComputedCriterionType {
  return (computedCriterionTypes as readonly string[]).includes(type)
}

// Clamps an uncapped percentage (achievement and efficiency ratios can run below 0 or above 100)
// to the 0-100 range a criterion score can represent; the stored commentary always names the
// unclamped figure so a reviewer can see when a project is ahead of plan rather than on it.
function clampPercent(value: string): number {
  const parsed = Number(value)
  return Math.max(0, Math.min(100, parsed))
}

// Scores and their weighted/overall totals are recomputed exactly in Postgres (p3_guard_score,
// p3_guard_evaluation) from this `score` value and the published criterion; this intermediate
// percent-to-score scaling only has to be stable to four decimal places, so plain float math is
// used rather than the bigint scaled-decimal helpers that guard stored measurements.
function scaleToMax(percent: number, maximumScore: string): string {
  return ((percent / 100) * Number(maximumScore)).toFixed(4)
}

type EvaluationProject = {
  id: string
  startDate: Date | null
  endDate: Date | null
  targetBeneficiaries: number | null
}
type KpiMetric = { metric: MetricCell; indicatorCount: number; reportedCount: number }
type BudgetMetric = { metric: MetricCell; approvedBudget: string | null; countableSpending: string }

/**
 * Deterministic, data-backed scores for the four computable OECD-DAC criterion types (KPI,
 * Timeline compliance, Budget efficiency, Beneficiary reach). Relevance, Coherence and
 * Sustainability (criterion type OTHER) have no system evidence to compute from and are always
 * entered by the Monitoring and Evaluation Officer with a required note. A criterion with
 * missing inputs returns `score: null`; the caller must still accept a manual score and note
 * for it before the evaluation can be submitted.
 */
@Injectable()
export class EvaluationMetricsService {
  constructor(@Inject(IndicatorsService) private readonly indicators: IndicatorsService) {}

  // Scores every computed criterion in one pass. KPI achievement is read from the database at
  // most once per call (not once per criterion): a project indicator query takes long enough in
  // practice that both a KPI criterion and a Budget efficiency criterion independently repeating
  // it risked the per-statement timeout. Budget efficiency reuses that same KPI read.
  async computeMany(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    periodEnd: string,
    criteria: readonly { id: string; type: ComputedCriterionType; maximumScore: string }[],
  ): Promise<Map<string, ComputedScoreResult>> {
    const needsKpi = criteria.some((row) => row.type === 'KPI' || row.type === 'BUDGET_EFFICIENCY')
    const kpi = needsKpi ? await this.kpiMetric(tx, actor, project.id) : null
    const needsBudget = criteria.some((row) => row.type === 'BUDGET_EFFICIENCY')
    const budget = needsBudget ? await this.budgetMetric(tx, actor, project.id) : null
    const results = new Map<string, ComputedScoreResult>()
    for (const criterion of criteria) {
      const result = await (() => {
        switch (criterion.type) {
          case 'KPI':
            return Promise.resolve(this.scoreFromKpi(kpi as KpiMetric, criterion.maximumScore))
          case 'BUDGET_EFFICIENCY':
            return Promise.resolve(
              this.scoreFromBudgetEfficiency(
                (kpi as KpiMetric).metric,
                (budget as BudgetMetric).metric,
                criterion.maximumScore,
              ),
            )
          case 'BENEFICIARY_REACH':
            return this.reach(tx, actor, project, criterion.maximumScore)
          case 'TIMELINE_COMPLIANCE':
            return this.timeline(tx, actor, project, periodEnd, criterion.maximumScore)
        }
      })()
      results.set(criterion.id, result)
    }
    return results
  }

  private async kpiMetric(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
  ): Promise<KpiMetric> {
    const rows = await this.indicators.readInTransaction(tx, actor, [projectId])
    const { metric, indicatorCount, reportedCount } = kpiAchievement(
      rows.map((row) => row.progress),
    )
    return { metric, indicatorCount, reportedCount }
  }

  private scoreFromKpi(
    { metric, indicatorCount, reportedCount }: KpiMetric,
    maximumScore: string,
  ): ComputedScoreResult {
    if (metric.value === null)
      return {
        score: null,
        commentary: `Not computable: ${metric.reason ?? 'no indicator progress available'} (${reportedCount} of ${indicatorCount} project indicators reporting).`,
      }
    const percent = clampPercent(metric.value)
    return {
      score: scaleToMax(percent, maximumScore),
      commentary: `Mean indicator progress to target: ${metric.value}% across ${reportedCount} of ${indicatorCount} project indicators. Score = ${percent}% of the ${maximumScore} maximum.`,
    }
  }

  private async budgetMetric(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
  ): Promise<BudgetMetric> {
    const planned = await tx.projectBudgetRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId,
        activityId: null,
        category: projectBudgetCategory,
        archivedAt: null,
      },
      select: { plannedBudget: true },
    })
    const spent = await tx.budgetExpenseEntry.aggregate({
      where: { organizationId: actor.organizationId, projectId, status: 'APPROVED' },
      _sum: { amount: true },
    })
    const approvedBudget = planned ? planned.plannedBudget.toFixed(2) : null
    const countableSpending = (spent._sum.amount ?? 0).toFixed(2)
    let metric: MetricCell
    try {
      metric = budgetUtilization(approvedBudget, countableSpending)
    } catch {
      metric = missingMetric('OUT_OF_RANGE')
    }
    return { metric, approvedBudget, countableSpending }
  }

  private scoreFromBudgetEfficiency(
    kpi: MetricCell,
    budget: MetricCell,
    maximumScore: string,
  ): ComputedScoreResult {
    const metric = efficiencyRatio(kpi, budget)
    if (metric.value === null)
      return {
        score: null,
        commentary:
          'Not computable: indicator achievement or approved-budget utilization is unavailable for this project.',
      }
    const percent = clampPercent(metric.value)
    return {
      score: scaleToMax(percent, maximumScore),
      commentary: `Indicator achievement (${kpi.value ?? 'unavailable'}%) over budget utilization (${budget.value ?? 'unavailable'}%) = ${metric.value}%, clamped to 100%. Score = ${percent}% of the ${maximumScore} maximum.`,
    }
  }

  private async reach(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    if (!project.targetBeneficiaries)
      return {
        score: null,
        commentary: 'Not computable: the project has no target beneficiary count.',
      }
    const reached = await tx.beneficiaryProjectEnrollment.count({
      where: { organizationId: actor.organizationId, projectId: project.id, status: 'ACTIVE' },
    })
    const percent = clampPercent(((reached / project.targetBeneficiaries) * 100).toFixed(4))
    return {
      score: scaleToMax(percent, maximumScore),
      commentary: `${reached} of ${project.targetBeneficiaries} target beneficiaries enrolled (${((reached / project.targetBeneficiaries) * 100).toFixed(1)}%, clamped to 100%). Score = ${percent}% of the ${maximumScore} maximum.`,
    }
  }

  // Activities due by the evaluation period end that are complete. This is a delivery rate, not
  // an on-time rate: pathways.project_activities has no completion timestamp, so whether a
  // completed activity finished before or after its planned end date cannot be verified here.
  private async timeline(
    tx: Tx,
    actor: ApplicationIdentity,
    project: EvaluationProject,
    periodEnd: string,
    maximumScore: string,
  ): Promise<ComputedScoreResult> {
    const dueBy = new Date(`${periodEnd}T00:00:00.000Z`)
    const where = {
      organizationId: actor.organizationId,
      projectId: project.id,
      status: { not: 'CANCELLED' as const },
      plannedEndDate: { not: null, lte: dueBy },
    }
    const due = await tx.projectActivity.count({ where })
    if (due === 0)
      return {
        score: null,
        commentary: 'Not computable: no activity is due by the evaluation period end.',
      }
    const completed = await tx.projectActivity.count({ where: { ...where, status: 'COMPLETED' } })
    const percent = clampPercent(((completed / due) * 100).toFixed(4))
    return {
      score: scaleToMax(percent, maximumScore),
      commentary: `${completed} of ${due} activities due by the evaluation period end are completed (delivery rate; completion timing against the due date is not tracked). Score = ${percent}% of the ${maximumScore} maximum.`,
    }
  }
}
